import type { AvailabilityData, Closure, Interval, Issue, PlannedOccurrence } from '../types/series'
import { addDays, addMinutesIso, utcToZoned, weekday, zonedToUtc } from './dates'

/**
 * Checks occurrences against public holidays (business closures), the
 * resource's working time (absences, days off) and existing bookings.
 * Holidays and absences block an occurrence — per the requirement it falls
 * out unless moved; a conflict with another booking is a warning only.
 */

export const overlaps = (a: Interval, b: Interval): boolean => Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end)

/** True when the union of `slots` covers `iv` completely. */
export function covers(slots: Interval[], iv: Interval): boolean {
  let cursor = Date.parse(iv.start)
  const end = Date.parse(iv.end)
  const sorted = slots.filter((s) => overlaps(s, iv)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  for (const s of sorted) {
    if (Date.parse(s.start) > cursor) return false
    cursor = Math.max(cursor, Date.parse(s.end))
    if (cursor >= end) return true
  }
  return cursor >= end
}

export interface IssueOptions {
  /** Bookings of the occurrence itself (when re-checking an existing one). */
  ignoreBookingIds?: Set<string>
  ignoreWorkOrderIds?: Set<string>
}

export function issuesFor(
  occ: Pick<PlannedOccurrence, 'start' | 'end' | 'resourceId'>,
  data: AvailabilityData | null,
  opts: IssueOptions = {},
): Issue[] {
  if (!occ.resourceId) return [{ kind: 'noResource' }]
  if (!data) return []
  const out: Issue[] = []
  const holiday = data.closures?.find((c) => overlaps(c, occ))
  if (holiday) out.push({ kind: 'holiday', name: holiday.name })
  const working = data.workingTime[occ.resourceId.toLowerCase()]
  // A holiday usually removes working time too — report it once, by name.
  if (!holiday && working && !covers(working, occ)) out.push({ kind: 'absent' })
  const clashes = data.bookings.filter(
    (b) =>
      b.resourceId.toLowerCase() === occ.resourceId!.toLowerCase() &&
      overlaps(b, occ) &&
      !opts.ignoreBookingIds?.has(b.id) &&
      !(b.workOrderId && opts.ignoreWorkOrderIds?.has(b.workOrderId)),
  )
  if (clashes.length) out.push({ kind: 'conflict', with: clashes.map((b) => b.name) })
  return out
}

export const isBlocking = (issue: Issue): boolean => issue.kind !== 'conflict'

export function issueText(issue: Issue): string {
  switch (issue.kind) {
    case 'holiday':
      return `Feiertag: ${issue.name}`
    case 'absent':
      return 'Ressource nicht verfügbar (Abwesenheit oder arbeitsfrei)'
    case 'conflict':
      return `Überschneidung mit ${issue.with.join(', ')}`
    case 'noResource':
      return 'Keine Ressource gewählt'
  }
}

/**
 * Nearby days on which the same time window is free: no holiday, no
 * absence, no other booking. Tries +1, −1, +2, −2 … days — nearest first —
 * and never goes before `earliest`. Without a known working calendar
 * weekends are skipped.
 */
export function suggestAlternatives(
  occ: Pick<PlannedOccurrence, 'date' | 'startTime' | 'durationMinutes' | 'resourceId'>,
  data: AvailabilityData | null,
  tz: string,
  earliest: string,
  opts: IssueOptions & { maxDays?: number; count?: number } = {},
): string[] {
  const maxDays = opts.maxDays ?? 7
  const count = opts.count ?? 3
  const knownCalendar = !!occ.resourceId && !!data?.workingTime[occ.resourceId.toLowerCase()]
  const out: string[] = []
  for (let i = 1; i <= maxDays && out.length < count; i++) {
    for (const date of [addDays(occ.date, i), addDays(occ.date, -i)]) {
      if (out.length >= count || date < earliest) continue
      if (!knownCalendar && weekday(date) >= 6) continue
      const start = zonedToUtc(date, occ.startTime, tz)
      const issues = issuesFor({ start, end: addMinutesIso(start, occ.durationMinutes), resourceId: occ.resourceId }, data, opts)
      if (issues.length === 0) out.push(date)
    }
  }
  return out
}

/** Local calendar days covered by closures, with the holiday name. */
export function closureDays(closures: Closure[] | null | undefined, tz: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const c of closures ?? []) {
    const first = utcToZoned(c.start, tz).date
    const last = utcToZoned(new Date(Date.parse(c.end) - 1).toISOString(), tz).date
    for (let d = first; d <= last; d = addDays(d, 1)) out.set(d, c.name)
  }
  return out
}
