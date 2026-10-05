import { S } from '../strings'
import type { ApiRule, ApiRulesAndRecurrence, CalendarEntity, CalendarEventInfo, DeleteCalendarInfo, RuleBlock, VariedAction, Weekday } from '../types/calendar'
import { WORK_HOUR_TYPE } from '../types/calendar'
import { addDays, formatTime, isValidDate, isValidTime, parseTime, weekday } from './dates'
import { formatPattern } from './rules'

/**
 * From what the editor collects (an `EditIntent`) to the requests of the
 * Work Hours API — pure, tested, and the only place that knows the JSON.
 *
 * API limits are handled here, not hidden: an event across midnight
 * becomes two requests (the API accepts no occurrence that doesn't start
 * and end on one day), time off and non-working time never recur, breaks
 * never travel alone, and `RecurrenceEndDate` is sent as `T23:59:59Z` so the
 * chosen day stays the last one (08:00:00 or earlier would mean the day
 * before).
 */

// ---------------------------------------------------------------------------
// Specs (what the editor edits)
// ---------------------------------------------------------------------------

export interface TimeSegment {
  kind: 'work' | 'break'
  /** `HH:mm` */
  start: string
  /** `HH:mm`, `24:00` = end of day; smaller than start = next day (night shift). */
  end: string
}

export interface WorkHoursSpec {
  kind: 'work'
  /** Occurrence date, or first day of the recurrence. */
  date: string
  /** null = once. */
  recurrence: { weekdays: Weekday[]; endDate: string | null } | null
  /** Same times on every selected weekday … */
  segments: TimeSegment[]
  /** … or per weekday (IsVaried); when set, `segments` is ignored. */
  varied: Partial<Record<Weekday, TimeSegment[]>> | null
  allDay: boolean
  /** Length of an all-day occurrence in days. */
  days: number
  /** Capacity (Effort), whole number ≥ 1. */
  effort: number
  observeClosure: boolean
}

export interface AbsenceSpec {
  kind: 'timeoff' | 'nonwork'
  date: string
  allDay: boolean
  days: number
  start: string
  end: string
  /** Time off only (`InnerCalendarDescription`). */
  reason: string
}

export type EventSpec = WorkHoursSpec | AbsenceSpec

export interface EditTarget {
  entity: CalendarEntity
  calendarId: string
  /** SystemUserId of a user resource (own-calendar privilege check). */
  resourceId: string | null
  timeZoneCode: number
  useV2: boolean
}

export type EditIntent =
  | { op: 'create'; target: EditTarget; spec: EventSpec }
  /** Whole recurrence or, with `split`, "this and following" from `spec.date`. `group` = all parts of a varied recurrence. */
  | { op: 'edit'; target: EditTarget; block: RuleBlock; spec: EventSpec; split: boolean; group?: RuleBlock[] }
  /** One day of a recurrence gets its own hours (API: call without IsEdit, with the recurrence's InnerCalendarId). */
  | { op: 'editDay'; target: EditTarget; block: RuleBlock; spec: WorkHoursSpec }
  /** Recurrence ends on `lastDay`. */
  | { op: 'end'; target: EditTarget; block: RuleBlock; lastDay: string }
  | { op: 'delete'; target: EditTarget; block: RuleBlock }

export type ApiRequest = { action: 'msdyn_SaveCalendar'; info: CalendarEventInfo } | { action: 'msdyn_DeleteCalendar'; info: DeleteCalendarInfo }

export const emptyWorkSpec = (date: string): WorkHoursSpec => ({
  kind: 'work',
  date,
  recurrence: { weekdays: [1, 2, 3, 4, 5], endDate: null },
  segments: [
    { kind: 'work', start: '08:00', end: '12:00' },
    { kind: 'break', start: '12:00', end: '12:30' },
    { kind: 'work', start: '12:30', end: '17:00' },
  ],
  varied: null,
  allDay: false,
  days: 1,
  effort: 1,
  observeClosure: true,
})

export const emptyAbsenceSpec = (date: string, kind: AbsenceSpec['kind'] = 'timeoff'): AbsenceSpec => ({ kind, date, allDay: true, days: 1, start: '08:00', end: '17:00', reason: '' })

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const endMinutes = (seg: TimeSegment): number => {
  if (seg.end === '24:00') return 1440
  const e = parseTime(seg.end)
  const s = parseTime(seg.start)
  return e <= s ? e + 1440 : e
}

