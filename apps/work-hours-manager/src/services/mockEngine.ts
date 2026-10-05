import type { CalendarEventInfo, DeleteCalendarInfo, RawCalendar, RawCalendarRule, Weekday, WorkHourKind } from '../types/calendar'
import { addDays, dateOnly, diffDays, timeOfDayMinutes } from '../utils/dates'
import { CODES_OF_KIND, OPEN_END_YEAR, parsePattern } from '../utils/rules'

/**
 * Plays the server side of `msdyn_SaveCalendar` / `msdyn_DeleteCalendar`
 * on raw calendars in memory — for the mock service and for tests of the
 * intents layer. It stores exactly the tree shape the parser expects
 * (root rule → inner calendar → leaves) and refuses what the API refuses
 * (documented limits, see README "Verifiziert"). Where the real storage is
 * unknown it follows the documented rank semantics: a single-day edit inside
 * a recurrence becomes a rank-1 block of its own.
 */

export interface MockCalendarStore {
  /** Every calendar — entity calendars and inner calendars — by lower-cased id. */
  calendars: Map<string, RawCalendar>
  newId: () => string
  now: () => string
}

export class MockApiError extends Error {}

const KIND_OF_TYPE: Record<number, Exclude<WorkHourKind, 'unknown' | 'closure'>> = { 0: 'work', 1: 'break', 2: 'nonwork', 3: 'timeoff' }

const pad = (n: number) => String(n).padStart(2, '0')
const timeIso = (date: string, minutes: number) => `${date}T${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}:00Z`

function calendarOf(store: MockCalendarStore, id: string): RawCalendar {
  const cal = store.calendars.get(id.toLowerCase())
  if (!cal) throw new MockApiError(`Calendar ${id} does not exist.`)
  return cal
}

export function createStore(calendars: RawCalendar[], newId: () => string = () => crypto.randomUUID(), now: () => string = () => new Date().toISOString()): MockCalendarStore {
  return { calendars: new Map(calendars.map((c) => [c.calendarid.toLowerCase(), c])), newId, now }
}

interface LeafInput {
  kind: Exclude<WorkHourKind, 'unknown' | 'closure'>
  startMin: number
  duration: number
  effort: number | null
}

/** Rules of one RulesAndRecurrences entry → date + leaves, with the API's validations. */
function readRules(rules: CalendarEventInfo['RulesAndRecurrences'][number]['Rules'], recurring: boolean): { date: string; leaves: LeafInput[] } {
  if (!rules?.length) throw new MockApiError('Rules must contain at least one element.')
  const date = dateOnly(rules[0].StartTime)
  if (!date) throw new MockApiError('StartTime is not a valid ISO date.')
  const leaves: LeafInput[] = rules.map((r) => {
    const startDate = dateOnly(r.StartTime)
    const endDate = dateOnly(r.EndTime)
    const s = timeOfDayMinutes(r.StartTime)
    const e = timeOfDayMinutes(r.EndTime)
    if (!startDate || !endDate || s === null || e === null) throw new MockApiError('StartTime/EndTime are not valid ISO dates.')
    if (startDate !== date) throw new MockApiError('All rules of one recurrence must share the start date.')
    const end = e + diffDays(startDate, endDate) * 1440
    if (end <= s) throw new MockApiError("StartTime can't be greater or equal to EndTime.")
    const kind = KIND_OF_TYPE[r.WorkHourType]
    if (!kind) throw new MockApiError(`Unknown WorkHourType ${r.WorkHourType}.`)
    // Within one day, or all-day (midnight to midnight, possibly several days), or ending exactly at the next midnight.
    const allDay = s === 0 && e === 0 && endDate > startDate
    const endsAtMidnight = e === 0 && diffDays(startDate, endDate) === 1
    if (endDate !== startDate && !allDay && !endsAtMidnight) throw new MockApiError('An occurrence must start and end within one day.')
    if (recurring && end - s > 1440) throw new MockApiError('All-day recurrences are not supported.')
    if (recurring && (kind === 'timeoff' || kind === 'nonwork')) throw new MockApiError(`${kind === 'timeoff' ? 'Time off' : 'Nonworking hour'} recurrences are not supported.`)
    return { kind, startMin: s, duration: end - s, effort: kind === 'work' ? (r.Effort === undefined || r.Effort === null ? 1 : r.Effort) : null }
  })
  if (leaves.some((l) => l.kind === 'break') && !leaves.some((l) => l.kind === 'work')) throw new MockApiError("Breaks can't exist without working hours.")
  const sorted = [...leaves].sort((a, b) => a.startMin - b.startMin)
  for (let i = 1; i < sorted.length; i++) if (sorted[i].startMin < sorted[i - 1].startMin + sorted[i - 1].duration) throw new MockApiError('Time slots of the rules overlap.')
  return { date, leaves: sorted }
}

