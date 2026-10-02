import type { OccurrenceOverride, RecurrenceRule, Segment, SeriesDefinition, SeriesEnd, Weekday } from '../types/series'
import { isValidDate, isValidTime, weekday } from './dates'
import { MAX_OCCURRENCES, patternDates } from './recurrence'

/**
 * Reading, validating and editing a series definition. Edits mirror
 * Outlook: the whole series, "this and all following" (a new segment from
 * that date), or one occurrence (override or skip). All functions return a
 * new definition and leave the input untouched.
 */

export function newDefinition(start: string, timeZone: string, resourceId: string | null): SeriesDefinition {
  return {
    version: 1,
    timeZone,
    end: { kind: 'count', count: 10 },
    segments: [
      {
        from: start,
        rule: { kind: 'weekly', interval: 1, weekdays: [weekday(start)] },
        startTime: '08:00',
        durationMinutes: 240,
        resourceId,
      },
    ],
    overrides: {},
    skips: {},
  }
}

export type ParseResult = { ok: true; value: SeriesDefinition } | { ok: false; error: string }

/** Parses the stored JSON; anything malformed is reported, not repaired silently. */
export function parseDefinition(json: string | null | undefined): ParseResult {
  if (!json) return { ok: false, error: 'Der Serienplan enthält kein Muster.' }
  try {
    const v = JSON.parse(json) as Partial<SeriesDefinition>
    if (v.version !== 1 || !Array.isArray(v.segments) || v.segments.length === 0 || !v.end || !v.timeZone) {
      return { ok: false, error: 'Unbekanntes Format des Musters.' }
    }
    const def: SeriesDefinition = {
      version: 1,
      timeZone: v.timeZone,
      end: v.end,
      segments: v.segments,
      overrides: v.overrides ?? {},
      skips: v.skips ?? {},
    }
    const problems = validateDefinition(def)
    return problems.length ? { ok: false, error: problems.join(' ') } : { ok: true, value: def }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function serializeDefinition(def: SeriesDefinition): string {
  return JSON.stringify(def)
}

function validateRule(rule: RecurrenceRule): string[] {
  const out: string[] = []
  if (!(rule.interval >= 1 && rule.interval <= 52)) out.push('Das Intervall muss zwischen 1 und 52 liegen.')
  if (rule.kind === 'weekly') {
    if (rule.weekdays.length === 0) out.push('Mindestens einen Wochentag wählen.')
  } else if (rule.monthly.mode === 'day' && !(rule.monthly.day >= 1 && rule.monthly.day <= 31)) {
    out.push('Der Tag im Monat muss zwischen 1 und 31 liegen.')
  }
  return out
}

export function validateSegment(seg: Segment): string[] {
  const out = validateRule(seg.rule)
  if (!isValidDate(seg.from)) out.push('Ungültiges Startdatum.')
  if (!isValidTime(seg.startTime)) out.push('Ungültige Uhrzeit.')
  if (!(seg.durationMinutes >= 5 && seg.durationMinutes <= 24 * 60)) out.push('Die Dauer muss zwischen 5 Minuten und 24 Stunden liegen.')
  return out
}

/** Problems that block saving, in German, for the form. */
export function validateDefinition(def: SeriesDefinition): string[] {
  const out = def.segments.flatMap(validateSegment)
  for (let i = 1; i < def.segments.length; i++) {
    if (def.segments[i].from <= def.segments[i - 1].from) out.push('Die Abschnitte der Serie sind nicht aufsteigend.')
  }
  const start = def.segments[0]?.from
  if (def.end.kind === 'date') {
    if (!isValidDate(def.end.date)) out.push('Ungültiges Enddatum.')
    else if (start && def.end.date < start) out.push('Das Ende liegt vor dem Beginn.')
  } else if (!(def.end.count >= 1 && def.end.count <= MAX_OCCURRENCES)) {
    out.push(`Die Anzahl der Termine muss zwischen 1 und ${MAX_OCCURRENCES} liegen.`)
  }
  return [...new Set(out)]
}

/** The segment that applies on `date` (the last one starting on or before it). */
export function segmentIndexAt(def: SeriesDefinition, date: string): number {
  let idx = 0
  def.segments.forEach((s, i) => {
    if (s.from <= date) idx = i
  })
  return idx
}

export type SegmentValues = Omit<Segment, 'from'>

export interface EditOptions {
  /** Keep single-occurrence changes (moves, other resource) of the affected range. */
  keepOverrides: boolean
}

function dropFrom<T>(map: Record<string, T>, from: string): Record<string, T> {
  return Object.fromEntries(Object.entries(map).filter(([k]) => k < from))
}

/** "Whole series": one segment from `start` with the new values. */
export function editWholeSeries(def: SeriesDefinition, start: string, values: SegmentValues, end: SeriesEnd, opts: EditOptions): SeriesDefinition {
  return {
    ...def,
    end,
    segments: [{ ...values, from: start }],
    overrides: opts.keepOverrides ? { ...def.overrides } : {},
    skips: { ...def.skips },
  }
}

/**
 * "This and all following": earlier segments stay, a new one starts at
 * `from`. Editing from the very first occurrence is the whole series.
 */
export function editFrom(def: SeriesDefinition, from: string, values: SegmentValues, end: SeriesEnd, opts: EditOptions): SeriesDefinition {
  const earlier = def.segments.filter((s) => s.from < from)
  if (earlier.length === 0) return editWholeSeries(def, from, values, end, opts)
  return {
    ...def,
    end,
    segments: [...earlier, { ...values, from }],
    overrides: opts.keepOverrides ? { ...def.overrides } : dropFrom(def.overrides, from),
    skips: { ...def.skips },
  }
}

/** Sets or removes (null) the override of one occurrence; empty overrides are dropped. */
export function setOverride(def: SeriesDefinition, key: string, override: OccurrenceOverride | null): SeriesDefinition {
  const overrides = { ...def.overrides }
  const clean = override ? Object.fromEntries(Object.entries(override).filter(([, v]) => v !== undefined)) : {}
  if (override === null || Object.keys(clean).length === 0) delete overrides[key]
  else overrides[key] = clean as OccurrenceOverride
  return { ...def, overrides }
}

export function setSkip(def: SeriesDefinition, key: string, reason: string | null): SeriesDefinition {
  const skips = { ...def.skips }
  if (reason === null) delete skips[key]
  else skips[key] = { reason }
  return { ...def, skips }
}

/** Ends the series after `lastDate` (inclusive): pattern dates later than that drop out. */
export function endSeriesAfter(def: SeriesDefinition, lastDate: string): SeriesDefinition {
  return { ...def, end: { kind: 'date', date: lastDate }, segments: def.segments.filter((s, i) => i === 0 || s.from <= lastDate) }
}

/** First and last pattern date — the stored start/end columns for views. */
export function definitionRange(def: SeriesDefinition): { first: string | null; last: string | null } {
  const dates = patternDates(def)
  return { first: dates[0]?.key ?? null, last: dates[dates.length - 1]?.key ?? null }
}

export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