interface Piece {
  kind: 'work' | 'break'
  /** Minutes from midnight of the first day; ≥ 1440 = next day (night shift). */
  s: number
  e: number
}

const subtractPiece = (a: Piece, b: Piece): Piece[] => {
  if (b.e <= a.s || b.s >= a.e) return [a]
  const out: Piece[] = []
  if (a.s < b.s) out.push({ ...a, e: b.s })
  if (b.e < a.e) out.push({ ...a, s: b.e })
  return out
}

/**
 * Segments → one timeline of non-overlapping pieces. Breaks may be entered
 * inside working time and are carved out (work 08–17 + break 12–12:30 →
 * 08–12, 12–12:30, 12:30–17, the form the API wants). When the last working
 * time crosses midnight, breaks and working time that lie before its end
 * belong to the next day (night shift).
 */
export function segmentTimeline(segments: TimeSegment[]): { pieces: Piece[]; errors: string[] } {
  const errors: string[] = []
  const raw: Piece[] = segments.map((seg) => ({ kind: seg.kind, s: parseTime(seg.start), e: endMinutes(seg) }))
  const spillEnd = Math.max(0, ...raw.filter((p) => p.e > 1440).map((p) => p.e - 1440))
  const shifted = raw.map((p) => (p.e <= 1440 && p.s < spillEnd ? { ...p, s: p.s + 1440, e: p.e + 1440 } : p))
  const works = shifted.filter((p) => p.kind === 'work').sort((a, b) => a.s - b.s)
  const breaks = shifted.filter((p) => p.kind === 'break').sort((a, b) => a.s - b.s)
  for (let i = 1; i < works.length; i++) if (works[i].s < works[i - 1].e) errors.push(S.editor.errors.overlap)
  for (let i = 1; i < breaks.length; i++) if (breaks[i].s < breaks[i - 1].e) errors.push(S.editor.errors.overlap)
  if (works.length === 0) errors.push(S.editor.errors.breakAlone)
  else {
    const lo = works[0].s
    const hi = works[works.length - 1].e
    if (breaks.some((b) => b.s < lo || b.e > hi)) errors.push(S.editor.errors.breakAlone)
  }
  const pieces: Piece[] = []
  for (const w of works) {
    let cur: Piece[] = [w]
    for (const b of breaks) cur = cur.flatMap((x) => subtractPiece(x, b))
    pieces.push(...cur)
  }
  pieces.push(...breaks)
  pieces.sort((a, b) => a.s - b.s)
  return { pieces: pieces.filter((p) => p.e > p.s), errors: [...new Set(errors)] }
}

export function validateSegments(segments: TimeSegment[]): string[] {
  if (segments.length === 0) return [S.editor.errors.noSegments]
  const errors: string[] = []
  for (const seg of segments) {
    if (!isValidTime(seg.start) || !(seg.end === '24:00' || isValidTime(seg.end))) errors.push(S.editor.errors.invalidTime)
    else if (endMinutes(seg) === parseTime(seg.start)) errors.push(S.editor.errors.emptySegment)
  }
  if (errors.length) return [...new Set(errors)]
  return segmentTimeline(segments).errors
}

export function validateSpec(spec: EventSpec): string[] {
  const errors: string[] = []
  if (!isValidDate(spec.date)) errors.push(S.editor.errors.invalidDate)
  if (spec.kind === 'work') {
    if (spec.allDay) {
      if (spec.recurrence) errors.push(S.editor.errors.allDayRecurrence)
      if (!(spec.days >= 1 && spec.days <= 5 * 366)) errors.push(S.editor.errors.allDayLength)
    } else if (spec.varied) {
      const days = Object.keys(spec.varied)
      if (!spec.recurrence) errors.push(S.editor.errors.variedNeedsRecurrence)
      if (days.length === 0) errors.push(S.editor.errors.noWeekdays)
      for (const [d, segs] of Object.entries(spec.varied)) if (segs && segs.length) errors.push(...validateSegments(segs).map((e) => `${S.editor.weekdayLabel(Number(d) as Weekday)}: ${e}`))
    } else errors.push(...validateSegments(spec.segments))
    if (spec.recurrence) {
      if (spec.recurrence.weekdays.length === 0 && !spec.varied) errors.push(S.editor.errors.noWeekdays)
      if (spec.recurrence.endDate !== null && (!isValidDate(spec.recurrence.endDate) || spec.recurrence.endDate < spec.date)) errors.push(S.editor.errors.endBeforeStart)
    }
    if (!Number.isInteger(spec.effort) || spec.effort < 1) errors.push(S.editor.errors.effort)
  } else {
    if (spec.allDay) {
      if (!(spec.days >= 1 && spec.days <= 5 * 366)) errors.push(S.editor.errors.allDayLength)
    } else if (!isValidTime(spec.start) || !(spec.end === '24:00' || isValidTime(spec.end))) errors.push(S.editor.errors.invalidTime)
    else if (spec.end !== '24:00' && parseTime(spec.end) <= parseTime(spec.start)) errors.push(S.editor.errors.emptySegment)
  }
  return [...new Set(errors)]
}

