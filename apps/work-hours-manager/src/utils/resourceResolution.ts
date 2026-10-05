import type { CalendarTree, Closure, DayResolution, Resource, Slot, TimeOffRequest } from '../types/calendar'
import { resolveRange } from './resolve'

export interface ResolutionSources {
  trees: Record<string, CalendarTree>
  /** Null = `msdyn_LoadCalendars` unavailable → derive from rules. */
  slots: Record<string, Slot[]> | null
  closures: Closure[]
  timeOff: TimeOffRequest[]
  viewerTz: string
  useV2: boolean
}

/** Resolutions of one resource over [from, to]; `fromSlots` says whether working time came from the action. */
export function resolveResource(r: Resource, src: ResolutionSources, from: string, to: string): { days: DayResolution[]; fromSlots: boolean } {
  const tree = r.calendarId ? (src.trees[r.calendarId.toLowerCase()] ?? null) : null
  const slots = r.calendarId && src.slots ? (src.slots[r.calendarId.toLowerCase()] ?? []) : null
  const days = resolveRange(
    { viewerTz: src.viewerTz, tree, slots, closures: src.closures, timeOff: src.timeOff.filter((t) => t.resourceId.toLowerCase() === r.id.toLowerCase()), useV2: src.useV2 },
    from,
    to,
  )
  return { days, fromSlots: slots !== null }
}
