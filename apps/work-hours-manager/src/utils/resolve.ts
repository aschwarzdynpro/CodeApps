import { S } from '../strings'
import type { CalendarTree, Closure, DayResolution, DaySegment, LeafRule, Origin, RuleBlock, SegmentKind, Slot, TimeOffRequest, WorkHourKind } from '../types/calendar'
import { addDays, diffDays, eachDay, formatTime, minutesInto, weekday, zonedToUtc } from './dates'
import { blockAppliesOn, describeBlock, findBlock, isRecurrence } from './rules'
import { ianaOf } from './timezones'

/**
 * From rules and slots to "what applies on this day, and why".
 *
 * Truth for working time are the slots of `msdyn_LoadCalendars`; the rules
 * only explain them. Without slots (mock, preview of an edit before saving,
 * `msdyn_LoadCalendars` not reachable) `expandTree` plays the server:
 * leaf intervals of every block, then the precedence verified live with
 * `msdyn_LoadCalendars` (Schulz UAT, NAAF-Backup): a single WORKING day
 * (server rank 0, extentcode 1) beats a holiday of the resource's holiday
 * list (rank 1), which beats the weekly recurrence (rank 2) — for the whole
 * day; intersecting recurrences: the most recently modified wins (V2); time
 * off and non-working time (rank 0, extentcode 2) only carve their own span
 * (13:00–15:00 non-working leaves 07:00–13:00 of the day). Business closures
 * reach a resource only through its holiday list, whose inner calendar is the
 * organization's closure calendar (live: that is what `ObserveClosure`
 * stores) — a resource without one works on closure days.
 */

export interface Interval {
  start: number
  end: number
}

export interface BlockInterval extends Interval {
  block: RuleBlock
  leaf: LeafRule
  /** Date (in the block's zone) the interval belongs to. */
  localDate: string
}

const MIN_MS = 60_000

/** UTC ms of local `minutes` after midnight of `date` in `iana` (minutes may exceed 1440). */
function localToMs(date: string, minutesFromMidnight: number, iana: string): number {
  const dayShift = Math.floor(minutesFromMidnight / 1440)
  const rest = minutesFromMidnight - dayShift * 1440
  return Date.parse(zonedToUtc(addDays(date, dayShift), formatTime(rest), iana))
}

/**
 * Leaf intervals of a block whose local dates fall into [from, to]. A leaf
 * spanning several days (all-day time off) is split per local day.
 */