// ---------------------------------------------------------------------------
// Mapping to the API
// ---------------------------------------------------------------------------

const iso = (date: string, minutes: number): string => {
  const dayShift = Math.floor(minutes / 1440)
  const rest = minutes - dayShift * 1440
  return `${addDays(date, dayShift)}T${formatTime(rest)}:00.000Z`
}

/** Sends the chosen last day as "T23:59:59Z" — 08:00:00 or earlier would mean the day before. */
export const recurrenceEndIso = (lastDay: string): string => `${lastDay}T23:59:59.000Z`

const pieceToSegment = (p: Piece): TimeSegment => ({ kind: p.kind, start: formatTime(p.s), end: p.e >= 1440 ? '24:00' : formatTime(p.e) })

function rulesFor(date: string, segments: TimeSegment[], effort: number): ApiRule[] {
  return segmentTimeline(segments).pieces.map((p) => ({
    StartTime: iso(date, p.s),
    EndTime: iso(date, p.e),
    WorkHourType: p.kind === 'work' ? WORK_HOUR_TYPE.work : WORK_HOUR_TYPE.break,
    Effort: p.kind === 'work' ? effort : null,
  }))
}

/**
 * Splits the timeline at midnight: the part of the day and the part that
 * spills into the next day (night shift). The spill-over gets its own
 * request on the following day (or weekdays shifted by one for a recurrence).
 */
export function splitAtMidnight(segments: TimeSegment[]): { today: TimeSegment[]; tomorrow: TimeSegment[] } {
  const today: TimeSegment[] = []
  const tomorrow: TimeSegment[] = []
  for (const p of segmentTimeline(segments).pieces) {
    if (p.e <= 1440) today.push(pieceToSegment(p))
    else if (p.s >= 1440) tomorrow.push(pieceToSegment({ ...p, s: p.s - 1440, e: p.e - 1440 }))
    else {
      today.push(pieceToSegment({ ...p, e: 1440 }))
      tomorrow.push(pieceToSegment({ ...p, s: 0, e: p.e - 1440 }))
    }
  }
  return { today, tomorrow }
}

const shiftWeekdays = (days: Weekday[]): Weekday[] => days.map((d) => ((d % 7) + 1) as Weekday)

function base(target: EditTarget): Pick<CalendarEventInfo, 'EntityLogicalName' | 'CalendarId' | 'TimeZoneCode' | 'ResourceId' | 'UseV2'> {
  return {
    EntityLogicalName: target.entity,
    CalendarId: target.calendarId,
    TimeZoneCode: target.timeZoneCode,
    ...(target.resourceId ? { ResourceId: target.resourceId } : {}),
    ...(target.useV2 ? { UseV2: true } : {}),
  }
}

const save = (info: CalendarEventInfo): ApiRequest => ({ action: 'msdyn_SaveCalendar', info })

/** Groups weekdays with identical segments into one part (one RecurrencePattern each). */
export function variedParts(varied: NonNullable<WorkHoursSpec['varied']>): { weekdays: Weekday[]; segments: TimeSegment[] }[] {
  const parts: { key: string; weekdays: Weekday[]; segments: TimeSegment[] }[] = []
  for (const d of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) {
    const segs = varied[d]
    if (!segs || segs.length === 0) continue
    const key = JSON.stringify([...segs].sort((a, b) => parseTime(a.start) - parseTime(b.start)))
    const part = parts.find((p) => p.key === key)
    if (part) part.weekdays.push(d)
    else parts.push({ key, weekdays: [d], segments: segs })
  }
  return parts.map(({ weekdays, segments }) => ({ weekdays, segments }))
}