/** `RecurrenceEndDate`: a timestamp of 08:00:00 or earlier means the day before. */
export function recurrenceEnd(value: string | undefined): string | null {
  if (!value) return null
  const date = dateOnly(value)
  if (!date) throw new MockApiError('RecurrenceEndDate is not a valid ISO date.')
  if (Number(date.slice(0, 4)) >= OPEN_END_YEAR) return null
  const minutes = timeOfDayMinutes(value) ?? 0
  const seconds = Number(/T\d{2}:\d{2}:(\d{2})/.exec(value)?.[1] ?? 0)
  return minutes * 60 + seconds <= 8 * 3600 ? addDays(date, -1) : date
}

function weekdaysOf(pattern: string | undefined): Weekday[] | null {
  if (!pattern) return null
  const p = parsePattern(pattern)
  if (!p || p.freq !== 'WEEKLY' || p.interval !== 1 || !p.weekdays || p.weekdays.length === 0 || /\s/.test(pattern)) throw new MockApiError('Invalid recurrence pattern. Refer to the documentation for supported patterns.')
  return p.weekdays
}

interface BlockWrite {
  calendar: RawCalendar
  date: string
  weekdays: Weekday[] | null
  end: string | null
  leaves: LeafInput[]
  tz: number
  description: string | null
  groupId: string | null
  pattern: string | null
  existing?: { root: RawCalendarRule; inner: RawCalendar }
}

function writeBlock(store: MockCalendarStore, w: BlockWrite): string {
  const now = store.now()
  const recurring = w.weekdays !== null
  const first = Math.min(...w.leaves.map((l) => l.startMin))
  const last = Math.max(...w.leaves.map((l) => l.startMin + l.duration))
  const dominant = w.leaves.some((l) => l.kind === 'work') ? 'work' : w.leaves[0].kind
  const codes = CODES_OF_KIND[dominant]
  const innerId = w.existing?.inner.calendarid ?? store.newId()
  const root: RawCalendarRule = {
    calendarruleid: w.existing?.root.calendarruleid ?? store.newId(),
    _calendarid_value: w.calendar.calendarid,
    _innercalendarid_value: innerId,
    name: null,
    description: w.description,
    pattern: w.pattern,
    starttime: recurring ? `${w.date}T00:00:00Z` : timeIso(w.date, first),
    endtime: null,
    duration: recurring ? 1440 : last - first,
    effort: null,
    timecode: codes.timeCode,
    subcode: codes.subCode,
    rank: recurring ? 0 : 1,
    timezonecode: w.tz,
    effectiveintervalstart: `${w.date}T00:00:00Z`,
    effectiveintervalend: recurring ? (w.end ? `${w.end}T00:00:00Z` : '9999-12-30T23:59:59Z') : `${w.date}T00:00:00Z`,
    extentcode: 1,
    isselected: null,
    issimple: null,
    ismodified: w.existing ? true : null,
    isvaried: w.groupId !== null,
    offset: null,
    groupdesignator: w.groupId,
    createdon: w.existing?.root.createdon ?? now,
    modifiedon: now,
  }
  const inner: RawCalendar = {
    calendarid: innerId,
    name: null,
    description: w.description,
    type: -1,
    calendar_calendar_rules: w.leaves.map((l) => {
      const c = CODES_OF_KIND[l.kind]
      return {
        calendarruleid: store.newId(),
        _calendarid_value: innerId,
        _innercalendarid_value: null,
        name: null,
        description: null,
        pattern: null,
        starttime: timeIso(w.date, l.startMin),
        endtime: null,
        duration: l.duration,
        effort: l.effort,
        timecode: c.timeCode,
        subcode: c.subCode,
        rank: 0,
        timezonecode: w.tz,
        effectiveintervalstart: null,
        effectiveintervalend: null,
        extentcode: null,
        isselected: true,
        issimple: true,
        ismodified: null,
        isvaried: null,
        offset: l.startMin,
        groupdesignator: null,
        createdon: now,
        modifiedon: now,
      }
    }),
  }
  const idx = w.calendar.calendar_calendar_rules.findIndex((r) => r.calendarruleid === root.calendarruleid)
  if (idx >= 0) w.calendar.calendar_calendar_rules[idx] = root
  else w.calendar.calendar_calendar_rules.push(root)
  store.calendars.set(innerId.toLowerCase(), inner)
  return innerId
}

