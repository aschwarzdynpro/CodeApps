import type { WorkingSolution } from '../types/solution'
import type {
  ComparerEnvState,
  ComparerResult,
  ComparerRow,
} from '../types/comparer'
import { recomputeDrift } from '../types/comparer'
import type { PluginComparerService } from './pluginComparerService'
import { mockPluginComparerService } from './mockPluginComparerService'
import { powerModeReady } from '../PowerProvider'
import {
  fetchXmlEscape,
  fetchXmlQuery,
  rowNum,
  rowStr,
  type Row,
} from './currentEnvQuery'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'
import { ENVIRONMENTS, currentEnvKey, orgUrlForEnvKey } from '../config'

const ID_CHUNK = 20

const STEP_ATTRS =
  `<attribute name="sdkmessageprocessingstepid" />` +
  `<attribute name="name" />` +
  `<attribute name="statecode" />` +
  `<attribute name="modifiedon" />` +
  `<attribute name="ismanaged" />`

// Step → plugin type → assembly, for the assembly version + name (outer joins
// so steps without an assembly, e.g. Custom API steps, still come back).
const ASSEMBLY_LINK =
  `<link-entity name="plugintype" from="plugintypeid" to="plugintypeid" link-type="outer" alias="pt">` +
  `<link-entity name="pluginassembly" from="pluginassemblyid" to="pluginassemblyid" link-type="outer" alias="pa">` +
  `<attribute name="version" /><attribute name="name" />` +
  `</link-entity></link-entity>`

/** Map one step row → the environment cell (statecode 0 = Enabled/active). */
function stepState(row: Row): ComparerEnvState {
  const active = rowNum(row.statecode) === 0
  const version = rowStr(row['pa.version'])
  return {
    present: true,
    active,
    statusLabel: active ? 'Enabled' : 'Disabled',
    version: version || undefined,
    modifiedOn: rowStr(row.modifiedon),
    isManaged: row.ismanaged === true,
  }
}

const MISSING: ComparerEnvState = {
  present: false,
  active: false,
  statusLabel: 'Missing',
}

class DataversePluginComparerService implements PluginComparerService {
  async comparePlugins(
    solution: WorkingSolution,
    onProgress?: (message: string) => void,
  ): Promise<ComparerResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockPluginComparerService.comparePlugins(solution, onProgress)

    const envKeys = ENVIRONMENTS.map((e) => e.key)
    const hostKey = currentEnvKey()

    // 1) Host: the release solution's plugin steps (type 92) with each step's
    //    assembly version.
    onProgress?.('Reading plugin steps from the current environment…')
    const solutionLink =
      `<link-entity name="solutioncomponent" from="objectid" to="sdkmessageprocessingstepid" link-type="inner">` +
      `<filter><condition attribute="componenttype" operator="eq" value="92" /></filter>` +
      `<link-entity name="solution" from="solutionid" to="solutionid" link-type="inner">` +
      `<filter><condition attribute="uniquename" operator="eq" value="${fetchXmlEscape(solution.uniqueName)}" /></filter>` +
      `</link-entity></link-entity>`
    const hostFetch =
      `<fetch><entity name="sdkmessageprocessingstep">${STEP_ATTRS}${ASSEMBLY_LINK}` +
      `${solutionLink}<order attribute="name" /></entity></fetch>`
    const hostRows = await fetchXmlQuery(
      'sdkmessageprocessingsteps',
      hostFetch,
      orgUrlForEnvKey(hostKey),
    )

    const rowsById = new Map<string, ComparerRow>()
    for (const r of hostRows) {
      const id = rowStr(r.sdkmessageprocessingstepid)
      if (!id || rowsById.has(id)) continue
      const assembly = rowStr(r['pa.name'])
      rowsById.set(id, {
        id,
        name: rowStr(r.name) || id,
        subtitle: assembly || undefined,
        byEnv: { [hostKey]: stepState(r) },
        statusDrift: false,
      })
    }
    const ids = [...rowsById.keys()]

    // 2) Every OTHER env: look those same step ids up.
    const envErrors: ComparerResult['envErrors'] = {}
    for (const env of ENVIRONMENTS) {
      if (env.key === hostKey || ids.length === 0) continue
      onProgress?.(`Looking up plugin steps in ${env.label}…`)
      try {
        const byId = await this.readByIds(env.key, ids)
        for (const id of ids) {
          const row = rowsById.get(id)
          if (!row) continue
          const hit = byId.get(id)
          row.byEnv[env.key] = hit ? stepState(hit) : MISSING
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

  /** Read step rows (with assembly version) for a set of ids, keyed by id. */
  private async readByIds(
    envKey: string,
    ids: string[],
  ): Promise<Map<string, Row>> {
    const out = new Map<string, Row>()
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const chunk = ids.slice(i, i + ID_CHUNK)
      const conds = chunk
        .map(
          (id) =>
            `<condition attribute="sdkmessageprocessingstepid" operator="eq" value="${id}" />`,
        )
        .join('')
      const fetch =
        `<fetch><entity name="sdkmessageprocessingstep">${STEP_ATTRS}${ASSEMBLY_LINK}` +
        `<filter type="or">${conds}</filter></entity></fetch>`
      for (const r of await fetchXmlQuery(
        'sdkmessageprocessingsteps',
        fetch,
        orgUrlForEnvKey(envKey),
      )) {
        const id = rowStr(r.sdkmessageprocessingstepid)
        if (id) out.set(id, r)
      }
    }
    return out
  }

  async setStepState(
    envKey: string,
    stepId: string,
    on: boolean,
  ): Promise<ComparerEnvState> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockPluginComparerService.setStepState(envKey, stepId, on)
    // Enable = statecode 0 / statuscode 1; Disable = statecode 1 / statuscode 2
    // (inverted vs. workflow).
    const item = on
      ? { statecode: 0, statuscode: 1 }
      : { statecode: 1, statuscode: 2 }
    const res = await MicrosoftDataverseService.UpdateRecordWithOrganization(
      'return=representation',
      'application/json',
      orgUrlForEnvKey(envKey),
      'sdkmessageprocessingsteps',
      stepId,
      item,
    )
    if (res && res.success === false) {
      const detail = (res as { error?: { message?: string } }).error?.message
      throw new Error(
        `${on ? 'Enabling' : 'Disabling'} the step failed${detail ? ` — ${detail}` : ''}`,
      )
    }
    const hit = (await this.readByIds(envKey, [stepId])).get(stepId)
    return hit ? stepState(hit) : MISSING
  }
}

export const dataversePluginComparerService: PluginComparerService =
  new DataversePluginComparerService()
