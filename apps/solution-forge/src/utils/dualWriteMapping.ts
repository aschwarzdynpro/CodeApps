import type {
  DualWriteFieldMapping,
  DualWriteLeg,
  DualWriteMapDetail,
} from '../types/dualWrite'

/**
 * Pure helpers for the Dual-Write Table Maps cockpit: parse a map's
 * `msdyn_mapping` JSON into legs + field mappings, compare version strings and
 * describe sync directions. No Dataverse access — Vitest-covered.
 */

/** Coerce a value that may be a number or a numeric string to a number. */
function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') return Number(v) || 0
  return 0
}
const toStr = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Compare two dot-separated version strings numerically ("2.0.1.5" vs
 * "2.0.0.9"). Returns > 0 when `a` is newer — so `compareMapVersions(a, b) > 0`
 * means keep `a` as the current version.
 */
export function compareMapVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** Arrow + human label for a sync-direction code (relative to the leg). */
export function syncDirectionInfo(dir: number): {
  arrow: string
  label: string
  key: 'to-dest' | 'to-source' | 'both' | 'unknown'
} {
  switch (dir) {
    case 1:
      return { arrow: '→', label: 'Source → Destination', key: 'to-dest' }
    case 2:
      return { arrow: '←', label: 'Destination → Source', key: 'to-source' }
    case 3:
      return { arrow: '↔', label: 'Bidirectional', key: 'both' }
    default:
      return { arrow: '·', label: 'Unspecified', key: 'unknown' }
  }
}

interface RawTransform {
  transformType?: unknown
  valueMap?: unknown
}
interface RawFieldMapping {
  syncDirection?: unknown
  sourceField?: unknown
  destinationField?: unknown
  isSystemGenerated?: unknown
  destinationLookupFieldRelatedEntity?: unknown
  valueTransforms?: unknown
}
interface RawLeg {
  id?: unknown
  sourceSchema?: unknown
  sourceEnvironmentType?: unknown
  destinationSchema?: unknown
  destinationEnvironmentType?: unknown
  sourceFilter?: unknown
  fieldMappings?: unknown
}
interface RawMap {
  name?: unknown
  leftEnvironmentType?: unknown
  centerEnvironmentType?: unknown
  rightEnvironmentType?: unknown
  legs?: unknown
}

function parseValueMap(
  transforms: unknown,
): { from: string; to: string }[] | undefined {
  if (!Array.isArray(transforms)) return undefined
  const pairs: { from: string; to: string }[] = []
  for (const t of transforms as RawTransform[]) {
    if (
      t &&
      typeof t === 'object' &&
      t.transformType === 'ValueMap' &&
      t.valueMap &&
      typeof t.valueMap === 'object'
    ) {
      for (const [from, to] of Object.entries(
        t.valueMap as Record<string, unknown>,
      ))
        pairs.push({ from, to: toStr(to) })
    }
  }
  return pairs.length ? pairs : undefined
}

function parseFieldMapping(raw: RawFieldMapping): DualWriteFieldMapping {
  return {
    syncDirection: toNum(raw.syncDirection),
    sourceField: toStr(raw.sourceField),
    destinationField: toStr(raw.destinationField),
    isSystemGenerated: raw.isSystemGenerated === true,
    lookupRelatedEntity:
      toStr(raw.destinationLookupFieldRelatedEntity) || undefined,
    valueMap: parseValueMap(raw.valueTransforms),
  }
}

function parseLeg(raw: RawLeg): DualWriteLeg {
  const fms = Array.isArray(raw.fieldMappings)
    ? (raw.fieldMappings as RawFieldMapping[])
    : []
  return {
    id: toStr(raw.id),
    sourceSchema: toStr(raw.sourceSchema),
    sourceEnvironmentType: toStr(raw.sourceEnvironmentType),
    destinationSchema: toStr(raw.destinationSchema),
    destinationEnvironmentType: toStr(raw.destinationEnvironmentType),
    sourceFilter: toStr(raw.sourceFilter),
    fieldMappings: fms.map(parseFieldMapping),
  }
}

const EMPTY: DualWriteMapDetail = {
  name: '',
  leftEnvironmentType: '',
  centerEnvironmentType: '',
  rightEnvironmentType: '',
  legs: [],
  unparsed: true,
}

/**
 * Parse a dual-write map's `msdyn_mapping` JSON into legs + field mappings.
 * Defensive — never throws; on malformed input returns an empty map flagged
 * `unparsed` so the overlay can fall back to the raw text. Tolerates the
 * occasional double-encoded payload (a JSON string inside the JSON).
 */
export function parseDualWriteMapping(json: string): DualWriteMapDetail {
  if (!json || !json.trim()) return EMPTY
  let raw: RawMap
  try {
    const parsed: unknown = JSON.parse(json)
    raw = (typeof parsed === 'string' ? JSON.parse(parsed) : parsed) as RawMap
  } catch {
    return EMPTY
  }
  if (!raw || typeof raw !== 'object') return EMPTY
  const legs = Array.isArray(raw.legs) ? (raw.legs as RawLeg[]) : []
  return {
    name: toStr(raw.name),
    leftEnvironmentType: toStr(raw.leftEnvironmentType),
    centerEnvironmentType: toStr(raw.centerEnvironmentType),
    rightEnvironmentType: toStr(raw.rightEnvironmentType),
    legs: legs.map(parseLeg),
    unparsed: false,
  }
}

/** Total field mappings across every leg. */
export function countFieldMappings(detail: DualWriteMapDetail): number {
  return detail.legs.reduce((n, l) => n + l.fieldMappings.length, 0)
}

/**
 * Distinct, lower-cased source + destination field names across all legs — the
 * searchable field list so the cockpit search matches a map by a mapped field
 * (e.g. "accountnumber" finds the account map). Dotted lookup destinations
 * (e.g. "msdyn_product.msdyn_productnumber") also contribute their bare last
 * segment, so a search for the plain column name still hits.
 */
export function mappingFieldNames(detail: DualWriteMapDetail): string[] {
  const out = new Set<string>()
  const add = (v: string) => {
    const s = v.trim().toLowerCase()
    if (!s) return
    out.add(s)
    const dot = s.lastIndexOf('.')
    if (dot >= 0 && dot < s.length - 1) out.add(s.slice(dot + 1))
  }
  for (const leg of detail.legs)
    for (const f of leg.fieldMappings) {
      add(f.sourceField)
      add(f.destinationField)
    }
  return [...out]
}

/**
 * Overall sync direction of a whole map, summarised from its field directions:
 * bidirectional (3) when any field is bidirectional OR both one-way directions
 * occur; otherwise the single one-way direction (1 or 2); 0 when there are no
 * field mappings.
 */
export function overallDirection(detail: DualWriteMapDetail): number {
  let toDest = false
  let toSource = false
  let both = false
  for (const leg of detail.legs)
    for (const f of leg.fieldMappings) {
      if (f.syncDirection === 3) both = true
      else if (f.syncDirection === 1) toDest = true
      else if (f.syncDirection === 2) toSource = true
    }
  if (both || (toDest && toSource)) return 3
  if (toDest) return 1
  if (toSource) return 2
  return 0
}
