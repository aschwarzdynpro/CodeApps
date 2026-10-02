import type { IOperationResult } from '@microsoft/power-apps/data'
import type { Ref } from '../types/series'

/** Shared helpers of the Dataverse implementation. */

export type Row = Record<string, unknown>

export const FV = '@OData.Community.Display.V1.FormattedValue'
export const LOOKUP_TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname'

export function unwrap<T>(result: IOperationResult<T>, what: string): T {
  if (!result.success) throw new Error(`${what}: ${result.error?.message ?? 'unbekannter Fehler'}`)
  return result.data
}

export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** Lookup value + its formatted name as a Ref. */
export function refOf(row: Row, valueKey: string): Ref | null {
  const id = str(row[valueKey])
  return id ? { id, name: str(row[`${valueKey}${FV}`]) ?? id } : null
}

export const orFilter = (field: string, ids: string[]): string => `(${ids.map((id) => `${field} eq ${id}`).join(' or ')})`

export function chunks<T>(items: T[], size = 40): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Every word must occur in `field` ("lüft hall" finds "Lüftung Halle 3"). */
export function containsAll(field: string, term: string): string | null {
  const words = term.trim().split(/\s+/).filter(Boolean)
  return words.length ? words.map((w) => `contains(${field},'${w.replace(/'/g, "''")}')`).join(' and ') : null
}

export const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))