function workRequests(target: EditTarget, spec: WorkHoursSpec, edit: { block: RuleBlock; split: boolean; group?: RuleBlock[] } | null): ApiRequest[] {
  const common = base(target)
  if (spec.allDay) {
    const info: CalendarEventInfo = {
      ...common,
      RulesAndRecurrences: [{ Rules: [{ StartTime: iso(spec.date, 0), EndTime: iso(spec.date, spec.days * 1440), WorkHourType: WORK_HOUR_TYPE.work, Effort: spec.effort }] }],
    }
    if (edit) Object.assign(info, { IsEdit: true }, { RulesAndRecurrences: [{ ...info.RulesAndRecurrences[0], InnerCalendarId: edit.block.innerCalendarId }] })
    return [save(info)]
  }

  const recurrence = spec.recurrence
  if (!recurrence) {
    // Occurrence; across midnight = two occurrences.
    const { today, tomorrow } = splitAtMidnight(spec.segments)
    const out: ApiRequest[] = []
    if (today.length) {
      const info: CalendarEventInfo = { ...common, RulesAndRecurrences: [{ Rules: rulesFor(spec.date, today, spec.effort), ...(edit ? { InnerCalendarId: edit.block.innerCalendarId } : {}) }] }
      if (edit) info.IsEdit = true
      out.push(save(info))
    }
    if (tomorrow.length) out.push(save({ ...common, RulesAndRecurrences: [{ Rules: rulesFor(addDays(spec.date, 1), tomorrow, spec.effort) }] }))
    return out
  }

  const endDate = recurrence.endDate ? { RecurrenceEndDate: recurrenceEndIso(recurrence.endDate) } : {}
  const observe = { ObserveClosure: spec.observeClosure }

  if (spec.varied) {
    const parts = variedParts(spec.varied)
    const existing = edit ? groupMembers(edit.block, edit.group) : []
    const entries: ApiRulesAndRecurrence[] = []
    const spill: ApiRulesAndRecurrence[] = []
    const used = new Set<string>()
    for (const part of parts) {
      const { today, tomorrow } = splitAtMidnight(part.segments)
      const match = existing.find((b) => !used.has(b.rootRuleId) && b.weekdays && sameSet(b.weekdays, part.weekdays))
      if (match) used.add(match.rootRuleId)
      const action: VariedAction | undefined = edit ? (match ? (onlyTimesChanged(match, today, spec.effort) ? 3 : 4) : 1) : 1
      entries.push({ Rules: rulesFor(spec.date, today, spec.effort), RecurrencePattern: formatPattern(part.weekdays), Action: action, ...(edit ? { InnerCalendarId: match?.innerCalendarId ?? null } : {}) })
      if (tomorrow.length) spill.push({ Rules: rulesFor(addDays(spec.date, 1), tomorrow, spec.effort), RecurrencePattern: formatPattern(shiftWeekdays(part.weekdays)) })
    }
    for (const b of existing) if (!used.has(b.rootRuleId)) entries.push({ Rules: rulesFor(spec.date, blockSegments(b), spec.effort), RecurrencePattern: b.pattern ?? formatPattern(b.weekdays ?? []), Action: 2, InnerCalendarId: b.innerCalendarId })
    const info: CalendarEventInfo = { ...common, IsVaried: true, ...(edit ? { IsEdit: true, ...(edit.split ? { RecurrenceSplit: true } : {}) } : {}), ...endDate, ...observe, RulesAndRecurrences: entries }
    const out: ApiRequest[] = [save(info)]
    if (spill.length) out.push(save({ ...common, ...endDate, ...observe, RulesAndRecurrences: spill }))
    return out
  }

  const { today, tomorrow } = splitAtMidnight(spec.segments)
  const out: ApiRequest[] = []
  const first: CalendarEventInfo = {
    ...common,
    ...endDate,
    ...observe,
    ...(edit ? { IsEdit: true, ...(edit.split ? { RecurrenceSplit: true } : {}) } : {}),
    RulesAndRecurrences: [{ Rules: rulesFor(spec.date, today, spec.effort), RecurrencePattern: formatPattern(recurrence.weekdays), ...(edit ? { InnerCalendarId: edit.block.innerCalendarId } : {}) }],
  }
  out.push(save(first))
  if (tomorrow.length) out.push(save({ ...common, ...endDate, ...observe, RulesAndRecurrences: [{ Rules: rulesFor(addDays(spec.date, 1), tomorrow, spec.effort), RecurrencePattern: formatPattern(shiftWeekdays(recurrence.weekdays)) }] }))
  return out
}

