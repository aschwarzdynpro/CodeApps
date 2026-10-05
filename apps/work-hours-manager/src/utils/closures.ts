import type { Closure } from '../types/calendar'
import { utcToZoned } from './dates'

export interface ClosureRow {
  closure: Closure
  /** Local first and last day in the viewer's zone. */
  from: string
  to: string
  days: number
}

/** Table rows of closures: local first/last day and length in days, sorted by start. */
export function closureRows(closures: Closure[], viewerTz: string): ClosureRow[] {
  return closures
    .map((c) => {
      const lastInstant = new Date(Date.parse(c.end) - 1).toISOString()
      return { closure: c, from: utcToZoned(c.start, viewerTz).date, to: utcToZoned(lastInstant, viewerTz).date, days: Math.max(1, Math.round((Date.parse(c.end) - Date.parse(c.start)) / 86_400_000)) }
    })
    .sort((a, b) => a.from.localeCompare(b.from))
}
