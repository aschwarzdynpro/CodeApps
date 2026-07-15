import type { UserRef, WorkingSolution } from '../types/solution'
import type {
  ComparerEnvState,
  ComparerResult,
  ComparerRow,
} from '../types/comparer'
import { recomputeDrift } from '../types/comparer'
import type { FlowComparerService } from './flowComparerService'
import { mockFlowComparerService } from './mockFlowComparerService'
import { powerModeReady } from '../PowerProvider'
import {
  fetchXmlAllPages,
  fetchXmlEscape,
  fetchXmlQuery,
  formattedValue,
  rowNum,
  rowStr,
  type Row,
} from './currentEnvQuery'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'
import {
  ENVIRONMENTS,
  currentEnvKey,
  environmentIdForEnvKey,
  flowDefinitionConfig,
  flowDetailsUrl,
  orgUrlForEnvKey,
  type FlowDefinitionConfig,
} from '../config'

/** Ids per OData `or` chunk (URL-length safe). */
const ID_CHUNK = 20

/** One flow's defined state from the definition table: the wanted On/Off plus
 *  the optional Area (OptionSet label) used for grouping. */
interface DefState {
  label: string
  active: boolean
  area?: string
}

const FLOW_ATTRS =
  `<attribute name="workflowid" />` +
  `<attribute name="workflowidunique" />` +
  `<attribute name="name" />` +
  `<attribute name="statecode" />` +
  `<attribute name="modifiedon" />` +
  `<attribute name="ismanaged" />` +
  `<attribute name="ownerid" />`

// Outer join to the owner user so the cell can show a name (the connector's
// formatted value for ownerid isn't reliable). Aliased attributes arrive keyed
// as `ow.fullname` etc. Appended INSIDE the <entity> of every workflow read.
const OWNER_LINK =
  `<link-entity name="systemuser" from="systemuserid" to="ownerid" link-type="outer" alias="ow">` +
  `<attribute name="fullname" />` +
  `<attribute name="domainname" />` +
  `</link-entity>`

/** Map one workflow row → the environment cell (statecode 1 = Activated). */
function flowState(row: Row, envKey: string): ComparerEnvState {
  const active = rowNum(row.statecode) === 1
  const unique = rowStr(row.workflowidunique)
  const ownerName =
    rowStr(row['ow.fullname']) ||
    rowStr(row['ow.domainname']) ||
    formattedValue(row, 'ownerid') ||
    ''
  return {
    present: true,
    active,
    statusLabel: active ? 'Activated' : 'Draft',
    modifiedOn: rowStr(row.modifiedon),
    isManaged: row.ismanaged === true,
    link: unique
      ? flowDetailsUrl(environmentIdForEnvKey(envKey), unique)
      : undefined,
    ownerId: rowStr(row._ownerid_value),
    ownerName: ownerName || undefined,
  }
}

const MISSING: ComparerEnvState = {
  present: false,
  active: false,
  statusLabel: 'Missing',
}

class DataverseFlowComparerService implements FlowComparerService {
  async compareFlows(
    solution: WorkingSolution,
    onProgress?: (message: string) => void,
  ): Promise<ComparerResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockFlowComparerService.compareFlows(solution, onProgress)

    const envKeys = ENVIRONMENTS.map((e) => e.key)
    const hostKey = currentEnvKey()

    // 1) Host = source of truth: the release solution's cloud flows via the
    //    solutioncomponent (type 29) → solution (unique name) link-entity.
    onProgress?.('Reading flows from the current environment…')
    const solutionLink =
      `<link-entity name="solutioncomponent" from="objectid" to="workflowid" link-type="inner">` +
      `<filter><condition attribute="componenttype" operator="eq" value="29" /></filter>` +
      `<link-entity name="solution" from="solutionid" to="solutionid" link-type="inner">` +
      `<filter><condition attribute="uniquename" operator="eq" value="${fetchXmlEscape(solution.uniqueName)}" /></filter>` +
      `</link-entity></link-entity>`
    const hostFetch =
      `<fetch><entity name="workflow">${FLOW_ATTRS}` +
      `<filter type="and">` +
      `<condition attribute="category" operator="eq" value="5" />` +
      `<condition attribute="type" operator="eq" value="1" />` +
      `</filter>${solutionLink}${OWNER_LINK}<order attribute="name" /></entity></fetch>`
    const hostRows = await fetchXmlQuery(
      'workflows',
      hostFetch,
      orgUrlForEnvKey(hostKey),
    )