export function expandBlock(block: RuleBlock, from: string, to: string): BlockInterval[] {
  const iana = ianaOf(block.timeZoneCode)
  const out: BlockInterval[] = []
  const lo = block.start > from ? block.start : from
  const hi = block.end !== null && block.end < to ? block.end : to
  if (lo > hi) return out
  for (const date of eachDay(lo, hi)) {
    if (!blockAppliesOn(block, date)) continue
    const dayIndex = block.weekdays ? 0 : diffDays(block.start, date)
    const dayLo = dayIndex * 1440
    const dayHi = dayLo + 1440
    for (const leaf of block.leaves) {
      const s = Math.max(leaf.startMin, dayLo)
      const e = Math.min(leaf.startMin + leaf.duration, dayHi)
      if (e <= s) continue
      out.push({ block, leaf, localDate: date, start: localToMs(date, s - dayLo, iana), end: localToMs(date, e - dayLo, iana) })
    }
  }
  return out
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

/** `a` minus `b` (0, 1 or 2 pieces). */
function subtract<T extends Interval>(a: T, b: Interval): T[] {
  if (!overlaps(a, b)) return [a]
  const out: T[] = []
  if (a.start < b.start) out.push({ ...a, end: b.start })
  if (b.end < a.end) out.push({ ...a, start: b.end })
  return out
}

function subtractAll<T extends Interval>(items: T[], cuts: Interval[]): T[] {
  let cur = items
  for (const c of cuts) cur = cur.flatMap((i) => subtract(i, c))
  return cur
}

/** One day of a holiday list (whole local day). */
export interface HolidayInterval extends Interval {
  block: RuleBlock
  localDate: string
}

export interface Expansion {
  /** Effective working time. */
  work: BlockInterval[]
  breaks: BlockInterval[]
  timeOff: BlockInterval[]
  nonwork: BlockInterval[]
  /** Holidays of the resource's holiday lists that take the day (not overridden by a single day). */
  holidays: HolidayInterval[]
}

/** Holiday days of the tree's holiday lists in [from, to], as whole local days. */
function holidayDays(tree: CalendarTree, from: string, to: string): HolidayInterval[] {
  const out: HolidayInterval[] = []
  for (const block of tree.blocks) {
    if (!block.holidays) continue
    const iana = ianaOf(block.timeZoneCode)
    for (const h of block.holidays) {
      const lo = h.start > from ? h.start : from
      const hi = h.end < to ? h.end : to
      if (lo > hi || h.start < block.start || (block.end !== null && h.start > block.end)) continue
      for (const date of eachDay(lo, hi)) out.push({ block, localDate: date, start: localToMs(date, 0, iana), end: localToMs(date, 1440, iana) })
    }
  }
  return out
}

export interface ExpandOptions {
  /** V1: latest modified rank-0 rule wins the whole day; V2 (default): only the intersecting portions. */
  useV2?: boolean
}

/** Plays `msdyn_LoadCalendars` for a tree over the local dates [from, to] (block zones), plus the explaining layers. */
export function expandTree(tree: CalendarTree, from: string, to: string, opts: ExpandOptions = {}): Expansion {
  const all = tree.blocks.filter((b) => b.kind !== 'closure' && b.kind !== 'unknown').flatMap((b) => expandBlock(b, from, to))
  const byKind = (k: WorkHourKind) => all.filter((i) => i.leaf.kind === k)
  const timeOff = byKind('timeoff')
  const nonwork = byKind('nonwork')
  const breaks = byKind('break')
  let work = byKind('work')

  // Single WORKING days own their whole local day — over the recurrence and over a holiday. Non-working time only carves (below).
  const singleDays = all.filter((i) => !isRecurrence(i.block) && i.leaf.kind === 'work')
  const ownedDates = new Set(singleDays.map((i) => i.localDate))
  const holidays = holidayDays(tree, from, to).filter((h) => !ownedDates.has(h.localDate))
  const owned = [
    ...singleDays.map((i) => {
      const iana = ianaOf(i.block.timeZoneCode)
      return { start: localToMs(i.localDate, 0, iana), end: localToMs(i.localDate, 1440, iana) }
    }),
    ...holidays,
  ]
  const recurring = work.filter((i) => isRecurrence(i.block))
  const occurrences = work.filter((i) => !isRecurrence(i.block))
  let kept = subtractAll(recurring, owned)

  // Intersecting recurrences of different blocks: the most recently modified wins.
  const stamp = (i: BlockInterval) => Date.parse(i.block.modifiedOn ?? i.block.createdOn ?? '') || 0
  const resolved: BlockInterval[] = []
  for (const i of kept.sort((a, b) => stamp(b) - stamp(a) || a.start - b.start)) {
    const cuts = resolved.filter((r) => r.block !== i.block && overlaps(r, i))
    if (cuts.length === 0) resolved.push(i)
    else if (opts.useV2 === false) continue
    else resolved.push(...subtract(i, { start: Math.min(...cuts.map((c) => c.start)), end: Math.max(...cuts.map((c) => c.end)) }))
  }
  kept = resolved

  work = [...kept, ...occurrences]
  work = subtractAll(work, [...timeOff, ...nonwork])
  work.sort((a, b) => a.start - b.start)
  return { work, breaks, timeOff, nonwork, holidays }
}

/** Expansion → slots in the shape of `msdyn_LoadCalendars` (merging adjacent pieces of one block). */
export function toSlots(calendarId: string, work: BlockInterval[]): Slot[] {
  const out: Slot[] = []
  for (const w of work) {
    const last = out[out.length - 1]
    const effort = w.leaf.effort ?? 1
    if (last && last.innerCalendarId === w.block.innerCalendarId && Date.parse(last.end) === w.start && last.effort === effort) last.end = new Date(w.end).toISOString()
    else out.push({ calendarId, innerCalendarId: w.block.innerCalendarId, start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString(), effort })
  }
  return out
}

// ---------------------------------------------------------------------------
// Day resolution
// ---------------------------------------------------------------------------

export interface ResolveInput {
  date: string
  /** IANA zone of the viewer — the day boundaries. */
  viewerTz: string
  tree: CalendarTree | null
  /** Slots of the calendar from `msdyn_LoadCalendars`; null = derive from the rules. */
  slots: Slot[] | null
  /** The organization's closures — shown for resources whose holiday list points at their calendar. */
  closures: Closure[]
  timeOff?: TimeOffRequest[]
  useV2?: boolean
}

/** The holiday list of `tree` that links `closure` on `date` (its inner calendar is the closure calendar), if any. */
function linkingList(tree: CalendarTree | null, closure: Closure, date: string): RuleBlock | null {
  const cal = closure.calendarId.toLowerCase()
  return tree?.blocks.find((b) => b.holidays && b.innerCalendarId?.toLowerCase() === cal && b.start <= date && (b.end === null || date <= b.end)) ?? null
}

function originOf(block: RuleBlock | null, fallback: Origin['kind']): Origin {
  if (!block) return { kind: fallback, innerCalendarId: null, label: S.origins[fallback] }
  const kind: Origin['kind'] = block.kind === 'timeoff' ? 'timeoff' : block.kind === 'nonwork' ? 'nonwork' : isRecurrence(block) ? 'recurrence' : 'occurrence'
  return { kind, innerCalendarId: block.innerCalendarId ?? block.rootRuleId, label: describeBlock(block) }
}

const KIND_ORDER: Record<SegmentKind, number> = { work: 0, break: 1, timeoff: 2, nonwork: 3, closure: 4 }

export function resolveDay(input: ResolveInput): DayResolution {
  const { date, viewerTz, tree, closures } = input
  const dayStart = zonedToUtc(date, '00:00', viewerTz)
  const dayEnd = zonedToUtc(addDays(date, 1), '00:00', viewerTz)
  const dayStartMs = Date.parse(dayStart)
  const dayEndMs = Date.parse(dayEnd)
  const dayMinutes = Math.round((dayEndMs - dayStartMs) / MIN_MS)
  const window: Interval = { start: dayStartMs, end: dayEndMs }
  const toMin = (ms: number) => minutesInto(dayStart, new Date(ms).toISOString(), dayMinutes)
  const segments: DaySegment[] = []
  const blockIds = new Set<string>()

  const expansion = tree ? expandTree(tree, addDays(date, -1), addDays(date, 1), { useV2: input.useV2 }) : null

  // Working time: slots are the truth, the expansion the fallback.
  if (input.slots) {
    for (const s of input.slots) {
      const iv = { start: Date.parse(s.start), end: Date.parse(s.end) }
      if (!overlaps(iv, window)) continue
      const block = findBlock(tree, s.innerCalendarId)
      if (block) blockIds.add(block.innerCalendarId ?? block.rootRuleId)
      segments.push({ startMin: toMin(Math.max(iv.start, window.start)), endMin: toMin(Math.min(iv.end, window.end)), kind: 'work', effort: s.effort, origin: originOf(block, 'slot') })
    }
  } else if (expansion) {
    for (const w of expansion.work) {
      if (!overlaps(w, window)) continue
      blockIds.add(w.block.innerCalendarId ?? w.block.rootRuleId)
      segments.push({ startMin: toMin(Math.max(w.start, window.start)), endMin: toMin(Math.min(w.end, window.end)), kind: 'work', effort: w.leaf.effort ?? 1, origin: originOf(w.block, 'slot') })
    }
  }

  // Explaining layers from the rules.
  if (expansion) {
    const layer = (items: BlockInterval[], kind: SegmentKind, originKind: Origin['kind']) => {
      for (const i of items) {
        if (!overlaps(i, window)) continue
        blockIds.add(i.block.innerCalendarId ?? i.block.rootRuleId)
        const origin = originOf(i.block, originKind)
        segments.push({ startMin: toMin(Math.max(i.start, window.start)), endMin: toMin(Math.min(i.end, window.end)), kind, effort: null, origin: kind === 'break' ? { ...origin, kind: 'break' } : origin })
      }
    }
    layer(expansion.breaks, 'break', 'break')
    layer(expansion.timeOff, 'timeoff', 'timeoff')
    layer(expansion.nonwork, 'nonwork', 'nonwork')
    for (const h of expansion.holidays) {
      if (!overlaps(h, window)) continue
      blockIds.add(h.block.innerCalendarId ?? h.block.rootRuleId)
      segments.push({ startMin: toMin(Math.max(h.start, window.start)), endMin: toMin(Math.min(h.end, window.end)), kind: 'closure', effort: null, origin: { kind: 'closure', innerCalendarId: h.block.innerCalendarId ?? h.block.rootRuleId, label: describeBlock(h.block) } })
    }
  }
  for (const c of closures) {
    const iv = { start: Date.parse(c.start), end: Date.parse(c.end) }
    if (!overlaps(iv, window)) continue
    const list = linkingList(tree, c, date)
    if (!list) continue
    const listId = list.innerCalendarId ?? list.rootRuleId
    const startMin = toMin(Math.max(iv.start, window.start))
    const endMin = toMin(Math.min(iv.end, window.end))
    // A loaded list already put the day in as a holiday — name it after the closure instead of adding it twice.
    const same = segments.find((s) => s.kind === 'closure' && s.origin.innerCalendarId === listId && s.startMin < endMin && startMin < s.endMin)
    if (same) same.origin = { ...same.origin, label: c.name }
    else {
      blockIds.add(listId)
      segments.push({ startMin, endMin, kind: 'closure', effort: null, origin: { kind: 'closure', innerCalendarId: listId, label: c.name } })
    }
  }
  for (const t of input.timeOff ?? []) {
    const iv = { start: Date.parse(t.start), end: Date.parse(t.end) }
    if (!overlaps(iv, window)) continue
    // Approved requests already have a rule; the request itself adds the name as origin only when no time-off rule explains the day.
    if (segments.some((s) => s.kind === 'timeoff')) continue
    segments.push({ startMin: toMin(Math.max(iv.start, window.start)), endMin: toMin(Math.min(iv.end, window.end)), kind: 'timeoff', effort: null, origin: { kind: 'timeoff', innerCalendarId: null, label: t.name } })
  }

  segments.sort((a, b) => a.startMin - b.startMin || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
  const work = segments.filter((s) => s.kind === 'work')
  const workMinutes = work.reduce((sum, s) => sum + (s.endMin - s.startMin), 0)
  const capacityHours = Math.round((work.reduce((sum, s) => sum + (s.endMin - s.startMin) * (s.effort ?? 1), 0) / 60) * 100) / 100

  return { date, segments, workMinutes, capacityHours, reason: workMinutes > 0 ? 'none' : reasonFor(tree, date, segments), blockIds: [...blockIds] }
}

function reasonFor(tree: CalendarTree | null, date: string, segments: DaySegment[]): DayResolution['reason'] {
  if (segments.some((s) => s.kind === 'timeoff')) return 'timeoff'
  if (segments.some((s) => s.kind === 'nonwork')) return 'nonwork'
  if (segments.some((s) => s.kind === 'closure')) return 'closure'
  const workBlocks = tree?.blocks.filter((b) => b.kind === 'work') ?? []
  if (workBlocks.length === 0) return 'noRule'
  const wd = weekday(date)
  const recurring = workBlocks.filter(isRecurrence)
  if (recurring.some((b) => blockAppliesOn(b, date))) return 'none'
  if (recurring.some((b) => b.weekdays!.includes(wd) && b.end !== null && date > b.end) && !recurring.some((b) => b.weekdays!.includes(wd) && date >= b.start && (b.end === null || date <= b.end))) return 'ruleEnded'
  if (recurring.length && recurring.every((b) => date < b.start)) return 'ruleNotStarted'
  if (recurring.length && !recurring.some((b) => b.weekdays!.includes(wd))) return 'weekdayOff'
  return recurring.length ? 'none' : 'noRule'
}

/** One resolution per date in [from, to]. */
export function resolveRange(input: Omit<ResolveInput, 'date'>, from: string, to: string): DayResolution[] {
  return eachDay(from, to).map((date) => resolveDay({ ...input, date }))
}

/** Effort-weighted hours and net hours of a range. */
export function sumRange(days: DayResolution[]): { workHours: number; capacityHours: number } {
  const minutes = days.reduce((s, d) => s + d.workMinutes, 0)
  return { workHours: Math.round((minutes / 60) * 100) / 100, capacityHours: Math.round(days.reduce((s, d) => s + d.capacityHours, 0) * 100) / 100 }
}
