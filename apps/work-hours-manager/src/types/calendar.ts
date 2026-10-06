/**
 * Domain model of the Work Hours & Calendar Manager.
 *
 * Two views of the same data live side by side (see the concept,
 * docs/concepts/work-hours-manager.md):
 *
 * - the **rules** — the Dataverse calendar tree (`calendar` → root
 *   `calendarrule` → inner `calendar` → leaf rules), read through
 *   `$expand=calendar_calendar_rules`; the only source for origin, diff and
 *   undo. Never written directly: all writes go through `msdyn_SaveCalendar`,
 *   `msdyn_DeleteCalendar` and `msdyn_BusinessClosureSave`.
 * - the **slots** — the effective working time per calendar as
 *   `msdyn_LoadCalendars` returns it, already net of time off and closures.
 *
 * The Work Hours API types at the end mirror the Microsoft documentation
 * (verified 2026-10-05, see README "Verifiziert").
 */

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface Ref {
  id: string
  name: string
}

// ---------------------------------------------------------------------------
// Resources and templates
// ---------------------------------------------------------------------------

export type ResourceType = 'generic' | 'contact' | 'user' | 'equipment' | 'account' | 'crew' | 'facility' | 'pool'

/** `bookableresource.resourcetype` option values. */
export const RESOURCE_TYPE_BY_CODE: Record<number, ResourceType> = {
  1: 'generic',
  2: 'contact',
  3: 'user',
  4: 'equipment',
  5: 'account',
  6: 'crew',
  7: 'facility',
  8: 'pool',
}

export interface Resource {
  id: string
  name: string
  type: ResourceType
  /** Dataverse time zone code of the resource (`bookableresource.timezone`), e.g. 110 = Berlin. */
  timeZoneCode: number
  /** Calendar of the resource (`_calendarid_value`); null = no calendar at all (finding 5.5). */
  calendarId: string | null
  orgUnit: Ref | null
  active: boolean
  categories: Ref[]
  territories: Ref[]
  /** System user behind a user resource — `ResourceId` for the own-calendar privilege check of the API. */
  userId: string | null
  displayOnScheduleBoard: boolean
}

export interface WorkHourTemplate {
  id: string
  name: string
  description: string | null
  /** `msdyn_calendarid` is a plain string column, not a lookup. */
  calendarId: string | null
  active: boolean
}

// ---------------------------------------------------------------------------
// Rules (the calendar tree)
// ---------------------------------------------------------------------------

/** A `calendarrule` row as `$expand=calendar_calendar_rules` returns it (fields we read). */
export interface RawCalendarRule {
  calendarruleid: string
  _calendarid_value: string
  _innercalendarid_value: string | null
  name: string | null
  description: string | null
  pattern: string | null
  /** UTC ISO; the time portion is the local time of `timezonecode` (same convention as the Work Hours API). */
  starttime: string | null
  endtime: string | null
  /** minutes */
  duration: number | null
  effort: number | null
  timecode: number | null
  subcode: number | null
  rank: number | null
  timezonecode: number | null
  /** date-only (UserLocal) */
  effectiveintervalstart: string | null
  effectiveintervalend: string | null
  extentcode: number | null
  isselected: boolean | null
  issimple: boolean | null
  ismodified: boolean | null
  isvaried: boolean | null
  /** Start offset in minutes for leaf rules. */
  offset: number | null
  /** Links the parts of a varied ("je Wochentag verschieden") recurrence. */
  groupdesignator: string | null
  createdon: string | null
  modifiedon: string | null
}

/** A `calendar` row with its rules. */
export interface RawCalendar {
  calendarid: string
  name: string | null
  description: string | null
  type: number | null
  calendar_calendar_rules: RawCalendarRule[]
}

export type WorkHourKind = 'work' | 'break' | 'nonwork' | 'timeoff' | 'closure' | 'unknown'

export interface LeafRule {
  id: string
  kind: WorkHourKind
  /** Minutes from local midnight (in the block's time zone). */
  startMin: number
  /** minutes */
  duration: number
  effort: number | null
  timeCode: number | null
  subCode: number | null
  raw: RawCalendarRule
}

/**
 * One calendar event as the Work Hours API sees it: a root rule in the
 * entity's calendar plus the leaf rules of its inner calendar. The inner
 * calendar id is what the API calls `InnerCalendarId`.
 */
