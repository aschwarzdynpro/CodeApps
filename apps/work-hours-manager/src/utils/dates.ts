import type { Weekday } from '../types/calendar'

/**
 * Calendar dates as `YYYY-MM-DD` strings and times as `HH:mm`. Date math
 * runs on UTC day numbers, so DST never shifts a day. Only the conversion of
 * a local date + time in a named zone to a UTC instant needs the zone, and
 * that goes through `Intl` (no date library).
 */

const DAY_MS = 86_400_000

export function parseDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number)
  return { y, m, d }
}

export function toDateStr(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const { y, m, d } = parseDate(date)
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

const epochDay = (date: string): number => {
  const { y, m, d } = parseDate(date)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

const fromEpochDay = (n: number): string => {
  const dt = new Date(n * DAY_MS)
  return toDateStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

export const addDays = (date: string, days: number): string => fromEpochDay(epochDay(date) + days)

/** Whole days from `a` to `b` (positive when b is later). */
export const diffDays = (a: string, b: string): number => epochDay(b) - epochDay(a)

export const minDate = (a: string, b: string): string => (a < b ? a : b)
export const maxDate = (a: string, b: string): string => (a > b ? a : b)

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function weekday(date: string): Weekday {
  const js = new Date(epochDay(date) * DAY_MS).getUTCDay()
  return (js === 0 ? 7 : js) as Weekday
}

export const startOfIsoWeek = (date: string): string => addDays(date, 1 - weekday(date))

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Month arithmetic on (year, month 1-12). */
export function addMonths(y: number, m: number, months: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + months
  return { y: Math.floor(total / 12), m: (total % 12) + 1 }
}

/** ISO 8601 week number. */
export function isoWeek(date: string): number {
  const thursday = addDays(date, 4 - weekday(date))
  const { y } = parseDate(thursday)
  return Math.floor(diffDays(toDateStr(y, 1, 1), thursday) / 7) + 1
}

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

export function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function formatTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const isValidTime = (time: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(tz, f)
  }
  return f
}

function zonedParts(utcMs: number, tz: string): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const parts = partsFormatter(tz).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute'), s: get('second') }
}

/** Offset of `tz` against UTC at instant `utcMs`, in minutes (Berlin summer: +120). */
function offsetMinutes(utcMs: number, tz: string): number {
  const p = zonedParts(utcMs, tz)
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - utcMs) / 60_000)
}

/** Local date + time in `tz` → UTC ISO string. Correct across DST changes. */
export function zonedToUtc(date: string, time: string, tz: string): string {
  const { y, m, d } = parseDate(date)
  const naive = Date.UTC(y, m - 1, d, 0, parseTime(time))
  const first = offsetMinutes(naive, tz)
  let utc = naive - first * 60_000
  const second = offsetMinutes(utc, tz)
  if (second !== first) utc = naive - second * 60_000
  return new Date(utc).toISOString()
}

/** UTC instant → local date and time in `tz`. */
export function utcToZoned(iso: string, tz: string): { date: string; time: string } {
  const p = zonedParts(Date.parse(iso), tz)
  return { date: toDateStr(p.y, p.m, p.d), time: formatTime(p.h * 60 + p.min) }
}

export const addMinutesIso = (iso: string, minutes: number): string => new Date(Date.parse(iso) + minutes * 60_000).toISOString()

/**
 * Date from a server JSON string: ISO 8601 or the WCF form `/Date(1791176400000)/`
 * (optionally with `+0100`), which `msdyn_LoadCalendars` returns. Null when unparseable.
 */
export function parseServerDate(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  const wcf = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value)
  const ms = wcf ? Number(wcf[1]) : Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'
  } catch {
    return 'Europe/Berlin'
  }
}

/** Today's date in `tz`. */
export function todayIn(tz: string, now: number = Date.now()): string {
  return utcToZoned(new Date(now).toISOString(), tz).date
}

/** Same instant, compared numerically — Dataverse and `toISOString` format differently. */
export const sameInstant = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && Date.parse(a) === Date.parse(b)

// ---------------------------------------------------------------------------
// German formatting
// ---------------------------------------------------------------------------

export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const
export const WEEKDAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const
export const MONTH_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'] as const

/** `05.10.2026` */
export function formatDate(date: string): string {
  const { y, m, d } = parseDate(date)
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
}

/** `Mo 05.10.2026` */
export const formatDateWithDay = (date: string): string => `${WEEKDAY_SHORT[weekday(date) - 1]} ${formatDate(date)}`

/** `05.10.` */
export function formatDayMonth(date: string): string {
  const { m, d } = parseDate(date)
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m} Min.` : m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`
}

/** `08:00–12:00` */
export const timeRange = (startTime: string, durationMinutes: number): string => `${startTime}–${formatTime(parseTime(startTime) + durationMinutes)}`

// ---------------------------------------------------------------------------
// Additions for the calendar views
// ---------------------------------------------------------------------------

/** First day of the month of `date`. */
export function startOfMonth(date: string): string {
  const { y, m } = parseDate(date)
  return toDateStr(y, m, 1)
}

/** Last day of the month of `date`. */
export function endOfMonth(date: string): string {
  const { y, m } = parseDate(date)
  return toDateStr(y, m, daysInMonth(y, m))
}

/** Every date from `from` to `to` (inclusive); empty when `to` < `from`. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** `Oktober 2026` */
export function formatMonthYear(date: string): string {
  const { y, m } = parseDate(date)
  return `${MONTH_LONG[m - 1]} ${y}`
}

/** Minutes of a UTC instant relative to a UTC day start, clamped to the day's length. */
export function minutesInto(dayStartIso: string, iso: string, dayMinutes: number): number {
  const m = Math.round((Date.parse(iso) - Date.parse(dayStartIso)) / 60_000)
  return Math.max(0, Math.min(dayMinutes, m))
}

/** `YYYY-MM-DD` of an ISO string as stored — no zone conversion (calendar rule intervals are "UTC-naive"). */
export const dateOnly = (iso: string | null | undefined): string | null => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null)

/** Minutes from midnight of the time portion of an ISO string, read literally (same convention). */
export function timeOfDayMinutes(iso: string | null | undefined): number | null {
  const m = iso ? /T(\d{2}):(\d{2})/.exec(iso) : null
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Weekdays as a compact German label: [1,2,3,4,5] → "Mo–Fr", [1,3,5] → "Mo, Mi, Fr". */
export function formatWeekdays(days: Weekday[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    parts.push(j - i >= 1 ? `${WEEKDAY_SHORT[sorted[i] - 1]}–${WEEKDAY_SHORT[sorted[j] - 1]}` : sorted.slice(i, j + 1).map((d) => WEEKDAY_SHORT[d - 1]).join(', '))
    i = j + 1
  }
  return parts.join(', ')
}
