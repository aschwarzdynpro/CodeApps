/**
 * Path-based access to the `msdyn_settings` JSON.
 *
 * The payload is an undocumented, product-owned structure that grows with
 * every URS release (Schulz UAT carries keys the MS field mapping does not
 * list, e.g. `GroupResourcesBy`, `hideLegend`, the Schedule-Assistant copies
 * inside `SlotMetadataCollection`). So the editor never rebuilds the object:
 * it parses, changes exactly one path immutably, and serializes. Untouched
 * keys survive byte-identical in content and order.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type JsonObject = { [key: string]: Json }
export type PathSeg = string | number

export type ParseResult = { ok: true; value: JsonObject } | { ok: false; error: string }

export function parseSettings(raw: string | null | undefined): ParseResult {
  if (raw == null || raw.trim() === '') return { ok: true, value: {} }
  try {
    const value: unknown = JSON.parse(raw)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'Das JSON ist kein Objekt.' }
    }
    return { ok: true, value: value as JsonObject }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Compact, like the schedule board itself stores it. */
export function serializeSettings(obj: JsonObject): string {
  return JSON.stringify(obj)
}

export function getAt(root: Json | undefined, path: PathSeg[]): Json | undefined {
  let cur: Json | undefined = root
  for (const seg of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = Array.isArray(cur)
      ? typeof seg === 'number'
        ? cur[seg]
        : undefined
      : (cur as JsonObject)[String(seg)]
  }
  return cur
}

/**
 * Returns a copy of `root` with `path` set to `value`. `undefined` removes
 * the key (array elements are spliced out). Missing intermediate objects are
 * created; existing keys keep their position.
 */
export function setAt<T extends Json>(root: T, path: PathSeg[], value: Json | undefined): T {
  if (path.length === 0) return (value ?? null) as T
  const [head, ...rest] = path
  if (Array.isArray(root)) {
    const idx = Number(head)
    const copy = root.slice()
    if (rest.length === 0 && value === undefined) {
      copy.splice(idx, 1)
      return copy as T
    }
    copy[idx] = rest.length === 0 ? (value as Json) : setAt(copy[idx] ?? {}, rest, value)
    return copy as T
  }
  const obj: JsonObject =
    root !== null && typeof root === 'object' ? { ...(root as JsonObject) } : {}
  const key = String(head)
  if (rest.length === 0) {
    if (value === undefined) delete obj[key]
    else obj[key] = value
    return obj as T
  }
  const child = obj[key]
  obj[key] = setAt(
    child !== undefined && child !== null && typeof child === 'object'
      ? child
      : typeof rest[0] === 'number'
        ? []
        : {},
    rest,
    value,
  )
  return obj as T
}

/** Structural equality, key order ignored. */
export function jsonEqual(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined || a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as Json[]
    return a.length === bb.length && a.every((v, i) => jsonEqual(v, bb[i]))
  }
  const ao = a as JsonObject
  const bo = b as JsonObject
  const ak = Object.keys(ao)
  const bk = Object.keys(bo)
  return ak.length === bk.length && ak.every((k) => k in bo && jsonEqual(ao[k], bo[k]))
}

/**
 * Array elements carrying one of these keys are addressed by that key in
 * flattened paths, so a diff of `SlotMetadataCollection` reads "Work Order →
 * TooltipViewId" instead of "[2].TooltipViewId" and survives reordering.
 */
const ARRAY_ID_KEYS = ['BookingSetupMetadataId']

export interface FlatEntry {
  /** Human-stable path, e.g. `SlotMetadataCollection[d59d…].SlotTemplate`. */
  key: string
  path: PathSeg[]
  value: Json
}

/** Flattens to leaves (scalars and empty containers). */
export function flatten(root: Json, path: PathSeg[] = [], keyPrefix = ''): FlatEntry[] {
  if (root === null || typeof root !== 'object') {
    return [{ key: keyPrefix, path, value: root }]
  }
  if (Array.isArray(root)) {
    if (root.length === 0) return [{ key: keyPrefix, path, value: [] }]
    return root.flatMap((item, i) => {
      const idKey = ARRAY_ID_KEYS.find(
        (k) => item !== null && typeof item === 'object' && !Array.isArray(item) && typeof item[k] === 'string',
      )
      const label = idKey ? String((item as JsonObject)[idKey]) : String(i)
      return flatten(item, [...path, i], `${keyPrefix}[${label}]`)
    })
  }
  const keys = Object.keys(root)
  if (keys.length === 0) return [{ key: keyPrefix, path, value: {} }]
  return keys.flatMap((k) => flatten(root[k], [...path, k], keyPrefix ? `${keyPrefix}.${k}` : k))
}

// ---------------------------------------------------------------------------
// Presence flags: some switches exist only while "on" (MS field mapping:
// `hideCancelled`, `applyFilterTerritory`, `showTravelTime` → 1,
// `showBookingsProportionally` → true). Writing `0`/`false` instead of
// removing the key is not what the board does, so the editor mimics it.
// ---------------------------------------------------------------------------

export function readFlag(root: JsonObject, path: PathSeg[]): boolean {
  const v = getAt(root, path)
  return v === true || v === 1
}

export function writeFlag(
  root: JsonObject,
  path: PathSeg[],
  on: boolean,
  onValue: 1 | true,
): JsonObject {
  return setAt(root, path, on ? onValue : undefined)
}
