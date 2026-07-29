import type { OdataRow } from '../types/odataBrowser'

/**
 * OData Browser — turning a raw Web API row into something readable.
 *
 * With `prefer: odata.include-annotations="*"` every row carries extra keys
 * next to the data:
 *
 *   statecode: 0
 *   statecode@OData.Community.Display.V1.FormattedValue: "Active"
 *   _primarycontactid_value: "0f2a…"
 *   _primarycontactid_value@OData.Community.Display.V1.FormattedValue: "Ada Lovelace"
 *   _primarycontactid_value@Microsoft.Dynamics.CRM.lookuplogicalname: "contact"
 *
 * The grid shows the formatted value and keeps the raw one one toggle away;
 * the lookup logical name is what makes a lookup cell clickable later (P4).
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue'
const LOOKUP_LOGICAL_NAME = '@Microsoft.Dynamics.CRM.lookuplogicalname'

/** Annotation and control keys (`x@…`, `@odata.etag`) are not data columns. */
export function isAnnotationKey(key: string): boolean {
  return key.includes('@')
}

/**
 * The data columns present in a result page, in stable first-seen order.
 * Used when the query has no `$select` (then the server decides the shape) —
 * later rows can carry keys the first row omitted, because Dataverse leaves
 * null columns out entirely.
 */
export function dataKeys(rows: OdataRow[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (isAnnotationKey(key) || seen.has(key)) continue
      seen.add(key)
      keys.push(key)
    }
  }
  return keys
}

export interface CellValue {
  /** What to render. */
  text: string
  /** The underlying value (shown in the title / raw mode). */
  raw: unknown
  /** True when `text` came from a FormattedValue annotation. */
  formatted: boolean
  /** True when the raw value is absent or null. */
  empty: boolean
}

/** Read one cell, preferring the formatted annotation. */
export function cellValue(row: OdataRow, key: string): CellValue {
  const raw = row[key]
  const annotation = row[`${key}${FORMATTED}`]
  const empty = raw === null || raw === undefined || raw === ''
  if (typeof annotation === 'string' && annotation !== '')
    return { text: annotation, raw, formatted: true, empty }
  return { text: rawText(raw), raw, formatted: false, empty }
}

/** Stringify a raw JSON value for display without throwing on cycles. */
export function rawText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * The table a lookup column points at, from its annotation. Polymorphic
 * lookups (customer, owner, regarding) resolve per row — which is exactly why
 * this is read off the row rather than the metadata.
 */
export function lookupTarget(row: OdataRow, key: string): string | null {
  const value = row[`${key}${LOOKUP_LOGICAL_NAME}`]
  return typeof value === 'string' && value !== '' ? value : null
}
