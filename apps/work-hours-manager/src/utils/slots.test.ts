import { describe, expect, it } from 'vitest'
import { workingSlots, type ServerSlot } from './slots'

const ev = (start: string, end: string, timeCode: number | null): ServerSlot => ({ calendarId: 'c', innerCalendarId: 'i', start, end, effort: 1, timeCode })

describe('workingSlots', () => {
  it('cuts the break the server returns on top of the working span (live, NAAF-Backup)', () => {
    const slots = workingSlots([ev('2026-11-14T07:00:00.000Z', '2026-11-14T16:00:00.000Z', 0), ev('2026-11-14T11:00:00.000Z', '2026-11-14T11:30:00.000Z', 2)])
    expect(slots.map((s) => [s.start, s.end])).toEqual([
      ['2026-11-14T07:00:00.000Z', '2026-11-14T11:00:00.000Z'],
      ['2026-11-14T11:30:00.000Z', '2026-11-14T16:00:00.000Z'],
    ])
  })

  it('drops non-working events and keeps capacity filters from cutting', () => {
    const slots = workingSlots([ev('2026-11-16T06:00:00.000Z', '2026-11-16T14:00:00.000Z', 0), ev('2026-11-16T06:00:00.000Z', '2026-11-16T14:00:00.000Z', 3), ev('2026-10-30T22:00:00.000Z', '2026-10-31T22:00:00.000Z', 2)])
    expect(slots.map((s) => [s.start, s.end])).toEqual([['2026-11-16T06:00:00.000Z', '2026-11-16T14:00:00.000Z']])
  })

  it('treats events without TimeCode as working time', () => {
    expect(workingSlots([ev('2026-11-16T06:00:00.000Z', '2026-11-16T14:00:00.000Z', null)])).toHaveLength(1)
  })
})
