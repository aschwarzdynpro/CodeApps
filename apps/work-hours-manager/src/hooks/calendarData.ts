import { LIMITS } from '../config'
import type { TreesResult } from '../services/calendarService'
import { addDays, startOfIsoWeek, zonedToUtc } from '../utils/dates'
import type { Closure, Resource, Slot, TimeOffRequest, WorkHourTemplate } from '../types/calendar'
import { useLoad, type LoadResult } from './useLoad'

/**
 * All reads of the app in one hook. Each piece is keyed on exactly its
 * inputs, so switching the week reloads slots, closures and time off but
 * not the resources and trees. Trees cover resource and template calendars
 * and hold only the root rules (one request per calendar) — the full trees
 * come from `useFullTrees` for what is opened.
 *
 * The diagnostics slots run from the start of the current week to today +
 * the diagnostics window; a visible week inside that span (the default view
 * and the next weeks) uses them instead of a second `msdyn_LoadCalendars`
 * sweep over all resources.
 */

export interface CalendarData {
  resources: LoadResult<Resource[]>
  templates: LoadResult<WorkHourTemplate[]>
  /** Root-rule trees plus the calendars that couldn't be read. */
  trees: LoadResult<TreesResult>
  /** Null data with an error = `msdyn_LoadCalendars` unavailable → views derive from rules. */
  slots: LoadResult<Record<string, Slot[]>>
  /** Slots from today over the diagnostics window (finding 5.1) — independent of the visible range. */
  diagSlots: LoadResult<Record<string, Slot[]>>
  closures: LoadResult<Closure[]>
  timeOff: LoadResult<TimeOffRequest[]>
  bookings: LoadResult<Record<string, number>>
  /** Resources loaded (the list renders; trees and slots follow). */
  ready: boolean
  reloadTrees: () => void
  reloadRange: () => void
  reloadAll: () => void
}

const sig = (ids: string[]) => `${ids.length}:${ids.slice(0, 3).join(',')}:${ids.slice(-1)[0] ?? ''}`

export function useCalendarData(active: boolean, from: string, to: string, viewerTz: string, today: string, treeVersion: number): CalendarData {
  const resources = useLoad(active ? 'resources' : null, (svc) => svc.listResources())
  const templates = useLoad(active ? 'templates' : null, (svc) => svc.listTemplates())

  const resourceCalendarIds = (resources.data ?? []).map((r) => r.calendarId).filter((c): c is string => !!c)
  const templateCalendarIds = (templates.data ?? []).map((t) => t.calendarId).filter((c): c is string => !!c)
  const allCalendarIds = [...resourceCalendarIds, ...templateCalendarIds]
  // Root rules don't follow `treeVersion`: after a save only the touched calendars reload (as full trees, see App).
  const treesKey = resources.data && templates.data ? `trees:${sig(allCalendarIds)}` : null
  const trees = useLoad(treesKey, (svc) => svc.getTrees(allCalendarIds, 'roots'))

  const fromIso = zonedToUtc(from, '00:00', viewerTz)
  const toIso = zonedToUtc(addDays(to, 1), '00:00', viewerTz)
  const rangeKey = resources.data ? `${fromIso}|${toIso}|${sig(resourceCalendarIds)}|${treeVersion}` : null
  // Diagnostics (5.1 counts from today on) plus the rest of this week, so the default week view needs no load of its own.
  const diagStart = startOfIsoWeek(today)
  const diagEnd = addDays(today, LIMITS.diagnosticsWindowDays + 1)
  const diagFrom = zonedToUtc(diagStart, '00:00', viewerTz)
  const diagTo = zonedToUtc(diagEnd, '00:00', viewerTz)
  const diagSlots = useLoad(resources.data ? `diagslots:${diagFrom}|${diagTo}|${sig(resourceCalendarIds)}|${treeVersion}` : null, (svc) => svc.loadSlots(resourceCalendarIds, diagFrom, diagTo))
  const inDiag = from >= diagStart && addDays(to, 1) <= diagEnd
  const ownSlots = useLoad(rangeKey && !inDiag ? `slots:${rangeKey}` : null, (svc) => svc.loadSlots(resourceCalendarIds, fromIso, toIso))
  const slots = inDiag ? diagSlots : ownSlots
  const closures = useLoad(active ? `closures:${fromIso}|${toIso}|${treeVersion}` : null, (svc) => svc.loadClosures(fromIso, toIso))
  const resourceIds = (resources.data ?? []).map((r) => r.id)
  const timeOff = useLoad(rangeKey && `timeoff:${rangeKey}`, (svc) => svc.loadTimeOff(resourceIds, fromIso, toIso))
  const inactiveIds = (resources.data ?? []).filter((r) => !r.active).map((r) => r.id)
  const bookings = useLoad(resources.data ? `bookings:${today}:${sig(inactiveIds)}` : null, (svc) => (inactiveIds.length ? svc.countBookingsAfter(inactiveIds, zonedToUtc(today, '00:00', viewerTz)) : Promise.resolve({})))

  return {
    resources,
    templates,
    trees,
    slots,
    diagSlots,
    closures,
    timeOff,
    bookings,
    ready: !!resources.data,
    reloadTrees: trees.reload,
    reloadRange: () => {
      slots.reload()
      closures.reload()
      timeOff.reload()
    },
    reloadAll: () => {
      resources.reload()
      templates.reload()
      trees.reload()
      slots.reload()
      diagSlots.reload()
      closures.reload()
      timeOff.reload()
      bookings.reload()
    },
  }
}
