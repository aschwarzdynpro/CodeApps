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
  flowDetailsUrl,
  orgUrlForEnvKey,
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

    // Overlay the DEFINED desired state from the central hso_cloudflow registry
    // (host side): the overall wanted state per flow + the wanted state per env.
    onProgress?.('Reading the defined flow states…')
    const defs = await this.loadDefinitions(orgUrlForEnvKey(hostKey))
    let matched = 0
    for (const row of rows) {
      const def =
        defs.defByName.get(row.name.toLowerCase()) ||
        (row.uniqueId ? defs.defByUnique.get(row.uniqueId.toLowerCase()) : undefined)
      if (def) {
        row.definition = def.label
        row.definitionActive = def.active
        matched++
      }
      const perEnv = row.uniqueId
        ? defs.envDef.get(row.uniqueId.toLowerCase())
        : undefined
      if (perEnv) {
        for (const [envKey, d] of perEnv) {
          const cell = row.byEnv[envKey]
          if (cell && cell.present) {
            cell.desired = d.label
            cell.desiredActive = d.active
          }
        }
      }
    }

    for (const row of rows) row.statusDrift = recomputeDrift(row, hostKey, envKeys)
    rows.sort(
      (a, b) =>
        Number(b.statusDrift) - Number(a.statusDrift) ||
        a.name.localeCompare(b.name),
    )

    console.info(
      `[flowcmp] definitions: ${defs.defByName.size} names / ${defs.envDef.size} env-maps read, ${matched}/${rows.length} flows matched`,
    )
    const definitionNote = defs.error
      ? `Defined states (hso_cloudflow) couldn’t be read — the connection (SP) may lack read access. ${defs.error}`
      : defs.defByName.size === 0
        ? 'No defined states found — hso_cloudflow returned 0 rows for the connection (SP). It likely needs Organization-scope read on hso_cloudflow / hso_cloudflowbyenvironment.'
        : matched === 0
          ? `Read ${defs.defByName.size} definitions, but none matched a flow by name — try the real release solution (not a backup).`
          : undefined

    return { rows, envErrors, ...(definitionNote ? { definitionNote } : {}) }
  }

  /**
   * Read the DEFINED desired flow states from the central Schulz registry
   * (host side): `hso_cloudflow.hso_flowstate` (overall wanted state, matched by
   * name / unique id) and the per-environment `hso_cloudflowbyenvironment`
   * records (wanted state per env — the env resolved from the Dataverse env id
   * embedded in `hso_flowdetailsurl`). Best-effort: if the tables don't exist
   * (non-Schulz), everything comes back empty and no definition is shown.
   */
  private async loadDefinitions(orgUrl: string): Promise<{
    defByName: Map<string, { label: string; active: boolean }>
    defByUnique: Map<string, { label: string; active: boolean }>
    envDef: Map<string, Map<string, { label: string; active: boolean }>>
    error?: string
  }> {
    const defByName = new Map<string, { label: string; active: boolean }>()
    const defByUnique = new Map<string, { label: string; active: boolean }>()
    const envDef = new Map<string, Map<string, { label: string; active: boolean }>>()
    const isOn = (label: string): boolean => /^\s*on\s*$/i.test(label)
    let error: string | undefined

    try {
      const cf =
        `<fetch><entity name="hso_cloudflow">` +
        `<attribute name="hso_name" /><attribute name="hso_flowstate" />` +
        `<attribute name="hso_flowuniqueid" /></entity></fetch>`
      for (const r of await fetchXmlAllPages('hso_cloudflows', cf, orgUrl)) {
        const label = formattedValue(r, 'hso_flowstate') ?? ''
        if (!label) continue
        const entry = { label, active: isOn(label) }
        const name = rowStr(r.hso_name).toLowerCase()
        const uniq = rowStr(r.hso_flowuniqueid).toLowerCase()
        if (name) defByName.set(name, entry)
        if (uniq) defByUnique.set(uniq, entry)
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      console.warn('[flowcmp] hso_cloudflow read failed:', err)
    }

    try {
      const be =
        `<fetch><entity name="hso_cloudflowbyenvironment">` +
        `<attribute name="hso_flowuniqueid" /><attribute name="hso_flowstate" />` +
        `<attribute name="hso_flowdetailsurl" /></entity></fetch>`
      for (const r of await fetchXmlAllPages(
        'hso_cloudflowbyenvironments',
        be,
        orgUrl,
      )) {
        const label = formattedValue(r, 'hso_flowstate') ?? ''
        const uniq = rowStr(r.hso_flowuniqueid).toLowerCase()
        const guid = /environments\/([0-9a-f-]{36})\//i
          .exec(rowStr(r.hso_flowdetailsurl))?.[1]
          ?.toLowerCase()
        if (!label || !uniq || !guid) continue
        const envKey = ENVIRONMENTS.find(
          (e) => e.environmentId?.toLowerCase() === guid,
        )?.key
        if (!envKey) continue
        let m = envDef.get(uniq)
        if (!m) {
          m = new Map()
          envDef.set(uniq, m)
        }
        m.set(envKey, { label, active: isOn(label) })
      }
    } catch (err) {
      console.warn('[flowcmp] hso_cloudflowbyenvironment read failed:', err)
    }

    return { defByName, defByUnique, envDef, ...(error ? { error } : {}) }
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
