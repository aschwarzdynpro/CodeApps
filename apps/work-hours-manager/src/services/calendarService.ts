import type { CalendarEventInfo, CalendarTree, Closure, DeleteCalendarInfo, Resource, Slot, TimeOffRequest, WorkHourTemplate } from '../types/calendar'
import { powerModeReady } from '../PowerProvider'
import { dataverseCalendarService } from './dataverseCalendarService'
import { mockCalendarService } from './mockCalendarService'

export type TreeDepth = 'roots' | 'full'

export interface TreesResult {
  /** Trees keyed by lower-cased calendar id; calendars that don't exist are left out. */
  trees: Record<string, CalendarTree>
  /** Lower-cased calendar id → error text for calendars that couldn't be read (after retries) — the others still arrive. */
  errors: Record<string, string>
}

export interface SetupCheck {
  label: string
  ok: boolean
  detail: string
}

/**
 * Everything the UI needs. Two implementations: Dataverse (connector,
 * user connection) and the in-memory mock the app falls back to without a
 * Power Apps host.
 *
 * Writes go through the Work Hours actions only — `saveCalendar` and
 * `deleteCalendar` take the documented `CalendarEventInfo`, closures go
 * through `msdyn_BusinessClosureSave`. No implementation ever writes a
 * `calendarrule` row.
 */
export interface CalendarService {
  readonly source: 'dataverse' | 'mock'

  listResources(): Promise<Resource[]>
  listTemplates(): Promise<WorkHourTemplate[]>
  /**
   * Rule trees of several calendars (resource calendars, template calendars),
   * keyed by lower-cased calendar id. `roots` reads only the root rules (one
   * request per calendar, for the list); `full` adds the inner calendars
   * (inspector, editor, runs). Calendars that don't exist are left out;
   * one that fails to load lands in `errors` instead of failing the rest.
   * Throws only when nothing could be read.
   */
  getTrees(calendarIds: string[], depth?: TreeDepth): Promise<TreesResult>
  /**
   * Effective working time per calendar (`msdyn_LoadCalendars`), keyed by
   * lower-cased calendar id. Throws when the action isn't reachable — the UI
   * then derives the working time from the rules and says so.
   */
  loadSlots(calendarIds: string[], from: string, to: string): Promise<Record<string, Slot[]>>
  /** Business closures of the organization between two instants. */
  loadClosures(from: string, to: string): Promise<Closure[]>
  loadTimeOff(resourceIds: string[], from: string, to: string): Promise<TimeOffRequest[]>
  /** Active bookings per resource that start after `date` (finding 5.4). */
  countBookingsAfter(resourceIds: string[], date: string): Promise<Record<string, number>>

  /** `msdyn_SaveCalendar`; returns the inner calendar ids the server reports. */
  saveCalendar(info: CalendarEventInfo): Promise<string[]>
  /** `msdyn_DeleteCalendar`; returns the inner calendar ids the server reports. */
  deleteCalendar(info: DeleteCalendarInfo): Promise<string[]>
  /** `msdyn_BusinessClosureSave`. */
  saveClosure(name: string, start: string, end: string): Promise<void>
  /** `msdyn_BusinessClosureDelete` with the closure's `calendarruleid` (verified live, NAAF-Backup). */
  deleteClosure(closure: Closure): Promise<void>

  checkSetup(): Promise<SetupCheck[]>
}

export class PrivilegeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrivilegeError'
  }
}

/** True when a Dataverse error text points at a missing privilege (the app then switches to read-only). */
export const isPrivilegeMessage = (message: string): boolean => /privilege|prv[A-Z]|0x80040220|0x8004801c|not have (the )?permission|keine berechtigung|owncalendar/i.test(message)

/** Mock without a Power Apps host; never a silent fallback on errors — a write must never seem to succeed. */
export async function getCalendarService(): Promise<CalendarService> {
  const mode = await powerModeReady
  return mode === 'power-platform' ? dataverseCalendarService : mockCalendarService
}
