import type { DualWriteMapSummary } from '../types/dualWrite'
import type { DualWriteService } from './dualWriteService'
import { mockDualWriteService } from './mockDualWriteService'
import { powerModeReady } from '../PowerProvider'
import {
  currentOrgUrl,
  fetchXmlAllPages,
  fetchXmlEscape,
  fetchXmlQuery,
  odataQuery,
  rowStr,
} from './currentEnvQuery'
import type { DualWriteVersionRecord } from '../utils/dualWriteMapping'
import {
  mapNameKey,
  mappingFieldNames,
  overallDirection,
  parseDualWriteMapping,
  parseRuntimeMapVersion,
  pickCurrentVersion,
} from '../utils/dualWriteMapping'

/**
 * Real {@link DualWriteService}. Dual-write table maps live in
 * `msdyn_dualwriteentitymap`; each saved version is its own record, and the
 * mapping definition (legs + field mappings) is the `msdyn_mapping` JSON on the
 * record. Reads run through the connector (SP identity) against the host env,
 * so the SP needs read access to `msdyn_dualwriteentitymap` and
 * `msdyn_dualwriteruntimeconfig`.
 */

const ENTITY_SET = 'msdyn_dualwriteentitymaps'
const RUNTIME_ENTITY = 'msdyn_dualwriteruntimeconfig'

class DataverseDualWriteService implements DualWriteService {
  /** Cached per session — the table does not appear/disappear at runtime. */
  private installed: boolean | null = null
  /** Resolved once per session (metadata read, not a naive "+s"). */
  private runtimeSet: string | null = null

  async isInstalled(): Promise<boolean> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockDualWriteService.isInstalled()
    if (this.installed !== null) return this.installed
    try {
      const rows = await odataQuery('EntityDefinitions', 'LogicalName', {
        filter: "LogicalName eq 'msdyn_dualwriteentitymap'",
      })
      this.installed = rows.length > 0
    } catch {
      // Fail open — a probe hiccup must not hide a working feature.
      this.installed = true
    }
    return this.installed
  }

  async listTableMaps(): Promise<DualWriteMapSummary[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockDualWriteService.listTableMaps()

    // Step 1 — cheap grouping query: the `msdyn_mapping` payload is large and
    // NOT selected here. Custom (unmanaged) maps only; every saved version is
    // its own record, so we group by name and then pick ONE version per map.
    const fetchXml =
      `<fetch>` +
      `<entity name="msdyn_dualwriteentitymap">` +
      `<attribute name="msdyn_dualwriteentitymapid" />` +
      `<attribute name="msdyn_name" />` +
      `<attribute name="msdyn_version" />` +
      `<attribute name="createdon" />` +
      `<attribute name="modifiedon" />` +
      `<filter type="and">` +
      `<condition attribute="ismanaged" operator="eq" value="0" />` +
      `</filter>` +
      `<order attribute="msdyn_name" />` +
      `</entity></fetch>`
    const orgUrl = currentOrgUrl()
    const rows = await fetchXmlAllPages(ENTITY_SET, fetchXml, orgUrl)

    const byName = new Map<string, DualWriteVersionRecord[]>()
    for (const row of rows) {
      const name = rowStr(row.msdyn_name)
      if (!name) continue
      const record: DualWriteVersionRecord = {
        id: rowStr(row.msdyn_dualwriteentitymapid),
        version: rowStr(row.msdyn_version),
        createdOn: rowStr(row.createdon),
        modifiedOn: rowStr(row.modifiedon),
      }
      const list = byName.get(name)
      if (list) list.push(record)
      else byName.set(name, [record])
    }

    // Step 2 — which version actually RUNS. Best-effort: a failed read only
    // costs the "live" label, never the list.
    const live = await this.liveVersionsByKey(orgUrl)
    // Ambiguity guard: two map names can share one source/destination pair
    // (at Schulz: `hso_[accounts - SST CDS Parties]` and the `sst_` twin). The
    // runtime config names the pair, not the map — so with more than one
    // candidate no live version may be attributed to either.
    const namesPerKey = new Map<string, number>()
    for (const name of byName.keys()) {
      const key = mapNameKey(name)
      if (key) namesPerKey.set(key, (namesPerKey.get(key) ?? 0) + 1)
    }

    const currents: DualWriteMapSummary[] = []
    for (const [name, records] of byName) {
      const key = mapNameKey(name)
      const liveVersion =
        key && namesPerKey.get(key) === 1 ? live.get(key) : undefined
      const pick = pickCurrentVersion(records, liveVersion)
      if (!pick) continue
      currents.push({
        id: pick.record.id,
        name,
        version: pick.record.version,
        versionKind: pick.kind,
        liveVersion,
        latestSavedVersion: pick.latestSavedVersion,
        versionCount: records.length,
        sourceSchema: '',
        sourceEnv: '',
        destinationSchema: '',
        destinationEnv: '',
        direction: 0,
        modifiedOn: pick.record.modifiedOn,
      })
    }
    currents.sort((a, b) => a.name.localeCompare(b.name))

    // Step 3 — load ONLY the shown versions' mappings (bounded to the grouped
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
   * The RUNNING version per map, keyed by `<source entity> - <destination
   * entity>` — read from the active `msdyn_dualwriteruntimeconfig` rows, whose
   * `msdyn_unsecure` payload carries the live `EntityMapVersion`.
   *
   * ⚠ Coverage is partial by design: Dataverse holds a runtime config only for
   * maps where it is the SOURCE (CE → F&O). For F&O → CE maps that config
   * lives on the F&O side, so a missing key means "live version unknown", not
   * "not running" — the caller must not turn absence into a claim.
   *
   * Best-effort: any failure yields an empty map (the list still renders, just
   * without the "live" label) rather than breaking the cockpit.
   */
  private async liveVersionsByKey(orgUrl: string): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    try {
      const fetchXml =
        `<fetch>` +
        `<entity name="${RUNTIME_ENTITY}">` +
        `<attribute name="msdyn_unsecure" />` +
        `<filter>` +
        `<condition attribute="statecode" operator="eq" value="0" />` +
        `</filter>` +
        `</entity></fetch>`
      const rows = await fetchXmlQuery(
        await this.runtimeEntitySet(orgUrl),
        fetchXml,
        orgUrl,
      )
      // Two rows disagreeing on one pair would make either answer a guess.
      const conflicting = new Set<string>()
      for (const row of rows) {
        const live = parseRuntimeMapVersion(rowStr(row.msdyn_unsecure))
        if (!live) continue
        const seen = out.get(live.key)
        if (seen === undefined) out.set(live.key, live.version)
        else if (seen !== live.version) conflicting.add(live.key)
      }
      for (const key of conflicting) out.delete(key)
    } catch (err) {
      console.warn('[dualwrite] runtime config read failed:', err)
    }
    return out
  }

  /** `EntitySetName` of the runtime-config table (metadata, not a naive "+s"). */
  private async runtimeEntitySet(orgUrl: string): Promise<string> {
    if (this.runtimeSet) return this.runtimeSet
    const fallback = `${RUNTIME_ENTITY}s`
    try {
      const rows = await odataQuery('EntityDefinitions', 'EntitySetName', {
        orgUrl,
        filter: `LogicalName eq '${RUNTIME_ENTITY}'`,
      })
      this.runtimeSet = rowStr(rows[0]?.EntitySetName) || fallback
    } catch {
      this.runtimeSet = fallback
    }
    return this.runtimeSet
  }

  /**
   * `msdyn_mapping` JSON for a set of record ids, keyed by id. Chunks the ids
   * into `in`-filtered queries so the list only transfers the shown versions'
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
