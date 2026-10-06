import type { Slot } from '../types/calendar'

/** One event of `msdyn_LoadCalendars` after date parsing. */
export interface ServerSlot extends Slot {
  timeCode: number | null
}

/**
 * Effective working time from `msdyn_LoadCalendars`. The server returns the
 * working span uncut (Sa 08:00–17:00) and lays breaks, holidays and other
 * unavailable time on top as separate events with TimeCode 2 (verified live
 * in NAAF-Backup: break 12:00–12:30 as TimeCode 2/SubCode 4). So: working
 * events (TimeCode 0) minus every TimeCode-2 event. Other codes (3 = capacity
 * filter) don't cut.
 */
export function workingSlots(events: ServerSlot[]): Slot[] {
  const cuts = events.filter((e) => e.timeCode === 2).map((e) => ({ start: Date.parse(e.start), end: Date.parse(e.end) }))
  const out: Slot[] = []
  for (const e of events) {
    if (e.timeCode !== null && e.timeCode !== 0) continue
    let pieces = [{ start: Date.parse(e.start), end: Date.parse(e.end) }]
    for (const c of cuts) {
      pieces = pieces.flatMap((p) => {
        if (c.end <= p.start || c.start >= p.end) return [p]
        return [...(c.start > p.start ? [{ start: p.start, end: c.start }] : []), ...(c.end < p.end ? [{ start: c.end, end: p.end }] : [])]
      })
    }
    for (const p of pieces) out.push({ calendarId: e.calendarId, innerCalendarId: e.innerCalendarId, start: new Date(p.start).toISOString(), end: new Date(p.end).toISOString(), effort: e.effort })
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}
