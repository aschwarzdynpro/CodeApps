import type { MonthlyRule, PlannedOccurrence, RecurrenceRule, Segment, SeriesDefinition, Weekday } from '../types/series'
import {
  addDays,
  addMinutesIso,
  addMonths,
  daysInMonth,
  formatDate,
  formatTime,
  minDate,
  parseDate,
  parseTime,
  startOfIsoWeek,
  toDateStr,
  weekday,
  WEEKDAY_LONG,
  zonedToUtc,
} from './dates'

/**
 * Expands a series definition into occurrence dates.
 *
 * Weekly rules anchor at the ISO week of the segment start ("every 2 weeks"
 * counts from there), monthly rules at the segment's start month. Segments
 * run back to back; the overall end (date or count) spans all of them —
 * Outlook counts "end after N occurrences" the same way, including
 * occurrences that were later deleted.
 */

/** Safety limits: no series runs longer, no rule produces more. */
export const MAX_OCCURRENCES = 260
export const MAX_SPAN_DAYS = 3 * 366

/** Date of a monthly rule in month (y, m). */
export function monthlyDate(y: number, m: number, rule: MonthlyRule): string {
  const dim = daysInMonth(y, m)
  if (rule.mode === 'day') return toDateStr(y, m, Math.min(Math.max(1, rule.day), dim))
  if (rule.nth === -1) {
    const last = toDateStr(y, m, dim)
    return addDays(last, -((weekday(last) - rule.weekday + 7) % 7))
  }
  const first = toDateStr(y, m, 1)
  return addDays(first, (rule.weekday - weekday(first) + 7) % 7 + (rule.nth - 1) * 7)
}

/** Dates of one rule between `from` and `until` (both inclusive), at most `limit`. */
export function ruleDates(rule: RecurrenceRule, from: string, until: string, limit: number): string[] {
  const out: string[] = []
  const interval = Math.max(1, Math.floor(rule.interval))
  if (until < from || limit <= 0) return out

  if (rule.kind === 'weekly') {
    const days = [...new Set(rule.weekdays)].sort((a, b) => a - b)
    if (days.length === 0) return out
    for (let week = startOfIsoWeek(from); week <= until && out.length < limit; week = addDays(week, 7 * interval)) {
      for (const wd of days) {
        const date = addDays(week, wd - 1)
        if (date >= from && date <= until) out.push(date)
        if (out.length >= limit) break
      }
    }
    return out
  }

  const start = parseDate(from)
  for (let k = 0; out.length < limit; k += interval) {
    const { y, m } = addMonths(start.y, start.m, k)
    if (toDateStr(y, m, 1) > until) break
    const date = monthlyDate(y, m, rule.monthly)
    if (date >= from && date <= until) out.push(date)
  }
  return out
}

/** Last day the definition can reach: its end date, or the safety span. */
export function hardEnd(def: SeriesDefinition): string {
  const start = def.segments[0]?.from ?? '1970-01-01'
  const cap = addDays(start, MAX_SPAN_DAYS)
  return def.end.kind === 'date' ? minDate(def.end.date, cap) : cap
}

export interface PatternEntry {
  /** Pattern date = occurrence key. */
  key: string
  segmentIndex: number
}

/** All pattern dates of a definition in order, before skips and overrides. */
export function patternDates(def: SeriesDefinition): PatternEntry[] {
  const out: PatternEntry[] = []
  const end = hardEnd(def)
  const limit = def.end.kind === 'count' ? Math.min(def.end.count, MAX_OCCURRENCES) : MAX_OCCURRENCES
  def.segments.forEach((seg, i) => {
    if (out.length >= limit) return
    const next = def.segments[i + 1]
    const until = next ? minDate(addDays(next.from, -1), end) : end
    for (const key of ruleDates(seg.rule, seg.from, until, limit - out.length)) out.push({ key, segmentIndex: i })
  })
  return out
}

export interface ExpandedEntry extends PatternEntry {
  /** Reason when the date is intentionally not planned. */
  skipped: string | null
  occurrence: PlannedOccurrence
}

/** Pattern dates with skips marked and overrides applied, converted to UTC. */
export function expandSeries(def: SeriesDefinition): ExpandedEntry[] {
  return patternDates(def).map(({ key, segmentIndex }) => {
    const seg = def.segments[segmentIndex]
    return { key, segmentIndex, skipped: def.skips[key]?.reason ?? null, occurrence: plan(def, key, seg, segmentIndex) }
  })
}

function plan(def: SeriesDefinition, key: string, seg: Segment, segmentIndex: number): PlannedOccurrence {
  const ov = def.overrides[key] ?? {}
  const date = ov.date ?? key
  const startTime = ov.startTime ?? seg.startTime
  const durationMinutes = ov.durationMinutes ?? seg.durationMinutes
  const resourceId = ov.resourceId !== undefined ? ov.resourceId : seg.resourceId
  const start = zonedToUtc(date, startTime, def.timeZone)
  return {
    key,
    date,
    startTime,
    durationMinutes,
    resourceId,
    start,
    end: addMinutesIso(start, durationMinutes),
    moved: date !== key || startTime !== seg.startTime || durationMinutes !== seg.durationMinutes,
    segmentIndex,
  }
}

/** Occurrences the series wants to exist (skipped dates left out). */
export function plannedOccurrences(def: SeriesDefinition): PlannedOccurrence[] {
  return expandSeries(def)
    .filter((e) => e.skipped === null)
    .map((e) => e.occurrence)
}

/** The planned occurrence for one pattern date, skipped or not; null when the date isn't in the pattern. */
export function occurrenceFor(def: SeriesDefinition, key: string): PlannedOccurrence | null {
  return expandSeries(def).find((e) => e.key === key)?.occurrence ?? null
}

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------

const ADVERB = ['montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags', 'sonntags']
const NTH = { 1: 'ersten', 2: 'zweiten', 3: 'dritten', 4: 'vierten', [-1]: 'letzten' } as Record<number, string>

function joinGerman(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`
}

export function describeRule(rule: RecurrenceRule): string {
  const n = Math.max(1, rule.interval)
  if (rule.kind === 'weekly') {
    const days = joinGerman([...new Set(rule.weekdays)].sort((a, b) => a - b).map((d: Weekday) => ADVERB[d - 1]))
    const every = n === 1 ? 'Wöchentlich' : `Alle ${n} Wochen`
    return days ? `${every} ${days}` : every
  }
  const every = n === 1 ? 'Monatlich' : n === 3 ? 'Quartalsweise' : n === 12 ? 'Jährlich' : `Alle ${n} Monate`
  const when = rule.monthly.mode === 'day' ? `am ${rule.monthly.day}.` : `am ${NTH[rule.monthly.nth]} ${WEEKDAY_LONG[rule.monthly.weekday - 1]}`
  return `${every} ${when}`
}

export function describeSegment(seg: Pick<Segment, 'rule' | 'startTime' | 'durationMinutes'>): string {
  const start = parseTime(seg.startTime)
  return `${describeRule(seg.rule)}, ${seg.startTime}–${formatTime(start + seg.durationMinutes)}`
}

/** One line for lists: rule and time of the latest segment, end. */
export function describeSeries(def: SeriesDefinition): string {
  const seg = def.segments[def.segments.length - 1]
  if (!seg) return '—'
  const end = def.end.kind === 'date' ? `bis ${formatDate(def.end.date)}` : `${def.end.count} Termine`
  const changed = def.segments.length > 1 ? ` (seit ${formatDate(seg.from)})` : ''
  return `${describeSegment(seg)}${changed}, ${end}`
}