export interface RuleBlock {
  rootRuleId: string
  /** null for root-only leaf rules (business closures live like this). */
  innerCalendarId: string | null
  /**
   * Server rank of the root rule — shown, never used for logic. Live (Schulz
   * UAT): 0 = single day, 1 = holiday list, 2 = weekly; lower wins. Whether a
   * block recurs comes from its pattern (`weekdays`), see `isRecurrence`.
   */
  rank: number
  pattern: string | null
  /** Weekdays of a weekly recurrence; null for occurrences. */
  weekdays: Weekday[] | null
  /** Part of a varied recurrence (shared `groupdesignator` and `isvaried`); the fixed weekly designator is not a group. */
  groupId: string | null
  /**
   * Holiday list (`FREQ=YEARLY`, extentcode 2): one entry per holiday with its
   * local first and last day. Empty while the inner calendar isn't loaded.
   */
  holidays?: { start: string; end: string }[]
  /** First and last day (date-only, inclusive); `end` null = open-ended. */
  start: string
  end: string | null
  timeZoneCode: number
  /** Time off reason, closure name … */
  description: string | null
  leaves: LeafRule[]
  /** Dominant kind of the block (work when any leaf works, else the first leaf's kind). */
  kind: WorkHourKind
  /** Minutes from midnight of the whole occurrence (first leaf start … last leaf end); for all-day = 0 … 1440·days. */
  startMin: number
  endMin: number
  modifiedOn: string | null
  createdOn: string | null
  raw: { root: RawCalendarRule; inner: RawCalendar | null }
}

export interface CalendarTree {
  calendarId: string
  name: string | null
  /**
   * False when only the root rules were read (list view): blocks have no
   * leaves yet. Editing, runs and the inspector need the full tree.
   */
  innerLoaded: boolean
  blocks: RuleBlock[]
  /** Inner calendars that no root rule points at any more (finding 5.5). */
  orphanInnerCalendars: RawCalendar[]
  /** Root rules we could not interpret (shown raw in the inspector). */
  unparsed: RawCalendarRule[]
}

// ---------------------------------------------------------------------------
// Slots, closures, time off
// ---------------------------------------------------------------------------

/** One slot of `msdyn_LoadCalendars`: effective working time, UTC instants. */
export interface Slot {
  calendarId: string
  innerCalendarId: string | null
  start: string
  end: string
  effort: number
}

export interface Closure {
  /** `calendarruleid` of the closure rule in the organization's closure calendar. */
  id: string
  /** The organization's closure calendar — a resource observes the closure when one of its holiday lists points at it. */
  calendarId: string
  name: string
  /** UTC ISO instants. */
  start: string
  end: string
}

export interface TimeOffRequest {
  id: string
  name: string
  resourceId: string
  start: string
  end: string
  approvedBy: Ref | null
  active: boolean
}

// ---------------------------------------------------------------------------
// Resolution (what the calendar view and the diagnostics show)
// ---------------------------------------------------------------------------

export type SegmentKind = 'work' | 'break' | 'timeoff' | 'nonwork' | 'closure'

export type OriginKind = 'recurrence' | 'occurrence' | 'break' | 'timeoff' | 'nonwork' | 'closure' | 'slot'

export interface Origin {
  kind: OriginKind
  /** Block that explains the segment; null when only a slot without a matching rule exists. */
  innerCalendarId: string | null
  label: string
}

export interface DaySegment {
  /** Minutes from local midnight of the viewer's day. */
  startMin: number
  endMin: number
  kind: SegmentKind
  effort: number | null
  origin: Origin
}

