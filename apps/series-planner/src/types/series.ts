/**
 * Domain model of the series planner.
 *
 * A series ("Serienplan", table `pro_seriesplan`) is a recurring project
 * assignment. Every occurrence becomes a Field Service work order linked to
 * the project (so time entries flow into Project Operations) plus one
 * booking. The series record keeps the pattern as JSON ({@link
 * SeriesDefinition}); the work orders carry the series lookup and the
 * original pattern date as occurrence key — like Outlook's master
 * appointment and RecurrenceId.
 */

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type MonthlyRule =
  /** Day of month; months without that day use their last day. */
  | { mode: 'day'; day: number }
  /** nth weekday of the month; -1 = last. */
  | { mode: 'weekday'; nth: 1 | 2 | 3 | 4 | -1; weekday: Weekday }

export type RecurrenceRule =
  | { kind: 'weekly'; interval: number; weekdays: Weekday[] }
  /** Quarterly is monthly with interval 3. */
  | { kind: 'monthly'; interval: number; monthly: MonthlyRule }

/**
 * A stretch of the series with one rule, time window and default resource.
 * "This and all following" adds a segment starting at that occurrence; the
 * first segment starts at the series start.
 */
export interface Segment {
  /** YYYY-MM-DD */
  from: string
  rule: RecurrenceRule
  /** HH:mm, local time in the series' time zone. */
  startTime: string
  durationMinutes: number
  resourceId: string | null
}

export type SeriesEnd = { kind: 'date'; date: string } | { kind: 'count'; count: number }

/** A single occurrence planned differently from the pattern. */
export interface OccurrenceOverride {
  /** Moved to another day (YYYY-MM-DD). */
  date?: string
  startTime?: string
  durationMinutes?: number
  resourceId?: string | null
}

export interface SeriesDefinition {
  version: 1
  /** IANA zone the times are meant in, e.g. Europe/Berlin. */
  timeZone: string
  end: SeriesEnd
  segments: Segment[]
  /** Keyed by the original pattern date. */
  overrides: Record<string, OccurrenceOverride>
  /** Pattern dates intentionally not planned (holiday, absence, cancelled). */
  skips: Record<string, { reason: string }>
}

export interface Ref {
  id: string
  name: string
}

export type LookupKind =
  | 'project'
  | 'projectTask'
  | 'account'
  | 'workOrderType'
  | 'incidentType'
  | 'resource'
  | 'bookingStatus'
  | 'priceList'

/** Work order defaults and links shared by all occurrences of a series. */
export interface SeriesSettings {
  name: string
  project: Ref | null
  projectTask: Ref | null
  serviceAccount: Ref | null
  workOrderType: Ref | null
  incidentType: Ref | null
  priceList: Ref | null
  /** Status of new bookings (e.g. "Geplant"). */
  bookingStatus: Ref | null
  instructions: string
}

export interface SeriesSummary {
  id: string
  name: string
  active: boolean
  project: Ref | null
  /** Default resource of the first segment, for the list. */
  resource: Ref | null
  summary: string
  startDate: string | null
  endDate: string | null
  modifiedOn: string | null
}

export interface Series extends SeriesSummary {
  settings: SeriesSettings
  definition: SeriesDefinition
  /** Row version at load time — writes refuse when it moved on. */
  version: number | null
}

export interface SeriesDraft {
  settings: SeriesSettings
  definition: SeriesDefinition
}

export type OccurrenceState = 'unscheduled' | 'scheduled' | 'inProgress' | 'completed' | 'canceled'

/** A materialized occurrence: work order + its current booking. */
export interface OccurrenceRecord {
  /** Original pattern date (`pro_occurrence_dat`). */
  key: string
  workOrderId: string
  workOrderName: string
  bookingId: string | null
  /** UTC ISO; null without an active booking. */
  start: string | null
  end: string | null
  resource: Ref | null
  state: OccurrenceState
}

/** An occurrence as the definition wants it. */
export interface PlannedOccurrence {
  key: string
  /** Actual day (differs from `key` when moved). */
  date: string
  startTime: string
  durationMinutes: number
  resourceId: string | null
  /** UTC ISO */
  start: string
  end: string
  moved: boolean
  segmentIndex: number
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export interface Interval {
  start: string
  end: string
}

export interface Closure extends Interval {
  name: string
}

export interface BookingInfo extends Interval {
  id: string
  resourceId: string
  name: string
  workOrderId: string | null
}

export interface AvailabilityData {
  /** Business closures (public holidays). Null when they couldn't be read. */
  closures: Closure[] | null
  /** Working time per lower-cased resource id; a missing key means unknown. */
  workingTime: Record<string, Interval[]>
  /** Active bookings of the resources in the range. */
  bookings: BookingInfo[]
  /** What couldn't be checked (no privilege, action missing) — shown, not fatal. */
  unavailable: string[]
}

export type Issue =
  | { kind: 'holiday'; name: string }
  | { kind: 'absent' }
  | { kind: 'conflict'; with: string[] }
  | { kind: 'noResource' }

export class ConflictError extends Error {
  constructor(message = 'Der Serienplan wurde zwischenzeitlich geändert.') {
    super(message)
    this.name = 'ConflictError'
  }
}

/** Field Service work order system status (`msdyn_systemstatus`). */
export const WO_STATUS = {
  unscheduled: 690970000,
  scheduled: 690970001,
  inProgress: 690970002,
  completed: 690970003,
  posted: 690970004,
  canceled: 690970005,
} as const

/** `bookingstatus.status`: 1 Proposed, 2 Committed, 3 Canceled. */
export const BOOKING_STATUS_CANCELED = 3

/** Toast from any view. */
export type Notify = (text: string, kind?: 'ok' | 'error') => void
