import { LIMITS } from '../config'
import { S } from '../strings'
import type { CalendarTree, Finding, Resource, Slot } from '../types/calendar'
import { addDays, diffDays, formatDate, zonedToUtc } from './dates'
import { expandTree } from './resolve'
import { activeWorkRecurrences, blocksEndingSoon, blocksInOtherZone, hasWorkRules } from './rules'
import { ianaOf, timeZoneLabel } from './timezones'

/**
 * Findings 5.1–5.5 of the concept, computed from resources, their rule
 * trees, the effective slots (when available) and booking counts.
 *
 * 5.1 resources without working time in the window
 * 5.2 recurrences ending within `ruleEndingDays` or already ended
 * 5.3 rule time zone ≠ resource time zone
 * 5.4 inactive resources with bookings after today
 * 5.5 resources without calendar / without rules / orphan inner calendars
 */

export interface DiagnoseInput {
  resources: Resource[]
  /** Trees keyed by lower-cased calendar id. */
  trees: Record<string, CalendarTree>
  today: string
  /** Effective slots of the window, keyed by lower-cased calendar id; null = derive from rules. */
  slots: Record<string, Slot[]> | null
  /** Active bookings after today per resource id. */
  bookingsAfterToday: Record<string, number>
  windowDays?: number
  ruleEndingDays?: number
}

const SEVERITY_ORDER: Record<Finding['severity'], number> = { error: 0, warning: 1, info: 2 }

export function diagnose(input: DiagnoseInput): Finding[] {
  const windowDays = input.windowDays ?? LIMITS.diagnosticsWindowDays
  const ruleEndingDays = input.ruleEndingDays ?? LIMITS.ruleEndingDays
  const from = input.today
  const to = addDays(input.today, windowDays)
  const out: Finding[] = []

  for (const r of input.resources) {
    const base = { resourceId: r.id, resourceName: r.name }
    const tree = r.calendarId ? input.trees[r.calendarId.toLowerCase()] : undefined

    // 5.4 — independent of the calendar.
    const bookings = input.bookingsAfterToday[r.id] ?? 0
    if (!r.active && bookings > 0) out.push({ ...base, kind: 'inactiveWithBookings', severity: 'warning', detail: S.findingDetails.inactiveWithBookings(bookings, formatDate(input.today)) })

    if (!r.active) continue

    // 5.5 — no calendar / no rules / orphans.
    if (!r.calendarId) {
      out.push({ ...base, kind: 'noCalendar', severity: 'error', detail: S.findingDetails.noCalendar })
      continue
    }
    if (!tree) continue // not loaded (yet) — nothing to say
    if (!hasWorkRules(tree)) out.push({ ...base, kind: 'noCalendar', severity: 'warning', detail: S.findingDetails.noRules })
    if (tree.orphanInnerCalendars.length) out.push({ ...base, kind: 'orphanInnerCalendar', severity: 'info', detail: S.findingDetails.orphan(tree.orphanInnerCalendars.length) })

    // 5.1 — no working time in the window (from slots; from the rules only when their leaves are loaded).
    const slots = input.slots?.[r.calendarId.toLowerCase()] ?? null
    if (hasWorkRules(tree) && (slots || tree.innerLoaded)) {
      const minutes = workMinutesInWindow(tree, slots, from, to, r.timeZoneCode)
      if (minutes === 0) out.push({ ...base, kind: 'noWorkingTime', severity: 'error', detail: S.findingDetails.noWorkingTime(formatDate(from), formatDate(to)) })
    }

    // 5.2 — ending or ended recurrences (ended ones only when nothing active follows).
    const active = activeWorkRecurrences(tree, input.today)
    for (const b of blocksEndingSoon(tree, input.today, ruleEndingDays)) {
      if (b.end! < input.today) {
        if (active.length === 0) out.push({ ...base, kind: 'ruleEnding', severity: 'error', detail: S.findingDetails.ruleEnded(formatDate(b.end!)), innerCalendarId: b.innerCalendarId })
      } else {
        const successor = active.some((a) => a !== b && (a.end === null || a.end > b.end!) && a.start <= addDays(b.end!, 1))
        out.push({ ...base, kind: 'ruleEnding', severity: successor ? 'info' : 'warning', detail: S.findingDetails.ruleEndsIn(diffDays(input.today, b.end!), formatDate(b.end!)), innerCalendarId: b.innerCalendarId })
      }
    }

    // 5.3 — zone mismatch.
    const foreign = blocksInOtherZone(tree, r.timeZoneCode)
    if (foreign.length) {
      const zones = [...new Set(foreign.map((b) => b.timeZoneCode))]
      out.push({ ...base, kind: 'timeZoneMismatch', severity: 'warning', detail: S.findingDetails.tzMismatch(zones.map(timeZoneLabel).join(', '), timeZoneLabel(r.timeZoneCode)), innerCalendarId: foreign[0].innerCalendarId })
    }
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.resourceName.localeCompare(b.resourceName, 'de'))
}

function workMinutesInWindow(tree: CalendarTree, slots: Slot[] | null, from: string, to: string, timeZoneCode: number): number {
  if (slots) {
    const iana = ianaOf(timeZoneCode)
    const lo = Date.parse(zonedToUtc(from, '00:00', iana))
    const hi = Date.parse(zonedToUtc(addDays(to, 1), '00:00', iana))
    return slots.reduce((sum, s) => {
      const a = Math.max(Date.parse(s.start), lo)
      const b = Math.min(Date.parse(s.end), hi)
      return b > a ? sum + (b - a) / 60_000 : sum
    }, 0)
  }
  return expandTree(tree, from, to).work.reduce((sum, w) => sum + (w.end - w.start) / 60_000, 0)
}

/** Findings per resource id. */
export function findingsByResource(findings: Finding[]): Record<string, Finding[]> {
  const out: Record<string, Finding[]> = {}
  for (const f of findings) (out[f.resourceId] ??= []).push(f)
  return out
}

/** Worst severity of a resource's findings. */
export function worstSeverity(findings: Finding[] | undefined): Finding['severity'] | null {
  if (!findings?.length) return null
  return findings.reduce<Finding['severity']>((w, f) => (SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[w] ? f.severity : w), 'info')
}

export const FINDING_KINDS: Finding['kind'][] = ['noWorkingTime', 'ruleEnding', 'timeZoneMismatch', 'inactiveWithBookings', 'noCalendar', 'orphanInnerCalendar']
