/**
 * Turning what a support agent already has on screen into a query.
 *
 * Nobody carries record GUIDs around, but everyone has the model-driven form
 * open, and its address bar contains both the id and the table:
 *
 *   .../main.aspx?appid=...&pagetype=entityrecord&etn=contact&id=b399d050-...
 *
 * So the record input accepts a pasted URL and digs the reference out of it,
 * falling back to a plain (optionally brace-wrapped) GUID.
 */

export interface RecordRef {
  recordId: string
  /** Logical name, when the source carried one. */
  table?: string
}

const GUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Reads a query-string parameter without needing a well-formed absolute URL. */
function param(input: string, name: string): string | undefined {
  const match = input.match(new RegExp(`[?&]${name}=([^&#\\s]+)`, 'i'))
  if (!match) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

/**
 * Read an explicit record reference out of a query string.
 *
 * Used for the app's own deep link (`?record=<guid>&table=<logical>`) and
 * deliberately strict: the Power Apps play URL carries unrelated GUIDs of its
 * own (`hint=...`), so the loose "first GUID anywhere" rule below would open a
 * bogus record on every cold start.
 */
export function parseDeepLink(search: string): RecordRef | null {
  const idParam = param(search, 'record') ?? param(search, 'id')
  if (!idParam) return null
  const guid = idParam.match(GUID_RE)
  if (!guid) return null
  const etn = param(search, 'table') ?? param(search, 'etn')
  return { recordId: guid[0].toLowerCase(), ...(etn ? { table: etn } : {}) }
}

/**
 * Extract a record reference from pasted text. Returns null when nothing
 * GUID-shaped is present, which the caller surfaces as a hint rather than an
 * error — a wrong paste is the normal case, not an exceptional one.
 */
export function parseRecordRef(input: string): RecordRef | null {
  const text = input.trim()
  if (!text) return null

  // A URL carries the table alongside the id; prefer that reading. `id`/`etn`
  // are what a model-driven form URL uses; `record`/`table` are the explorer's
  // own deep-link parameters, so a link back into the app round-trips.
  const idParam = param(text, 'id') ?? param(text, 'record')
  if (idParam) {
    const guid = idParam.match(GUID_RE)
    if (guid) {
      const etn = param(text, 'etn') ?? param(text, 'table')
      return { recordId: guid[0].toLowerCase(), ...(etn ? { table: etn } : {}) }
    }
  }

  // Otherwise take the first GUID anywhere in the text — covers a bare id,
  // {braced} ids from advanced find, and ids copied out of a longer string.
  const bare = text.match(GUID_RE)
  return bare ? { recordId: bare[0].toLowerCase() } : null
}
