/**
 * OData Browser — query history and saved queries.
 *
 * Stored in `localStorage` **per environment**, because a query path is only
 * meaningful against the schema it was written for: the same text against
 * another environment may reference a column that does not exist there.
 *
 * The list operations are pure and unit-tested; the storage boundary below is
 * a thin, defensive wrapper (private mode, quota, a corrupted entry) that
 * degrades to "no history" rather than breaking the workspace.
 */

export interface StoredQuery {
  id: string
  /** Set on saved queries, absent for plain history entries. */
  name?: string
  /** The query path, e.g. `/accounts?$select=name&$top=50`. */
  path: string
  /** Logical name of the table, for the list display. */
  table: string
  /** Epoch millis — when it was run or saved. */
  at: number
}

/** How many history entries are kept per environment. */
export const HISTORY_LIMIT = 25

const VERSION = 'v1'

function historyKey(envKey: string): string {
  return `sac.odb.${VERSION}.history.${envKey}`
}

function savedKey(envKey: string): string {
  return `sac.odb.${VERSION}.saved.${envKey}`
}

// --- pure list operations ---------------------------------------------------

/**
 * Prepend an entry, drop an older run of the identical query and cap the list.
 * Re-running the same query should move it to the top, not fill the history
 * with duplicates.
 */
export function addToHistory(
  list: StoredQuery[],
  entry: StoredQuery,
  limit = HISTORY_LIMIT,
): StoredQuery[] {
  const withoutDuplicate = list.filter((item) => item.path !== entry.path)
  return [entry, ...withoutDuplicate].slice(0, Math.max(1, limit))
}

/** Insert or replace a saved query, matched by **name** (case-insensitive). */
export function upsertSaved(
  list: StoredQuery[],
  entry: StoredQuery,
): StoredQuery[] {
  const name = (entry.name ?? '').trim().toLowerCase()
  const rest = list.filter(
    (item) => (item.name ?? '').trim().toLowerCase() !== name,
  )
  return [entry, ...rest].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? ''),
  )
}

export function removeById(list: StoredQuery[], id: string): StoredQuery[] {
  return list.filter((item) => item.id !== id)
}

/** Ignore anything that does not look like a stored query. */
export function sanitize(value: unknown): StoredQuery[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is StoredQuery =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as StoredQuery).id === 'string' &&
      typeof (item as StoredQuery).path === 'string' &&
      typeof (item as StoredQuery).at === 'number',
  )
}

// --- storage boundary -------------------------------------------------------

function read(key: string): StoredQuery[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? sanitize(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function write(key: string, list: StoredQuery[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // Private mode or quota — the in-session list still works.
  }
}

export function loadHistory(envKey: string): StoredQuery[] {
  return read(historyKey(envKey))
}

export function saveHistory(envKey: string, list: StoredQuery[]): void {
  write(historyKey(envKey), list)
}

export function loadSaved(envKey: string): StoredQuery[] {
  return read(savedKey(envKey))
}

export function saveSaved(envKey: string, list: StoredQuery[]): void {
  write(savedKey(envKey), list)
}

/** Ids only have to be unique within one browser — no need for a real uuid. */
export function newEntryId(): string {
  return `q${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}