export interface DayResolution {
  date: string
  segments: DaySegment[]
  /** Net working minutes (slots), capacity = Σ effort · minutes / 60. */
  workMinutes: number
  capacityHours: number
  /** Why there is no working time, when there is none. */
  reason: 'none' | 'timeoff' | 'closure' | 'nonwork' | 'noRule' | 'ruleEnded' | 'ruleNotStarted' | 'weekdayOff'
  /** Blocks that apply to the day (for the inspector). */
  blockIds: string[]
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type FindingKind = 'noWorkingTime' | 'ruleEnding' | 'timeZoneMismatch' | 'inactiveWithBookings' | 'noCalendar' | 'orphanInnerCalendar' | 'duplicateHolidayList'

export interface Finding {
  kind: FindingKind
  resourceId: string
  resourceName: string
  severity: 'error' | 'warning' | 'info'
  detail: string
  /** Block the finding points at (rule ending …). */
  innerCalendarId?: string | null
}

// ---------------------------------------------------------------------------
// Work Hours API (verified against the Microsoft docs 2026-10-05)
// ---------------------------------------------------------------------------

export type CalendarEntity = 'bookableresource' | 'msdyn_workhourtemplate' | 'msdyn_resourcerequirement' | 'msdyn_project'

/** `WorkHourType` of a rule: 0 Working, 1 Break, 2 Nonworking, 3 Time Off. */
export const WORK_HOUR_TYPE = { work: 0, break: 1, nonwork: 2, timeoff: 3 } as const
export type WorkHourTypeCode = (typeof WORK_HOUR_TYPE)[keyof typeof WORK_HOUR_TYPE]

export interface ApiRule {
  /** ISO; time portion = local time in `TimeZoneCode`, date = occurrence date / first day of the recurrence. */
  StartTime: string
  /** Same date as StartTime (exceptions: all-day occurrence, end of day = 00:00 of the next day). */
  EndTime: string
  WorkHourType: WorkHourTypeCode
  /** Capacity; whole number, default 1; null for breaks. */
  Effort?: number | null
}

/** `Action` of a varied recurrence: 1 add day, 2 delete day, 3 edit times/capacity only, 4 edit anything else. */
export type VariedAction = 1 | 2 | 3 | 4

export interface ApiRulesAndRecurrence {
  Rules: ApiRule[]
  /** Only `FREQ=WEEKLY;INTERVAL=1;BYDAY=…` is supported. */
  RecurrencePattern?: string
  /** Set when editing; without it the API creates a new rule even with IsEdit. */
  InnerCalendarId?: string | null
  Action?: VariedAction
}

export interface CalendarEventInfo {
  EntityLogicalName: CalendarEntity
  CalendarId: string
  RulesAndRecurrences: ApiRulesAndRecurrence[]
  IsVaried?: boolean
  IsEdit?: boolean
  TimeZoneCode?: number
  /** Reason, only for time off. */
  InnerCalendarDescription?: string
  ObserveClosure?: boolean
  /** Recurrences only. Timestamp ≤ 08:00:00 ⇒ the day before; default 30 Dec 9999. */
  RecurrenceEndDate?: string
  /** "This and following": true when splitting a recurrence. */
  RecurrenceSplit?: boolean
  /** SystemUserId / ResourceId for user resources (own-calendar privilege). */
  ResourceId?: string
  UseV2?: boolean
}

export interface DeleteCalendarInfo {
  EntityLogicalName: CalendarEntity
  CalendarId: string
  InnerCalendarId: string
  IsVaried?: boolean
  UseV2?: boolean
}

export interface LoadCalendarsInput {
  StartDate: string
  EndDate: string
  CalendarIds: string[]
}

// ---------------------------------------------------------------------------
// Runs (mass actions) — persisted locally
// ---------------------------------------------------------------------------

export type RunKind = 'applyTemplate' | 'timeOff' | 'undo'

/** Raw calendars of one entity before a run — enough to rebuild the tree and to compute the undo. */
export interface TreeSnapshot {
  outer: RawCalendar
  inner: RawCalendar[]
}

export interface RunStepResult {
  resourceId: string
  resourceName: string
  calendarId: string | null
  status: 'done' | 'skipped' | 'failed' | 'pending' | 'aborted'
  message: string
  /** Inner calendar ids the server created in this step (for undo). */
  createdInnerCalendarIds: string[]
  /** Inner calendar ids the step deleted (undo re-creates them from the snapshot). */
  deletedInnerCalendarIds: string[]
  /** Inner calendar ids whose recurrence end the step changed (undo restores the snapshot's end). */
  endedInnerCalendarIds: string[]
}

export interface RunRecord {
  id: string
  kind: RunKind
  label: string
  /** Short description of the parameters (template, cutoff, absence …). */
  summary: string
  startedAt: string
  finishedAt: string | null
  /** Snapshot of the affected trees before the run, keyed by lower-cased calendar id — the undo package. */
  snapshot: Record<string, TreeSnapshot>
  steps: RunStepResult[]
  /** Run this one reverted (undo runs). */
  undoOf: string | null
  /** Set when an undo run reverted this one. */
  undoneBy: string | null
}

export type Notify = (text: string, kind?: 'ok' | 'error') => void
