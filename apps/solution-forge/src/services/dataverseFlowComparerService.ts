import type { WorkingSolution } from '../types/solution'
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

const FLOW_ATTRS =
  `<attribute name="workflowid" />` +
  `<attribute name="workflowidunique" />` +
  `<attribute name="name" />` +
  `<attribute name="statecode" />` +
  `<attribute name="modifiedon" />` +
  `<attribute name="ismanaged" />`

/** Map one workflow row → the environment cell (statecode 1 = Activated). */
function flowState(row: Row, envKey: string): ComparerEnvState {
  const active = rowNum(row.statecode) === 1
  const unique = rowStr(row.workflowidunique)
  return {
    present: true,
    active,
    statusLabel: active ? 'Activated' : 'Draft',
    modifiedOn: rowStr(row.modifiedon),
    isManaged: row.ismanaged === true,
    link: unique
      ? flowDetailsUrl(environmentIdForEnvKey(envKey), unique)
      : undefined,
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
      `</filter>${solutionLink}<order attribute="name" /></entity></fetch>`
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
    byName: Map<string, { label: string; active: boolean }>
    byUnique: Map<string, { label: string; active: boolean }>
    rawRows: number
    error?: string
  }> {
    const byName = new Map<string, { label: string; active: boolean }>()
    const byUnique = new Map<string, { label: string; active: boolean }>()
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

    const entitySet = await this.resolveEntitySet(orgUrl, cfg.table)
    const attrs =
      `<attribute name="${cfg.nameCol}" /><attribute name="${cfg.statusCol}" />` +
      (cfg.uniqueCol ? `<attribute name="${cfg.uniqueCol}" />` : '')
    try {
      const fetch = `<fetch><entity name="${cfg.table}">${attrs}</entity></fetch>`
      for (const r of await fetchXmlAllPages(entitySet, fetch, orgUrl)) {
        rawRows++
        const st = stateOf(r)
        if (!st) continue
        const name = rowStr(r[cfg.nameCol]).toLowerCase()
        const uniq = cfg.uniqueCol
          ? rowStr(r[cfg.uniqueCol]).toLowerCase()
          : ''
        if (name) byName.set(name, st)
        if (uniq) byUnique.set(uniq, st)
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      console.warn(`[flowcmp] ${cfg.table} read failed:`, err)
    }

    return { byName, byUnique, rawRows, ...(error ? { error } : {}) }
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
        `<filter type="or">${conds}</filter></entity></fetch>`
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
}

export const dataverseFlowComparerService: FlowComparerService =
  new DataverseFlowComparerService()