function findExisting(store: MockCalendarStore, calendar: RawCalendar, innerCalendarId: string): { root: RawCalendarRule; inner: RawCalendar } {
  const root = calendar.calendar_calendar_rules.find((r) => r._innercalendarid_value?.toLowerCase() === innerCalendarId.toLowerCase())
  const inner = store.calendars.get(innerCalendarId.toLowerCase())
  if (!root || !inner) throw new MockApiError(`InnerCalendarId ${innerCalendarId} not found on calendar ${calendar.calendarid}.`)
  return { root, inner }
}

function removeBlock(store: MockCalendarStore, calendar: RawCalendar, root: RawCalendarRule): void {
  calendar.calendar_calendar_rules = calendar.calendar_calendar_rules.filter((r) => r.calendarruleid !== root.calendarruleid)
  if (root._innercalendarid_value) store.calendars.delete(root._innercalendarid_value.toLowerCase())
}

/** `msdyn_SaveCalendar` → inner calendar ids. */
export function applySave(store: MockCalendarStore, info: CalendarEventInfo): string[] {
  if (!info.EntityLogicalName) throw new MockApiError('EntityLogicalName is required.')
  if (!info.CalendarId) throw new MockApiError('CalendarId is required.')
  const calendar = calendarOf(store, info.CalendarId)
  if (!info.RulesAndRecurrences?.length) throw new MockApiError('RulesAndRecurrences must contain at least one element.')
  const tz = info.TimeZoneCode ?? 110
  const end = recurrenceEnd(info.RecurrenceEndDate)
  const groupId = info.IsVaried ? (info.RulesAndRecurrences.map((r) => r.InnerCalendarId).filter(Boolean)[0] ? findGroup(store, calendar, info.RulesAndRecurrences) : store.newId()) : null
  const out: string[] = []
  for (const rr of info.RulesAndRecurrences) {
    const weekdays = weekdaysOf(rr.RecurrencePattern)
    const recurring = weekdays !== null
    const { date, leaves } = readRules(rr.Rules, recurring)
    const common = { calendar, tz, description: info.InnerCalendarDescription ?? null, groupId, pattern: rr.RecurrencePattern ?? null }

    if (info.IsVaried && rr.Action === 2) {
      if (!rr.InnerCalendarId) throw new MockApiError('Action 2 needs an InnerCalendarId.')
      removeBlock(store, calendar, findExisting(store, calendar, rr.InnerCalendarId).root)
      continue
    }

    if (info.IsEdit && rr.InnerCalendarId) {
      const existing = findExisting(store, calendar, rr.InnerCalendarId)
      const existingWeekdays = weekdaysOf(existing.root.pattern ?? undefined)
      if (info.RecurrenceSplit && existingWeekdays) {
        // "This and following": the old recurrence ends the day before, a new one starts here.
        const oldStart = dateOnly(existing.root.effectiveintervalstart) ?? date
        const cut = addDays(date, -1)
        if (cut < oldStart) removeBlock(store, calendar, existing.root)
        else existing.root.effectiveintervalend = `${cut}T00:00:00Z`
        out.push(writeBlock(store, { ...common, date, weekdays: weekdays ?? existingWeekdays, end, leaves }))
        continue
      }
      out.push(
        writeBlock(store, {
          ...common,
          existing,
          date: existingWeekdays ? (dateOnly(existing.root.effectiveintervalstart) ?? date) : date,
          weekdays: weekdays ?? existingWeekdays,
          end: info.RecurrenceEndDate !== undefined ? end : existingWeekdays ? openOrDate(existing.root.effectiveintervalend) : null,
          leaves,
          groupId: existing.root.groupdesignator ?? groupId,
          pattern: rr.RecurrencePattern ?? existing.root.pattern,
          description: info.InnerCalendarDescription ?? existing.inner.description,
        }),
      )
      continue
    }

    if (!info.IsEdit && rr.InnerCalendarId && !recurring) {
      // Single occurrence edited inside a recurrence: stored as a rank-1 block that owns the day.
      findExisting(store, calendar, rr.InnerCalendarId)
      out.push(writeBlock(store, { ...common, date, weekdays: null, end: null, leaves, groupId: null, pattern: null }))
      continue
    }

    if (!recurring && leaves.some((l) => l.kind === 'break') && leaves.length === 1) throw new MockApiError("Breaks can't exist without working hours.")
    out.push(writeBlock(store, { ...common, date, weekdays, end: recurring ? end : null, leaves }))
  }
  return out
}

