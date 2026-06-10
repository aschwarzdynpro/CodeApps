import type { AuditEvent, AuditOperation } from '../types/audit'

export const OPERATIONS: AuditOperation[] = ['Create', 'Update', 'Delete', 'Access']

export const OPERATION_COLORS: Record<AuditOperation, string> = {
  Create: '#1a8754',
  Update: '#2f6fed',
  Delete: '#c0392b',
  Access: '#8a8f99',
}


export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.round(diff / 60000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

/** ISO date (yyyy-mm-dd) of an event, used to bucket the timeline by day. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

/** Aggregate a numeric metric by a string key, returned sorted descending. */
export function countBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): { key: string; value: number }[] {
  const map = new Map<string, number>()
  for (const item of items) {
    const k = keyFn(item)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
}

export const DATE_RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'All', days: Infinity },
] as const

export function withinRange(event: AuditEvent, days: number): boolean {
  if (days === Infinity) return true
  const diff = Date.now() - new Date(event.createdOn).getTime()
  return diff <= days * 86_400_000
}