    const rowsById = new Map<string, ComparerRow>()
    for (const r of hostRows) {
      const id = rowStr(r.workflowid)
      if (!id || rowsById.has(id)) continue
      rowsById.set(id, {
        id,
        name: rowStr(r.name) || id,
        uniqueId: rowStr(r.workflowidunique) || undefined,
        byEnv: { [hostKey]: flowState(r, hostKey) },
        statusDrift: false,
      })
    }
    const ids = [...rowsById.keys()]

    // 2) Every OTHER env: look those same ids up by workflowid.
    const envErrors: ComparerResult['envErrors'] = {}
    for (const env of ENVIRONMENTS) {
      if (env.key === hostKey || ids.length === 0) continue
      onProgress?.(`Looking up flows in ${env.label}…`)
      try {
        const byId = await this.readByIds(env.key, ids)
        for (const id of ids) {
          const row = rowsById.get(id)
          if (!row) continue
          const hit = byId.get(id)
          row.byEnv[env.key] = hit ? flowState(hit, env.key) : MISSING
        }
      } catch (err) {
        envErrors[env.key] = err instanceof Error ? err.message : String(err)
        for (const id of ids) {
          const row = rowsById.get(id)
          if (row) row.byEnv[env.key] = null
        }
      }
    }

    const rows = [...rowsById.values()]

    // Overlay the DEFINED desired state from the CONFIGURED definition table
    // (host side) — the overall wanted On/Off per flow. Off entirely unless
    // configured in the Workbench Settings (no hard dependency on any table).
    let definitionNote: string | undefined
    const defCfg = flowDefinitionConfig()
    if (defCfg) {
      onProgress?.('Reading the defined flow states…')
      const defs = await this.loadDefinitions(orgUrlForEnvKey(hostKey), defCfg)
      let matched = 0
      for (const row of rows) {
        // Prefer the exact unique-id match; fall back to the flow name.
        const def =
          (row.uniqueId && defs.byUnique.get(row.uniqueId.toLowerCase())) ||
          defs.byName.get(row.name.toLowerCase())
        if (def) {
          row.definition = def.label
          row.definitionActive = def.active
          // Area (OptionSet label) → the row's grouping dimension (subtitle),
          // mirroring the plugin comparer's assembly grouping.
          if (def.area) row.subtitle = def.area
          matched++
        }
      }
      console.info(
        `[flowcmp] definitions (${defCfg.table}): ${defs.rawRows} rows read, ${matched}/${rows.length} flows matched`,
      )
      definitionNote = defs.error
        ? `Defined states (${defCfg.table}) couldn’t be read — the connection may lack read access. ${defs.error}`
        : defs.rawRows === 0
          ? `No defined states found — ${defCfg.table} returned 0 rows for the app’s connection.`
          : matched === 0
            ? `Read ${defs.rawRows} rows from ${defCfg.table}, but none matched a flow.`
            : undefined
    }

    for (const row of rows) row.statusDrift = recomputeDrift(row, hostKey, envKeys)
    rows.sort(
      (a, b) =>
        Number(b.statusDrift) - Number(a.statusDrift) ||
        a.name.localeCompare(b.name),
    )