const openOrDate = (iso: string | null): string | null => {
  const d = dateOnly(iso)
  return !d || Number(d.slice(0, 4)) >= OPEN_END_YEAR ? null : d
}

function findGroup(store: MockCalendarStore, calendar: RawCalendar, parts: CalendarEventInfo['RulesAndRecurrences']): string {
  for (const p of parts) {
    if (!p.InnerCalendarId) continue
    const g = findExisting(store, calendar, p.InnerCalendarId).root.groupdesignator
    if (g) return g
  }
  return store.newId()
}

/** `msdyn_DeleteCalendar` → inner calendar ids removed. */
export function applyDelete(store: MockCalendarStore, info: DeleteCalendarInfo): string[] {
  if (!info.EntityLogicalName) throw new MockApiError('EntityLogicalName is required.')
  const calendar = calendarOf(store, info.CalendarId)
  const { root } = findExisting(store, calendar, info.InnerCalendarId)
  const victims = info.IsVaried && root.groupdesignator ? calendar.calendar_calendar_rules.filter((r) => r.groupdesignator === root.groupdesignator) : [root]
  for (const v of victims) removeBlock(store, calendar, v)
  return victims.map((v) => v._innercalendarid_value!).filter(Boolean)
}

/** `msdyn_BusinessClosureSave`: a root-only rule on the organization's closure calendar. */
export function applyClosureSave(store: MockCalendarStore, closureCalendarId: string, name: string, start: string, end: string): string {
  const calendar = calendarOf(store, closureCalendarId)
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (!(endMs > startMs)) throw new MockApiError('End must be after Start.')
  const id = store.newId()
  const now = store.now()
  calendar.calendar_calendar_rules.push({
    calendarruleid: id,
    _calendarid_value: calendar.calendarid,
    _innercalendarid_value: null,
    name,
    description: null,
    pattern: null,
    starttime: new Date(startMs).toISOString(),
    endtime: null,
    duration: Math.round((endMs - startMs) / 60_000),
    effort: null,
    timecode: 2,
    subcode: 5,
    rank: 0,
    timezonecode: 92,
    effectiveintervalstart: start.slice(0, 10) + 'T00:00:00Z',
    effectiveintervalend: start.slice(0, 10) + 'T00:00:00Z',
    extentcode: 1,
    isselected: null,
    issimple: null,
    ismodified: null,
    isvaried: null,
    offset: null,
    groupdesignator: null,
    createdon: now,
    modifiedon: now,
  })
  return id
}

export function applyClosureDelete(store: MockCalendarStore, closureCalendarId: string, ruleId: string): void {
  const calendar = calendarOf(store, closureCalendarId)
  calendar.calendar_calendar_rules = calendar.calendar_calendar_rules.filter((r) => r.calendarruleid !== ruleId)
}

/** Inner calendars referenced by a calendar's root rules. */
export function innerCalendarsOf(store: MockCalendarStore, calendar: RawCalendar): RawCalendar[] {
  return calendar.calendar_calendar_rules.map((r) => (r._innercalendarid_value ? store.calendars.get(r._innercalendarid_value.toLowerCase()) : undefined)).filter((c): c is RawCalendar => !!c)
}