function absenceRequests(target: EditTarget, spec: AbsenceSpec, edit: RuleBlock | null): ApiRequest[] {
  const type = spec.kind === 'timeoff' ? WORK_HOUR_TYPE.timeoff : WORK_HOUR_TYPE.nonwork
  const rule: ApiRule = spec.allDay
    ? { StartTime: iso(spec.date, 0), EndTime: iso(spec.date, spec.days * 1440), WorkHourType: type, Effort: null }
    : { StartTime: iso(spec.date, parseTime(spec.start)), EndTime: iso(spec.date, endMinutes({ kind: 'work', start: spec.start, end: spec.end })), WorkHourType: type, Effort: null }
  const info: CalendarEventInfo = {
    ...base(target),
    ...(spec.kind === 'timeoff' && spec.reason.trim() ? { InnerCalendarDescription: spec.reason.trim() } : {}),
    ...(edit ? { IsEdit: true } : {}),
    RulesAndRecurrences: [{ Rules: [rule], ...(edit ? { InnerCalendarId: edit.innerCalendarId } : {}) }],
  }
  return [save(info)]
}

/** Requests for an intent, in the order they must run. Throws on an invalid spec. */
export function toRequests(intent: EditIntent): ApiRequest[] {
  switch (intent.op) {
    case 'create': {
      const errors = validateSpec(intent.spec)
      if (errors.length) throw new Error(errors.join(' '))
      return intent.spec.kind === 'work' ? workRequests(intent.target, intent.spec, null) : absenceRequests(intent.target, intent.spec, null)
    }
    case 'edit': {
      const errors = validateSpec(intent.spec)
      if (errors.length) throw new Error(errors.join(' '))
      return intent.spec.kind === 'work' ? workRequests(intent.target, intent.spec, { block: intent.block, split: intent.split, group: intent.group }) : absenceRequests(intent.target, intent.spec, intent.block)
    }
    case 'editDay': {
      const errors = validateSpec(intent.spec)
      if (errors.length) throw new Error(errors.join(' '))
      const { today, tomorrow } = splitAtMidnight(intent.spec.segments)
      const out: ApiRequest[] = [save({ ...base(intent.target), RulesAndRecurrences: [{ Rules: rulesFor(intent.spec.date, today, intent.spec.effort), InnerCalendarId: intent.block.innerCalendarId }] })]
      if (tomorrow.length) out.push(save({ ...base(intent.target), RulesAndRecurrences: [{ Rules: rulesFor(addDays(intent.spec.date, 1), tomorrow, intent.spec.effort), InnerCalendarId: intent.block.innerCalendarId }] }))
      return out
    }
    case 'end': {
      if (!isValidDate(intent.lastDay) || intent.lastDay < intent.block.start) throw new Error(S.editor.errors.endBeforeStart)
      const b = intent.block
      const effort = b.leaves.find((l) => l.kind === 'work')?.effort ?? 1
      return [
        save({
          ...base(intent.target),
          IsEdit: true,
          RecurrenceEndDate: recurrenceEndIso(intent.lastDay),
          ...(b.groupId ? { IsVaried: true } : {}),
          RulesAndRecurrences: [{ Rules: rulesFor(b.start, blockSegments(b), effort), RecurrencePattern: b.pattern ?? formatPattern(b.weekdays ?? []), InnerCalendarId: b.innerCalendarId, ...(b.groupId ? { Action: 3 as const } : {}) }],
        }),
      ]
    }
    case 'delete':
      if (!intent.block.innerCalendarId) throw new Error(S.editor.errors.noInnerCalendar)
      return [
        {
          action: 'msdyn_DeleteCalendar',
          info: { EntityLogicalName: intent.target.entity, CalendarId: intent.target.calendarId, InnerCalendarId: intent.block.innerCalendarId, ...(intent.block.groupId ? { IsVaried: true } : {}), ...(intent.target.useV2 ? { UseV2: true } : {}) },
        },
      ]
  }
}

// ---------------------------------------------------------------------------
// Blocks → specs (pre-filling the editor)
// ---------------------------------------------------------------------------

