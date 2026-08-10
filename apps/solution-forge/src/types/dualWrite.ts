/**
 * Dual-write table maps (`msdyn_dualwriteentitymap`) in the current
 * environment. Each saved version of a map is stored as its own record, so the
 * cockpit groups by name and surfaces one version per map, then parses that
 * record's `msdyn_mapping` JSON into legs + field mappings for the detail
 * overlay.
 *
 * Which version that is comes from `msdyn_dualwriteruntimeconfig` where the
 * running version is recorded, and from the newest saved record otherwise —
 * see `utils/dualWriteMapping.ts → pickCurrentVersion`.
 */

/** One dual-write table map (at the shown version) — a list row. */
export interface DualWriteMapSummary {
  /** `msdyn_dualwriteentitymapid` of the shown record (drives the lazy
   *  mapping load). */
  id: string
  /** `msdyn_name`, e.g. "sst_[uoms - Units]". */
  name: string
  /** Version string of the shown record, e.g. "2.0.1.5". */
  version: string
  /** Where {@link version} comes from: 'live' = the running version, proven by
   *  the dual-write runtime configuration; 'saved' = the newest saved record,
   *  because the running version is not recorded in Dataverse for this map. */
  versionKind: 'live' | 'saved'
  /** The running version per `msdyn_dualwriteruntimeconfig`, when known. */
  liveVersion?: string
  /** Version of the newest saved record. Differs from {@link liveVersion} when
   *  someone saved a version that was never put into service. */
  latestSavedVersion: string
  /** How many version records exist for this map name (>= 1). */
  versionCount: number
  /** Source table + its environment type (from the current version's first
   *  leg), e.g. "Units" / "AX". '' when the mapping could not be read. */
  sourceSchema: string
  sourceEnv: string
  /** Destination (target) table + its environment type, e.g. "uoms" / "CRM". */
  destinationSchema: string
  destinationEnv: string
  /** Overall sync direction: 1 = source→target, 2 = target→source,
   *  3 = bidirectional, 0 = unknown. */
  direction: number
  /** ISO modified timestamp of the current-version record. */
  modifiedOn: string
  /** Distinct lower-cased source + destination field names of the mapping, so
   *  the cockpit search matches a map by a mapped field (e.g. "accountnumber").
   *  Populated from the current version's mapping when the list is built. */
  fields?: string[]
}

/** One field mapping inside a leg. */
export interface DualWriteFieldMapping {
  /** 1 = source→destination, 2 = destination→source, 3 = bidirectional. */
  syncDirection: number
  sourceField: string
  destinationField: string
  isSystemGenerated: boolean
  /** `destinationLookupFieldRelatedEntity` — set when the destination is a
   *  lookup resolved by a related entity's key. */
  lookupRelatedEntity?: string
  /** Flattened ValueMap transform pairs, if the mapping carries a value map. */
  valueMap?: { from: string; to: string }[]
}

/** One synchronization leg (source schema ↔ destination schema). */
export interface DualWriteLeg {
  id: string
  sourceSchema: string
  sourceEnvironmentType: string
  destinationSchema: string
  destinationEnvironmentType: string
  /** Source-side filter, empty when none. */
  sourceFilter: string
  fieldMappings: DualWriteFieldMapping[]
}

/** Parsed dual-write map (from `msdyn_mapping` JSON) for the detail overlay. */
export interface DualWriteMapDetail {
  name: string
  leftEnvironmentType: string
  centerEnvironmentType: string
  rightEnvironmentType: string
  legs: DualWriteLeg[]
  /** True when the JSON could not be parsed (overlay falls back to raw text). */
  unparsed: boolean
}
