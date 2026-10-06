import { DEFAULT_TIME_ZONE_CODE } from '../config'
import { S } from '../strings'
import type { CalendarTree, LeafRule, RawCalendar, RawCalendarRule, RuleBlock, Weekday, WorkHourKind } from '../types/calendar'
import { addDays, dateOnly, formatDate, formatTime, formatWeekdays, parseDate, parseTime, timeOfDayMinutes, utcToZoned, weekday } from './dates'
import { ianaOf, timeZoneLabel } from './timezones'

/**
 * Reading the calendar tree: `calendar` → root `calendarrule` (pattern,
 * rank, effective interval, time zone, pointer to the inner calendar) →
 * inner `calendar` → leaf rules (offset, duration, type codes, effort).
 *
 * Verified live (README "Verifiziert (live)"): root dates are `T00:00:00Z`
 * day values, `effectiveintervalend` is the exclusive next midnight, leaves
 * carry `offset` + `duration` and their type in `timecode`/`subcode` (SDK
 * enums TimeCode/SubCode), weekly rules share a fixed `groupdesignator`
 * (not a group), holiday lists are yearly roots with dated leaves.
 */

export const OPEN_END_YEAR = 9999

/**
 * `timecode`/`subcode` → kind. TimeCode: 0 Available, 1 Busy, 2 Unavailable,
 * 3 Filter. SubCode: 1 Schedulable, 4 Break, 5 Holiday, 6 Vacation …
 */
export function classifyRule(timeCode: number | null | undefined, subCode: number | null | undefined): WorkHourKind {
  if (timeCode === 0) return 'work'
  if (timeCode === 2) {
    if (subCode === 4) return 'break'
    if (subCode === 5) return 'closure'
    if (subCode === 6) return 'timeoff'
    return 'nonwork'
  }
  if (timeCode === 1) return 'nonwork'
  return 'unknown'
}

/** Kind → the `timecode`/`subcode` pair we expect the server to store (used by the mock engine and tests). */
export const CODES_OF_KIND: Record<Exclude<WorkHourKind, 'unknown'>, { timeCode: number; subCode: number }> = {
  work: { timeCode: 0, subCode: 1 },
  break: { timeCode: 2, subCode: 4 },
  nonwork: { timeCode: 2, subCode: 0 },
  timeoff: { timeCode: 2, subCode: 6 },
  closure: { timeCode: 2, subCode: 5 },
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

export const BYDAY: Record<Weekday, string> = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' }
const WEEKDAY_OF_BYDAY: Record<string, Weekday> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 }
/** Order the API documentation uses. */
const BYDAY_ORDER: Weekday[] = [7, 1, 2, 3, 4, 5, 6]

export interface Pattern {
  freq: string
  interval: number
  weekdays: Weekday[] | null
  count: number | null
}

/** `FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU` → { freq, interval, weekdays }. Tolerates spaces and lower case. */
export function parsePattern(pattern: string | null | undefined): Pattern | null {
  if (!pattern) return null
  const parts = Object.fromEntries(
    pattern
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf('=')
        return i < 0 ? [p.toUpperCase(), ''] : [p.slice(0, i).trim().toUpperCase(), p.slice(i + 1).trim().toUpperCase()]
      }),
  ) as Record<string, string>
  const freq = parts.FREQ ?? ''
  if (!freq) return null
  const weekdays = parts.BYDAY
    ? parts.BYDAY.split(',')
        .map((d) => WEEKDAY_OF_BYDAY[d.trim().slice(-2)])
        .filter((d): d is Weekday => d !== undefined)
    : null
  return { freq, interval: Number(parts.INTERVAL ?? 1) || 1, weekdays: weekdays && weekdays.length ? [...new Set(weekdays)] : weekdays ? [] : null, count: parts.COUNT ? Number(parts.COUNT) : null }
}