const sameSet = (a: Weekday[], b: Weekday[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

/** Segments of a block's work/break leaves. */
export function blockSegments(block: RuleBlock): TimeSegment[] {
  return block.leaves
    .filter((l) => l.kind === 'work' || l.kind === 'break')
    .map((l) => ({ kind: l.kind as 'work' | 'break', start: formatTime(l.startMin), end: l.startMin + l.duration >= 1440 ? '24:00' : formatTime(l.startMin + l.duration) }))
}

function onlyTimesChanged(block: RuleBlock, segments: TimeSegment[], effort: number): boolean {
  const before = blockSegments(block)
  const kinds = (s: TimeSegment[]) => s.map((x) => x.kind).join()
  return kinds(before) === kinds([...segments].sort((a, b) => parseTime(a.start) - parseTime(b.start))) || effort !== (block.leaves.find((l) => l.kind === 'work')?.effort ?? 1)
}

/** All members of a varied group the block belongs to (or the block alone). */
export function groupMembers(block: RuleBlock, all?: RuleBlock[]): RuleBlock[] {
  if (!block.groupId || !all) return [block]
  return all.filter((b) => b.groupId === block.groupId)
}

/** The spec a block edits as; `all` resolves varied groups. */
export function specFromBlock(block: RuleBlock, all?: RuleBlock[]): EventSpec {
  if (block.kind === 'timeoff' || block.kind === 'nonwork') {
    const leaf = block.leaves[0]
    const allDay = block.startMin === 0 && block.endMin % 1440 === 0 && block.endMin > 0
    return {
      kind: block.kind,
      date: block.start,
      allDay,
      days: allDay ? Math.max(1, Math.round((leaf ? leaf.duration : 1440) / 1440)) : 1,
      start: formatTime(block.startMin),
      end: block.endMin >= 1440 ? '24:00' : formatTime(block.endMin),
      reason: block.description ?? '',
    }
  }
  const members = groupMembers(block, all)
  const effort = block.leaves.find((l) => l.kind === 'work')?.effort ?? 1
  const allDay = block.weekdays === null && block.startMin === 0 && block.endMin % 1440 === 0 && block.endMin > 0
  const varied: WorkHoursSpec['varied'] = members.length > 1 || block.groupId ? {} : null
  if (varied) for (const m of members) for (const d of m.weekdays ?? []) varied[d] = blockSegments(m)
  return {
    kind: 'work',
    date: block.start,
    recurrence: block.weekdays ? { weekdays: varied ? (Object.keys(varied).map(Number) as Weekday[]) : block.weekdays, endDate: block.end } : null,
    segments: blockSegments(block),
    varied,
    allDay,
    days: allDay ? Math.max(1, Math.round(block.endMin / 1440)) : 1,
    effort: effort ?? 1,
    observeClosure: true,
  }
}

/** Spec of a single day taken out of a recurrence (editDay pre-fill). */
export function daySpecFromBlock(block: RuleBlock, date: string): WorkHoursSpec {
  const spec = specFromBlock(block) as WorkHoursSpec
  const segs = spec.varied ? (spec.varied[weekday(date)] ?? spec.segments) : spec.segments
  return { ...spec, date, recurrence: null, varied: null, segments: segs }
}

/** German one-liner of what a request does — for the preview and the run log. */
export function describeRequest(r: ApiRequest): string {
  if (r.action === 'msdyn_DeleteCalendar') return `${S.editor.requestDelete} ${r.info.InnerCalendarId}${r.info.IsVaried ? ` (${S.rules.varied})` : ''}`
  const info = r.info
  const parts = info.RulesAndRecurrences.map((rr) => {
    const rules = rr.Rules.map((x) => `${x.StartTime.slice(11, 16)}–${x.EndTime.slice(11, 16) === '00:00' ? '24:00' : x.EndTime.slice(11, 16)}${x.WorkHourType === 1 ? ` ${S.kinds.break}` : x.WorkHourType === 3 ? ` ${S.kinds.timeoff}` : x.WorkHourType === 2 ? ` ${S.kinds.nonwork}` : ''}`).join(', ')
    const pattern = rr.RecurrencePattern ? ` · ${rr.RecurrencePattern.replace('FREQ=WEEKLY;INTERVAL=1;BYDAY=', '')}` : ''
    const action = rr.Action ? ` · Action ${rr.Action}` : ''
    return `${rr.Rules[0]?.StartTime.slice(0, 10) ?? ''} ${rules}${pattern}${action}`
  })
  const flags = [info.IsEdit ? 'IsEdit' : '', info.RecurrenceSplit ? 'RecurrenceSplit' : '', info.IsVaried ? 'IsVaried' : '', info.RecurrenceEndDate ? `${S.rules.until} ${info.RecurrenceEndDate.slice(0, 10)}` : ''].filter(Boolean).join(', ')
  return `${S.editor.requestSave}: ${parts.join(' | ')}${flags ? ` (${flags})` : ''}`
}
