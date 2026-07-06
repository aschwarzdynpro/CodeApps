import type { DualWriteMapSummary } from '../types/dualWrite'
import type { DualWriteService } from './dualWriteService'
import { mockDualWriteService } from './mockDualWriteService'
import { powerModeReady } from '../PowerProvider'
import {
  currentOrgUrl,
  fetchXmlAllPages,
  fetchXmlEscape,
  fetchXmlQuery,
  formattedValue,
  rowStr,
} from './currentEnvQuery'
import { compareMapVersions } from '../utils/dualWriteMapping'

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

    // Custom (unmanaged) maps only. The `msdyn_mapping` payload is deliberately
    // NOT selected here — it is large and loaded per-row on demand.
    const fetchXml =
      `<fetch>` +
      `<entity name="msdyn_dualwriteentitymap">` +
      `<attribute name="msdyn_dualwriteentitymapid" />` +
      `<attribute name="msdyn_name" />` +
      `<attribute name="msdyn_version" />` +
      `<attribute name="ownerid" />` +
      `<attribute name="modifiedon" />` +
      `<filter type="and">` +
      `<condition attribute="ismanaged" operator="eq" value="0" />` +
      `</filter>` +
      `<order attribute="msdyn_name" />` +
      `</entity></fetch>`
    const rows = await fetchXmlAllPages(ENTITY_SET, fetchXml, currentOrgUrl())

    // Group by name → keep the highest version as "current", count the rest.
    const byName = new Map<string, { current: DualWriteMapSummary; count: number }>()
    for (const row of rows) {
      const name = rowStr(row.msdyn_name)
      if (!name) continue
      const summary: DualWriteMapSummary = {
        id: rowStr(row.msdyn_dualwriteentitymapid),
        name,
        version: rowStr(row.msdyn_version),
        versionCount: 1,
        owner: formattedValue(row, 'ownerid') ?? '',
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

    return [...byName.values()]
      .map((e) => ({ ...e.current, versionCount: e.count }))
      .sort((a, b) => a.name.localeCompare(b.name))
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
