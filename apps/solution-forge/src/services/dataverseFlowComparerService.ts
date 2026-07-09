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
  fetchXmlEscape,
  fetchXmlQuery,
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
    for (const row of rows) row.statusDrift = recomputeDrift(row, hostKey, envKeys)
    rows.sort(
      (a, b) =>
        Number(b.statusDrift) - Number(a.statusDrift) ||
        a.name.localeCompare(b.name),
    )
    return { rows, envErrors }
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
