import type { Json } from './settingsModel'

export const sameId = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

export function nameById(items: { id: string; name: string }[], id: string | null | undefined): string | null {
  if (!id) return null
  return items.find((v) => sameId(v.id, id))?.name ?? null
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Short display of a diff/compare value; GUIDs are resolved where possible. */
export function formatValue(value: Json | undefined, resolve?: (id: string) => string | null): string {
  if (value === undefined) return '— (nicht vorhanden)'
  if (value === null) return '— (nicht gesetzt)'
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein'
  if (typeof value === 'string') {
    if (GUID.test(value) && resolve) {
      const name = resolve(value)
      if (name) return `${name} (${value.slice(0, 8)}…)`
    }
    return value.length > 140 ? `${value.slice(0, 140)}…` : value
  }
  if (typeof value === 'number') return String(value)
  const json = JSON.stringify(value)
  return json.length > 140 ? `${json.slice(0, 140)}…` : json
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}