/** The only pattern the Work Hours API accepts, with BYDAY in the documented order (SU first). */
export function formatPattern(weekdays: Weekday[]): string {
  const set = new Set(weekdays)
  return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${BYDAY_ORDER.filter((d) => set.has(d))
    .map((d) => BYDAY[d])
    .join(',')}`
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

const asBool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : null)
const asNum = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const asStr = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** Normalizes a connector/Web API row into `RawCalendarRule` (numbers may arrive as strings, booleans as "true"). */
export function normalizeRule(row: Record<string, unknown>): RawCalendarRule {
  return {
    calendarruleid: String(row.calendarruleid ?? ''),
    _calendarid_value: String(row._calendarid_value ?? row.calendarid ?? ''),
    _innercalendarid_value: asStr(row._innercalendarid_value ?? row.innercalendarid),
    name: asStr(row.name),
    description: asStr(row.description),
    pattern: asStr(row.pattern),
    starttime: asStr(row.starttime),
    endtime: asStr(row.endtime),
    duration: asNum(row.duration),
    effort: asNum(row.effort),
    timecode: asNum(row.timecode),
    subcode: asNum(row.subcode),
    rank: asNum(row.rank),
    timezonecode: asNum(row.timezonecode),
    effectiveintervalstart: asStr(row.effectiveintervalstart),
    effectiveintervalend: asStr(row.effectiveintervalend),
    extentcode: asNum(row.extentcode),
    isselected: asBool(row.isselected),
    issimple: asBool(row.issimple),
    ismodified: asBool(row.ismodified),
    isvaried: asBool(row.isvaried),
    offset: asNum(row.offset),
    groupdesignator: asStr(row.groupdesignator),
    createdon: asStr(row.createdon),
    modifiedon: asStr(row.modifiedon),
  }
}

export function normalizeCalendar(row: Record<string, unknown>): RawCalendar {
  const rules = (row.calendar_calendar_rules as Record<string, unknown>[] | undefined) ?? []
  return {
    calendarid: String(row.calendarid ?? ''),
    name: asStr(row.name),
    description: asStr(row.description),
    type: asNum(row.type),
    calendar_calendar_rules: rules.map(normalizeRule),
  }
}

/**
 * The server stores a working day with a break as ONE working leaf over the
 * whole span plus a break leaf on top (live, NAAF-Backup: work 08:00–17:00 +
 * break 12:00–12:30), not as three parts. The model works with parts that
 * don't overlap, so working leaves are cut around the breaks here (piece ids
 * `<id>#<n>`).
 */
export function splitWorkAroundBreaks(leaves: LeafRule[]): LeafRule[] {
  const breaks = leaves.filter((l) => l.kind === 'break')
  if (!breaks.length) return leaves
  return leaves
    .flatMap((l) => {
      if (l.kind !== 'work') return [l]
      let pieces = [{ s: l.startMin, e: l.startMin + l.duration }]
      for (const b of breaks) {
        const bs = b.startMin
        const be = b.startMin + b.duration
        pieces = pieces.flatMap((p) => (be <= p.s || bs >= p.e ? [p] : [...(bs > p.s ? [{ s: p.s, e: bs }] : []), ...(be < p.e ? [{ s: be, e: p.e }] : [])]))
      }
      return pieces.map((p, i) => ({ ...l, id: pieces.length > 1 ? `${l.id}#${i + 1}` : l.id, startMin: p.s, duration: p.e - p.s }))
    })
    .sort((a, b) => a.startMin - b.startMin)
}

/** Labels the server writes itself (`description` of root rules, live) — not a user's text. */
const SERVER_LABELS = /^(Weekly Single Rule|Time Off Rule|Not Working|Holiday Rule|Calendar for Business Closure)$/i
const userText = (v: string | null | undefined): string | null => (v && !SERVER_LABELS.test(v.trim()) ? v : null)

function toLeaf(r: RawCalendarRule): LeafRule {
  const startMin = r.offset ?? timeOfDayMinutes(r.starttime) ?? 0
  return { id: r.calendarruleid, kind: classifyRule(r.timecode, r.subcode), startMin, duration: r.duration ?? 0, effort: r.effort, timeCode: r.timecode, subCode: r.subcode, raw: r }
}

/**
 * `groupdesignator` every weekly work-hours rule carries in Schulz UAT
 * (168 of 168 sampled, `isvaried` false) — a fixed marker, not a group.
 */
export const WEEKLY_GROUP_DESIGNATOR = 'FC5769FC-4DE9-445D-8F4E-6E9869E60857'

/**
 * Last day (inclusive) of an `effectiveintervalend`. The server stores the
 * exclusive next midnight (a weekly rule ends `2025-09-10T00:00:00Z`, its
 * successor starts on 2025-09-10); any later time of day counts as that day.
 * Null = open end (year 9999).
 */
export function lastDayOf(iso: string | null | undefined): string | null {
  const date = dateOnly(iso)
  if (!date || parseDate(date).y >= OPEN_END_YEAR) return null
  const seconds = Number(/T\d{2}:\d{2}:(\d{2})/.exec(iso ?? '')?.[1] ?? 0)
  return (timeOfDayMinutes(iso) ?? 0) === 0 && seconds === 0 ? addDays(date, -1) : date
}

/**
 * Local day of a holiday leaf. Its `starttime` is a true UTC instant meant
 * as local midnight, but live data was written from several offsets
 * (21:00Z, 22:00Z, 23:00Z for German holidays) — so round to the nearest
 * local midnight.
 */
function holidayDay(iso: string, timeZoneCode: number): string | null {
  if (!Number.isFinite(Date.parse(iso))) return null
  const local = utcToZoned(iso, ianaOf(timeZoneCode))
  return parseTime(local.time) >= 720 ? addDays(local.date, 1) : local.date
}

function toBlock(root: RawCalendarRule, inner: RawCalendar | null, innerLoaded: boolean): RuleBlock | null {
  const start = dateOnly(root.effectiveintervalstart) ?? dateOnly(root.starttime)
  if (!start) return null
  const pattern = parsePattern(root.pattern)
  const weekdays = pattern && pattern.freq === 'WEEKLY' && pattern.weekdays && pattern.weekdays.length ? [...pattern.weekdays].sort((a, b) => a - b) : null
  const rank = root.rank ?? (weekdays ? 2 : 0)
  const timeZoneCode = root.timezonecode ?? inner?.calendar_calendar_rules.find((l) => l.timezonecode !== null)?.timezonecode ?? DEFAULT_TIME_ZONE_CODE

  // Holiday list: a yearly root whose inner calendar holds one dated rule per holiday.
  if (pattern?.freq === 'YEARLY') {
    const holidays = (inner?.calendar_calendar_rules ?? [])
      .map((l) => {
        const day = l.starttime ? holidayDay(l.starttime, timeZoneCode) : null
        return day ? { start: day, end: addDays(day, Math.max(1, Math.ceil((l.duration ?? 1440) / 1440)) - 1) } : null
      })
      .filter((h): h is { start: string; end: string } => h !== null)
      .sort((a, b) => a.start.localeCompare(b.start))
    return {
      rootRuleId: root.calendarruleid,
      innerCalendarId: root._innercalendarid_value,
      rank,
      pattern: root.pattern,
      weekdays: null,
      groupId: null,
      holidays,
      start,
      end: lastDayOf(root.effectiveintervalend),
      timeZoneCode,
      description: userText(root.description) ?? userText(inner?.name) ?? userText(root.name),
      leaves: [],
      kind: 'closure',
      startMin: 0,
      endMin: 1440,
      modifiedOn: root.modifiedon,
      createdOn: root.createdon,
      raw: { root, inner },
    }
  }

  const leaves = splitWorkAroundBreaks(inner ? inner.calendar_calendar_rules.map(toLeaf).sort((a, b) => a.startMin - b.startMin) : root._innercalendarid_value ? [] : [toLeaf(root)])
  const rootStartMin = timeOfDayMinutes(root.starttime) ?? 0
  const rootDuration = root.duration ?? 0
  const startMin = leaves.length ? Math.min(...leaves.map((l) => l.startMin)) : rootStartMin
  const endMin = leaves.length ? Math.max(...leaves.map((l) => l.startMin + l.duration)) : rootStartMin + rootDuration
  const lastDay = lastDayOf(root.effectiveintervalend)
  let end: string | null
  if (weekdays) end = lastDay
  // Occurrences (time off, closures, single days) carry their span in starttime + duration; several days ⇒ end = start + n-1.
  else if (rootDuration > 0) end = addDays(start, Math.max(0, Math.ceil((rootStartMin + rootDuration) / 1440) - 1))
  else end = lastDay === null || lastDay < start ? start : lastDay
  // Without the inner calendar only a weekly rule's kind is known: the API allows working-time recurrences only.
  const kind: WorkHourKind = leaves.some((l) => l.kind === 'work') ? 'work' : (leaves[0]?.kind ?? (!innerLoaded && weekdays ? 'work' : classifyRule(root.timecode, root.subcode)))
  return {
    rootRuleId: root.calendarruleid,
    innerCalendarId: root._innercalendarid_value,
    rank,
    pattern: root.pattern,
    weekdays,
    groupId: root.isvaried === true && root.groupdesignator && root.groupdesignator.toUpperCase() !== WEEKLY_GROUP_DESIGNATOR ? root.groupdesignator : null,
    start,
    end,
    timeZoneCode,
    // The reason of a time off (`InnerCalendarDescription`) is stored as the inner calendar's `name` (live).
    description: userText(inner?.name) ?? userText(inner?.description) ?? userText(root.description) ?? userText(root.name),
    leaves,
    kind,
    startMin,
    endMin,
    modifiedOn: root.modifiedon,
    createdOn: root.createdon,
    raw: { root, inner },
  }
}

/**
 * Builds the model from the entity's calendar and the inner calendars read
 * for it. Blocks are sorted by start date, then rank, then creation.
 * `innerLoaded` false = only the root rules were read (`innerCalendars` empty).
 */
export function buildTree(calendar: RawCalendar, innerCalendars: RawCalendar[], innerLoaded = true): CalendarTree {
  const inner = new Map(innerCalendars.map((c) => [c.calendarid.toLowerCase(), c]))
  const referenced = new Set<string>()
  const blocks: RuleBlock[] = []
  const unparsed: RawCalendarRule[] = []
  for (const root of calendar.calendar_calendar_rules) {
    const innerId = root._innercalendarid_value?.toLowerCase() ?? null
    if (innerId) referenced.add(innerId)
    const block = toBlock(root, innerId ? (inner.get(innerId) ?? null) : null, innerLoaded)
    if (block) blocks.push(block)
    else unparsed.push(root)
  }
  blocks.sort((a, b) => a.start.localeCompare(b.start) || a.rank - b.rank || (a.createdOn ?? '').localeCompare(b.createdOn ?? ''))
  return {
    calendarId: calendar.calendarid,
    name: calendar.name,
    innerLoaded,
    blocks,
    orphanInnerCalendars: innerCalendars.filter((c) => !referenced.has(c.calendarid.toLowerCase())),
    unparsed,
  }
}

// ---------------------------------------------------------------------------
// Queries on the tree
// ---------------------------------------------------------------------------

/** Does the block have an occurrence on `date` (date-only, in the block's zone)? */
export function blockAppliesOn(block: RuleBlock, date: string): boolean {
  if (date < block.start) return false
  if (block.end !== null && date > block.end) return false
  return block.weekdays === null || block.weekdays.includes(weekday(date))
}

/** Weekly recurrence — decided by the pattern, not the rank (live ranks: 2 weekly, 0 single day). */
export const isRecurrence = (block: RuleBlock): boolean => block.weekdays !== null

export const isHolidayList = (block: RuleBlock): boolean => block.holidays !== undefined

/**
 * The calendar already observes business closures from `date` on: it has a
 * holiday list that is open or ends later (live: `ObserveClosure` creates one
 * whose inner calendar is the organization's closure calendar — and one more
 * on every save that sends it, so the app only sends it when this is false).
 */
export const observesClosures = (tree: CalendarTree | null | undefined, date: string): boolean => !!tree?.blocks.some((b) => isHolidayList(b) && (b.end === null || b.end >= date))

/** Open holiday lists per inner calendar — more than one on the same calendar is a duplicate (finding). */
export function openHolidayLists(tree: CalendarTree): Map<string, RuleBlock[]> {
  const out = new Map<string, RuleBlock[]>()
  for (const b of tree.blocks) {
    if (!isHolidayList(b) || b.end !== null || !b.innerCalendarId) continue
    const key = b.innerCalendarId.toLowerCase()
    out.set(key, [...(out.get(key) ?? []), b])
  }
  return out
}

/** Blocks of a varied recurrence, keyed by group id; blocks without a group stand alone. */
export function groupBlocks(blocks: RuleBlock[]): RuleBlock[][] {
  const groups = new Map<string, RuleBlock[]>()
  const out: RuleBlock[][] = []
  for (const b of blocks) {
    if (!b.groupId) {
      out.push([b])
      continue
    }
    let g = groups.get(b.groupId)
    if (!g) {
      g = []
      groups.set(b.groupId, g)
      out.push(g)
    }
    g.push(b)
  }
  return out
}

/** Work blocks whose recurrence ends within `days` of `today` (or already ended, when `includeEnded`). */
export function blocksEndingSoon(tree: CalendarTree, today: string, days: number, includeEnded = true): RuleBlock[] {
  const horizon = addDays(today, days)
  return tree.blocks.filter((b) => isRecurrence(b) && b.kind === 'work' && b.end !== null && b.end <= horizon && (includeEnded || b.end >= today))
}

/** Work recurrences active on or after `today`. */
export function activeWorkRecurrences(tree: CalendarTree, today: string): RuleBlock[] {
  return tree.blocks.filter((b) => isRecurrence(b) && b.kind === 'work' && (b.end === null || b.end >= today))
}

export const hasWorkRules = (tree: CalendarTree): boolean => tree.blocks.some((b) => b.kind === 'work')

/** Blocks whose zone differs from the resource's. */
export function blocksInOtherZone(tree: CalendarTree, resourceTimeZoneCode: number): RuleBlock[] {
  return tree.blocks.filter((b) => b.kind !== 'closure' && b.timeZoneCode !== resourceTimeZoneCode)
}

export function findBlock(tree: CalendarTree | null | undefined, innerCalendarId: string | null | undefined): RuleBlock | null {
  if (!tree || !innerCalendarId) return null
  const id = innerCalendarId.toLowerCase()
  return tree.blocks.find((b) => b.innerCalendarId?.toLowerCase() === id || b.rootRuleId.toLowerCase() === id) ?? null
}

// ---------------------------------------------------------------------------
// Descriptions (German)
// ---------------------------------------------------------------------------

const span = (startMin: number, endMin: number) => `${formatTime(startMin)}–${endMin % 1440 === 0 && endMin > 0 ? '24:00' : formatTime(endMin)}`

/** "08:00–12:00, 12:30–17:00" of the working leaves. */
export function workSpans(block: RuleBlock): string {
  const work = block.leaves.filter((l) => l.kind === 'work')
  return work.length ? work.map((l) => span(l.startMin, l.startMin + l.duration)).join(', ') : span(block.startMin, block.endMin)
}

export function breakSpans(block: RuleBlock): string[] {
  return block.leaves.filter((l) => l.kind === 'break').map((l) => span(l.startMin, l.startMin + l.duration))
}

export const isAllDay = (block: RuleBlock): boolean => block.startMin === 0 && block.endMin > 0 && block.endMin % 1440 === 0

/** One line per block: "Wöchentlich Mo–Fr 08:00–17:00 · Pause 12:00–12:30 · ab 01.01.2026 · ohne Ende". */
export function describeBlock(block: RuleBlock): string {
  const parts: string[] = []
  if (block.holidays) return S.rules.holidayList(block.holidays.length, block.raw.inner !== null, formatDate(block.start), block.end ? formatDate(block.end) : null)
  if (block.kind === 'closure') return `${S.kinds.closure}: ${block.description ?? ''} ${formatDate(block.start)}${block.end && block.end !== block.start ? `–${formatDate(block.end)}` : ''}`.trim()
  if (block.weekdays) parts.push(`${S.rules.weekly} ${formatWeekdays(block.weekdays)}`)
  else parts.push(block.end && block.end !== block.start ? `${formatDate(block.start)}–${formatDate(block.end)}` : formatDate(block.start))
  const kind = block.kind === 'work' ? '' : `${S.kinds[block.kind]}${block.description && block.kind === 'timeoff' ? ` „${block.description}“` : ''}`
  if (kind) parts.push(kind)
  // Root rules only (list view): the times live in the inner calendar, which isn't loaded yet.
  const timesKnown = block.leaves.length > 0 || !block.innerCalendarId
  if (timesKnown) parts.push(isAllDay(block) ? S.rules.allDay : workSpans(block))
  for (const b of breakSpans(block)) parts.push(S.rules.pauseAt(b))
  const efforts = [...new Set(block.leaves.filter((l) => l.kind === 'work' && l.effort !== null && l.effort !== 1).map((l) => l.effort))]
  if (efforts.length) parts.push(`${S.rules.capacity} ${efforts.join('/')}`)
  if (block.weekdays) {
    parts.push(`${S.rules.from} ${formatDate(block.start)}`)
    parts.push(block.end ? `${S.rules.until} ${formatDate(block.end)}` : S.rules.openEnd)
  }
  if (block.groupId) parts.push(S.rules.varied)
  return parts.join(' · ')
}

export function describeZone(block: RuleBlock): string {
  return timeZoneLabel(block.timeZoneCode)
}
