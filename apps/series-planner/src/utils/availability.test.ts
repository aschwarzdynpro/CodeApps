import { describe, expect, it } from 'vitest'
import type { AvailabilityData } from '../types/series'
import { closureDays, covers, issuesFor, suggestAlternatives } from './availability'
import { zonedToUtc } from './dates'

const tz = 'Europe/Berlin'
const day = (date: string, from = '07:00', to = '16:00') => ({ start: zonedToUtc(date, from, tz), end: zonedToUtc(date, to, tz) })
const occ = (date: string, resourceId: string | null = 'r1') => ({ ...day(date, '08:00', '12:00'), resourceId })

const data: AvailabilityData = {
  closures: [{ name: 'Tag der Deutschen Einheit', ...day('2026-10-03', '00:00', '23:59') }],
  // Mon–Fri 7–16 in the week of Oct 5, absent on Wednesday.
  workingTime: { r1: ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'].map((d) => day(d)) },
  bookings: [{ id: 'b1', resourceId: 'R1', name: 'WO-4711', workOrderId: 'wo1', ...day('2026-10-06', '11:00', '13:00') }],
  unavailable: [],
}

describe('availability', () => {
  it('detects holidays, absences and conflicts', () => {
    expect(issuesFor(occ('2026-10-03'), data)).toEqual([{ kind: 'holiday', name: 'Tag der Deutschen Einheit' }])
    expect(issuesFor(occ('2026-10-07'), data)).toEqual([{ kind: 'absent' }])
    expect(issuesFor(occ('2026-10-06'), data)).toEqual([{ kind: 'conflict', with: ['WO-4711'] }])
    expect(issuesFor(occ('2026-10-06'), data, { ignoreWorkOrderIds: new Set(['wo1']) })).toEqual([])
    expect(issuesFor(occ('2026-10-05', null), data)).toEqual([{ kind: 'noResource' }])
    expect(issuesFor(occ('2026-10-05'), null)).toEqual([])
  })

  it('needs full coverage by working time', () => {
    expect(covers([day('2026-10-05', '07:00', '10:00'), day('2026-10-05', '10:00', '16:00')], occ('2026-10-05'))).toBe(true)
    expect(covers([day('2026-10-05', '09:00', '16:00')], occ('2026-10-05'))).toBe(false)
  })

  it('suggests free nearby days, never before the earliest date', () => {
    const o = { date: '2026-10-07', startTime: '08:00', durationMinutes: 240, resourceId: 'r1' }
    // Nearest first: Thursday (+1), then Friday (+2), then Monday (−2).
    expect(suggestAlternatives(o, data, tz, '2026-10-01')).toEqual(['2026-10-08', '2026-10-09', '2026-10-05'])
    expect(suggestAlternatives(o, data, tz, '2026-10-07', { count: 1 })).toEqual(['2026-10-08'])
  })
})

describe('closureDays', () => {
  it('maps closures to local days', () => {
    const c = [{ name: 'Weihnachten', start: '2026-12-24T23:00:00Z', end: '2026-12-26T23:00:00Z' }]
    expect([...closureDays(c, tz)]).toEqual([['2026-12-25', 'Weihnachten'], ['2026-12-26', 'Weihnachten']])
  })
})
