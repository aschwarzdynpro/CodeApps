import { describe, expect, it } from 'vitest'
import { FIXTURE_CALENDARS, treeOf } from '../fixtures/calendars'
import type { Resource } from '../types/calendar'
import { diagnose, findingsByResource, worstSeverity } from './diagnostics'

const resource = (n: number, name: string, calendarKey: keyof typeof FIXTURE_CALENDARS | null, extra: Partial<Resource> = {}): Resource => ({
  id: `r${n}`,
  name,
  type: 'user',
  timeZoneCode: 110,
  calendarId: calendarKey ? FIXTURE_CALENDARS[calendarKey].calendar.calendarid : null,
  orgUnit: null,
  active: true,
  categories: [],
  territories: [],
  userId: null,
  displayOnScheduleBoard: true,
  ...extra,
})

const trees = Object.fromEntries((['weekly', 'ending', 'otherZone', 'orphan', 'timeoff'] as const).map((k) => [FIXTURE_CALENDARS[k].calendar.calendarid.toLowerCase(), treeOf(k)]))

describe('diagnose', () => {
  const today = '2026-10-05'

  it('finds nothing wrong with a healthy weekly calendar', () => {
    expect(diagnose({ resources: [resource(1, 'Gesund', 'weekly')], trees, today, slots: null, bookingsAfterToday: {} })).toEqual([])
  })

  it('reports a recurrence ending within 90 days as a warning, and no working time once it ended', () => {
    const soon = diagnose({ resources: [resource(2, 'Endet', 'ending')], trees, today, slots: null, bookingsAfterToday: {} })
    expect(soon.map((f) => [f.kind, f.severity])).toEqual([['ruleEnding', 'warning']])
    expect(soon[0].detail).toContain('56 Tagen')
    const after = diagnose({ resources: [resource(2, 'Endet', 'ending')], trees, today: '2026-12-15', slots: null, bookingsAfterToday: {} })
    expect(after.map((f) => [f.kind, f.severity]).sort()).toEqual([
      ['noWorkingTime', 'error'],
      ['ruleEnding', 'error'],
    ])
  })

  it('reports time zone mismatches, missing calendars, empty calendars and orphans', () => {
    const findings = diagnose({
      resources: [resource(3, 'Paris', 'otherZone'), resource(4, 'Ohne Kalender', null), resource(5, 'Reste', 'orphan')],
      trees,
      today,
      slots: null,
      bookingsAfterToday: {},
    })
    const by = findingsByResource(findings)
    expect(by.r3.map((f) => f.kind)).toEqual(['timeZoneMismatch'])
    expect(by.r3[0].detail).toContain('Paris')
    expect(by.r4.map((f) => f.kind)).toEqual(['noCalendar'])
    expect(by.r5.map((f) => f.kind)).toEqual(['orphanInnerCalendar'])
    expect(worstSeverity(by.r4)).toBe('error')
    expect(worstSeverity(by.r5)).toBe('info')
    expect(worstSeverity(undefined)).toBeNull()
  })

  it('reports inactive resources with bookings and skips their calendar checks', () => {
    const findings = diagnose({ resources: [resource(6, 'Inaktiv', null, { active: false })], trees, today, slots: null, bookingsAfterToday: { r6: 3 } })
    expect(findings.map((f) => f.kind)).toEqual(['inactiveWithBookings'])
    expect(findings[0].detail).toContain('3 Buchungen')
  })

  it('uses slots as the truth for 5.1 when provided', () => {
    const calendarId = FIXTURE_CALENDARS.weekly.calendar.calendarid.toLowerCase()
    const none = diagnose({ resources: [resource(7, 'Leer', 'weekly')], trees, today, slots: { [calendarId]: [] }, bookingsAfterToday: {} })
    expect(none.map((f) => f.kind)).toEqual(['noWorkingTime'])
    const some = diagnose({ resources: [resource(7, 'Leer', 'weekly')], trees, today, slots: { [calendarId]: [{ calendarId, innerCalendarId: null, start: '2026-10-06T06:00:00Z', end: '2026-10-06T10:00:00Z', effort: 1 }] }, bookingsAfterToday: {} })
    expect(some).toEqual([])
  })

  it('sorts errors first, then by name', () => {
    const findings = diagnose({ resources: [resource(8, 'Zebra', null), resource(9, 'Anton', 'otherZone'), resource(10, 'Berta', null)], trees, today, slots: null, bookingsAfterToday: {} })
    expect(findings.map((f) => f.resourceName)).toEqual(['Berta', 'Zebra', 'Anton'])
  })
})
