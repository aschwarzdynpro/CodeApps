import type { DualWriteMapSummary } from '../types/dualWrite'
import type { DualWriteService } from './dualWriteService'
import { mockDualWriteService } from './mockDualWriteService'
import { powerModeReady } from '../PowerProvider'
import {
  currentOrgUrl,
  fetchXmlAllPages,
  fetchXmlEscape,
  fetchXmlQuery,
  rowStr,
} from './currentEnvQuery'
import {
  compareMapVersions,
  mappingFieldNames,
  overallDirection,
  parseDualWriteMapping,
} from '../utils/dualWriteMapping'

/**
 * Real {@link DualWriteService}. Dual-write table maps live in
 * `msdyn_dualwriteentitymap`; each saved version is its own record, and the
 * mapping definition (legs + field mappings) is the `msdyn_mapping` JSON on the
 * record. Reads run through the connector (SP identity) against the host env,
 * so the SP needs read access to `msdyn_dualwriteentitymap`.
 */

const ENTITY_SET = 'msdyn_dualwriteentitymaps'

class DataverseDualWriteService implements DualWriteService {
  async listTableMaps(): Promise<DualWriteMapSummary[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockDualWriteService.listTableMaps()

    // Step 1 — cheap grouping query: the `msdyn_mapping` payload is large and
    // NOT selected here. Custom (unmanaged) maps only; every saved version is
    // its own record, so we group by name and keep the highest version.
    const fetchXml =
      `<fetch>` +
      `<entity name="msdyn_dualwriteentitymap">` +
      `<attribute name="msdyn_dualwriteentitymapid" />` +
      `<attribute name="msdyn_name" />` +
      `<attribute name="msdyn_version" />` +
      `<attribute name="modifiedon" />` +
      `<filter type="and">` +
      `<condition attribute="ismanaged" operator="eq" value="0" />` +
      `</filter>` +
      `<order attribute="msdyn_name" />` +
      `</entity></fetch>`
    const orgUrl = currentOrgUrl()
    const rows = await fetchXmlAllPages(ENTITY_SET, fetchXml, orgUrl)

    const byName = new Map<string, { current: DualWriteMapSummary; count: number }>()
    for (const row of rows) {
      const name = rowStr(row.msdyn_name)
      if (!name) continue
      const summary: DualWriteMapSummary = {
        id: rowStr(row.msdyn_dualwriteentitymapid),
        name,
        version: rowStr(row.msdyn_version),
        versionCount: 1,
        sourceSchema: '',
        sourceEnv: '',
        destinationSchema: '',
        destinationEnv: '',
        direction: 0,
        modifiedOn: rowStr(row.modifiedon),
      }
      const existing = byName.get(name)
      if (!existing) {
        byName.set(name, { current: summary, count: 1 })
      } else {
        existing.count++
        if (compareMapVersions(summary.version, existing.current.version) > 0)
          existing.current = summary
      }
    }

    const currents = [...byName.values()]
      .map((e) => ({ ...e.current, versionCount: e.count }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // Step 2 — load ONLY the current versions' mappings (bounded to the grouped
    // count, not every version) and pull the source/target/direction from each.
    const mappings = await this.mappingsByIds(
      currents.map((c) => c.id),
      orgUrl,
    )
    for (const c of currents) {
      const detail = parseDualWriteMapping(mappings.get(c.id) ?? '')
      const leg = detail.legs[0]
      if (leg) {
        c.sourceSchema = leg.sourceSchema
        c.sourceEnv = leg.sourceEnvironmentType
        c.destinationSchema = leg.destinationSchema
        c.destinationEnv = leg.destinationEnvironmentType
      }
      c.direction = overallDirection(detail)
      // Index the mapped field names so the cockpit search can match a map by a
      // field inside its mapping (e.g. "accountnumber").
      c.fields = mappingFieldNames(detail)
    }
    return currents
  }

  /**
   * `msdyn_mapping` JSON for a set of record ids, keyed by id. Chunks the ids
   * into `in`-filtered queries so the list only transfers the current versions'
   * mappings (not every historical version).
   */
  private async mappingsByIds(
    ids: string[],
    orgUrl: string,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const CHUNK = 40
    for (let i = 0; i < ids.length; i += CHUNK) {
      const values = ids
        .slice(i, i + CHUNK)
        .map((id) => `<value>${fetchXmlEscape(id)}</value>`)
        .join('')
      const fetchXml =
        `<fetch>` +
        `<entity name="msdyn_dualwriteentitymap">` +
        `<attribute name="msdyn_dualwriteentitymapid" />` +
        `<attribute name="msdyn_mapping" />` +
        `<filter>` +
        `<condition attribute="msdyn_dualwriteentitymapid" operator="in">${values}</condition>` +
        `</filter>` +
        `</entity></fetch>`
      for (const row of await fetchXmlQuery(ENTITY_SET, fetchXml, orgUrl))
        map.set(rowStr(row.msdyn_dualwriteentitymapid), rowStr(row.msdyn_mapping))
    }
    return map
  }

  async getMapping(id: string): Promise<string> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockDualWriteService.getMapping(id)
    const fetchXml =
      `<fetch top="1">` +
      `<entity name="msdyn_dualwriteentitymap">` +
      `<attribute name="msdyn_mapping" />` +
      `<filter>` +
      `<condition attribute="msdyn_dualwriteentitymapid" operator="eq" value="${fetchXmlEscape(id)}" />` +
      `</filter>` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery(ENTITY_SET, fetchXml, currentOrgUrl())
    return rowStr(rows[0]?.msdyn_mapping)
  }
}

export const dataverseDualWriteService: DualWriteService =
  new DataverseDualWriteService()