    return { rows, envErrors, ...(definitionNote ? { definitionNote } : {}) }
  }

  /**
   * Read the DEFINED desired flow states from the CONFIGURED definition table
   * (host side): its status column (a two-options / boolean field → the wanted
   * On/Off), keyed by the configured name column and (optionally) unique column.
   * Best-effort: any failure yields empty maps + an error message.
   */
  private async loadDefinitions(
    orgUrl: string,
    cfg: FlowDefinitionConfig,
  ): Promise<{
    byName: Map<string, DefState>
    byUnique: Map<string, DefState>
    rawRows: number
    error?: string
  }> {
    const byName = new Map<string, DefState>()
    const byUnique = new Map<string, DefState>()
    let error: string | undefined
    let rawRows = 0

    // The status column is a two-options / boolean field — the connector returns
    // it as a JS boolean (true/false), so Number()/regex, NOT rowNum (which is 0
    // for a boolean). Accept boolean / number / string / formatted-label "on".
    const ON_RE = /^\s*(on|yes|true|active|activated|ja|1)\s*$/i
    const stateOf = (r: Row): { label: string; active: boolean } | null => {
      const raw = r[cfg.statusCol]
      const fv = formattedValue(r, cfg.statusCol)
      if (raw == null && !fv) return null
      const active =
        raw === true ||
        raw === 1 ||
        (typeof raw === 'string' && ON_RE.test(raw)) ||
        (typeof fv === 'string' && ON_RE.test(fv))
      return { label: active ? 'On' : 'Off', active }
    }

    // Area is an OptionSet. The connector's FetchXML passthrough does NOT return
    // formatted values for it, so resolve the label from stringmap (value→label,
    // in the environment's base language) and map the raw option value through
    // it; fall back to a formatted value if one is present, else a "#code".
    const areaLabels = cfg.areaCol
      ? await this.loadAreaLabels(orgUrl, cfg.areaCol)
      : new Map<number, string>()
    const areaOf = (r: Row): string | undefined => {
      if (!cfg.areaCol) return undefined
      const raw = r[cfg.areaCol]
      if (raw == null || raw === '') return formattedValue(r, cfg.areaCol)
      const num = rowNum(raw)
      return areaLabels.get(num) ?? formattedValue(r, cfg.areaCol) ?? `#${num}`
    }

    const entitySet = await this.resolveEntitySet(orgUrl, cfg.table)
    const attrs =
      `<attribute name="${cfg.nameCol}" /><attribute name="${cfg.statusCol}" />` +
      (cfg.uniqueCol ? `<attribute name="${cfg.uniqueCol}" />` : '') +
      (cfg.areaCol ? `<attribute name="${cfg.areaCol}" />` : '')
    try {
      const fetch = `<fetch><entity name="${cfg.table}">${attrs}</entity></fetch>`
      for (const r of await fetchXmlAllPages(entitySet, fetch, orgUrl)) {
        rawRows++
        const st = stateOf(r)
        if (!st) continue
        const state: DefState = { ...st, area: areaOf(r) }
        const name = rowStr(r[cfg.nameCol]).toLowerCase()
        const uniq = cfg.uniqueCol
          ? rowStr(r[cfg.uniqueCol]).toLowerCase()
          : ''
        if (name) byName.set(name, state)
        if (uniq) byUnique.set(uniq, state)
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      console.warn(`[flowcmp] ${cfg.table} read failed:`, err)
    }

    return { byName, byUnique, rawRows, ...(error ? { error } : {}) }
  }

  /**
   * Resolve an OptionSet column's value→label map from `stringmap` — the
   * connector's FetchXML passthrough does NOT return formatted values for a
   * custom picklist like the area column, so the raw option value comes back as
   * a bare number. Labels are picked in the environment's base language first,
   * then English (1033), then any. Best-effort: an empty map on any failure
   * (grouping then falls back to the numeric code).
   */
  private async loadAreaLabels(
    orgUrl: string,
    areaCol: string,
  ): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    try {
      // Base language of the environment — the labels shown in the maker.
      let baseLang = 1033
      try {
        const org = await fetchXmlQuery(
          'organizations',
          `<fetch top="1"><entity name="organization"><attribute name="languagecode" /></entity></fetch>`,
          orgUrl,
        )
        const lc = rowNum(org[0]?.languagecode)
        if (lc) baseLang = lc
      } catch {
        /* keep the 1033 default */
      }
      // Lower rank wins: base language, then English, then any other language.
      const rank = (lang: number): number =>
        lang === baseLang ? 0 : lang === 1033 ? 1 : 2
      const bestRank = new Map<number, number>()
      const fetch =
        `<fetch><entity name="stringmap">` +
        `<attribute name="attributevalue" />` +
        `<attribute name="value" />` +
        `<attribute name="langid" />` +
        `<filter><condition attribute="attributename" operator="eq" value="${fetchXmlEscape(areaCol)}" /></filter>` +
        `</entity></fetch>`
      for (const r of await fetchXmlAllPages('stringmaps', fetch, orgUrl)) {
        const label = rowStr(r.value)
        if (!label) continue
        const val = rowNum(r.attributevalue)
        const rk = rank(rowNum(r.langid))
        const cur = bestRank.get(val)
        if (cur === undefined || rk < cur) {
          bestRank.set(val, rk)
          out.set(val, label)
        }
      }
    } catch (err) {
      console.warn('[flowcmp] stringmap area labels read failed:', err)
    }
    return out
  }

  /**
   * Resolve the real `EntitySetName` (collection name the connector addresses)
   * for a table from metadata — Dataverse's auto-plural isn't always the naive
   * "+s". Falls back to "+s" if the metadata read fails. EntityDefinitions reads
   * work with the connector (same path the dependency check uses).
   */
  private async resolveEntitySet(
    orgUrl: string,
    table: string,
  ): Promise<string> {
    const fallback = `${table}s`
    try {
      const res = await MicrosoftDataverseService.ListRecordsWithOrganization(
        orgUrl,
        'EntityDefinitions',
        undefined,
        undefined,
        undefined,
        undefined,
        'LogicalName,EntitySetName',
        `LogicalName eq '${table.replace(/'/g, "''")}'`,
      )
      if (res && res.success === false) return fallback
      const rows =
        (res.data as { value?: Array<Record<string, unknown>> } | undefined)
          ?.value ?? []
      return rowStr(rows[0]?.EntitySetName) || fallback
    } catch (err) {
      console.warn('[flowcmp] EntitySetName resolve failed:', err)
      return fallback
    }
  }

  /** Read workflow rows for a set of ids in one environment, keyed by id. */
  private async readByIds(
    envKey: string,
    ids: string[],
  ): Promise<Map<string, Row>> {
    const out = new Map<string, Row>()
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const chunk = ids.slice(i, i + ID_CHUNK)
      const conds = chunk
        .map(
          (id) => `<condition attribute="workflowid" operator="eq" value="${id}" />`,
        )
        .join('')
      const fetch =
        `<fetch><entity name="workflow">${FLOW_ATTRS}` +
        `<filter type="or">${conds}</filter>${OWNER_LINK}</entity></fetch>`
      for (const r of await fetchXmlQuery(
        'workflows',
        fetch,
        orgUrlForEnvKey(envKey),
      )) {
        const id = rowStr(r.workflowid)
        if (id) out.set(id, r)
      }
    }
    return out
  }

  async setFlowState(
    envKey: string,
    workflowId: string,
    on: boolean,
  ): Promise<ComparerEnvState> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockFlowComparerService.setFlowState(envKey, workflowId, on)
    // Activate = statecode 1 / statuscode 2; Deactivate = statecode 0 / 1.
    const item = on
      ? { statecode: 1, statuscode: 2 }
      : { statecode: 0, statuscode: 1 }
    const res = await MicrosoftDataverseService.UpdateRecordWithOrganization(
      'return=representation',
      'application/json',
      orgUrlForEnvKey(envKey),
      'workflows',
      workflowId,
      item,
    )
    if (res && res.success === false) {
      const detail = (res as { error?: { message?: string } }).error?.message
      throw new Error(
        `Turning the flow ${on ? 'on' : 'off'} failed${detail ? ` — ${detail}` : ''}`,
      )
    }
    // Re-read the single flow so the cell shows the actual persisted state.
    const hit = (await this.readByIds(envKey, [workflowId])).get(workflowId)
    return hit ? flowState(hit, envKey) : MISSING
  }

  async setFlowOwner(
    envKey: string,
    workflowId: string,
    userId: string,
  ): Promise<ComparerEnvState> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockFlowComparerService.setFlowOwner(envKey, workflowId, userId)
    // Reassign ownership via the standard lookup bind (needs the Assign
    // privilege on workflow in the target; the connector SP is sysadmin).
    const res = await MicrosoftDataverseService.UpdateRecordWithOrganization(
      'return=representation',
      'application/json',
      orgUrlForEnvKey(envKey),
      'workflows',
      workflowId,
      { 'ownerid@odata.bind': `/systemusers(${userId})` },
    )
    if (res && res.success === false) {
      const detail = (res as { error?: { message?: string } }).error?.message
      throw new Error(
        `Changing the flow owner failed${detail ? ` — ${detail}` : ''}`,
      )
    }
    // Re-read the single flow so the cell shows the persisted owner.
    const hit = (await this.readByIds(envKey, [workflowId])).get(workflowId)
    return hit ? flowState(hit, envKey) : MISSING
  }

  async listUsers(envKey: string, query: string): Promise<UserRef[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockFlowComparerService.listUsers(envKey, query)
    const q = query.trim()
    const search = q
      ? `<filter type="or">` +
        `<condition attribute="fullname" operator="like" value="%${fetchXmlEscape(q)}%" />` +
        `<condition attribute="domainname" operator="like" value="%${fetchXmlEscape(q)}%" />` +
        `</filter>`
      : ''
    const fetch =
      `<fetch count="30"><entity name="systemuser">` +
      `<attribute name="systemuserid" />` +
      `<attribute name="fullname" />` +
      `<attribute name="domainname" />` +
      `<filter type="and">` +
      `<condition attribute="isdisabled" operator="eq" value="false" />` +
      `${search}</filter>` +
      `<order attribute="fullname" />` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery(
      'systemusers',
      fetch,
      orgUrlForEnvKey(envKey),
    )
    return rows.map((r) => ({
      id: rowStr(r.systemuserid),
      name: rowStr(r.fullname) || rowStr(r.domainname) || rowStr(r.systemuserid),
      username: rowStr(r.domainname),
    }))
  }
}

export const dataverseFlowComparerService: FlowComparerService =
  new DataverseFlowComparerService()
