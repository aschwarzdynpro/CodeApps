import { describe, expect, it } from 'vitest'
import { addDays, addMonths, diffDays, isoWeek, isValidDate, utcToZoned, weekday, zonedToUtc } from './dates'

describe('date math', () => {
  it('adds days across months, years and DST', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(diffDays('2026-10-01', '2026-11-01')).toBe(31)
  })
  it('knows ISO weekdays and weeks', () => {
    expect(weekday('2026-10-05')).toBe(1)
    expect(weekday('2026-10-04')).toBe(7)
    expect(isoWeek('2026-10-05')).toBe(41)
    expect(isoWeek('2027-01-01')).toBe(53)
  })
  it('does month arithmetic and validates dates', () => {
    expect(addMonths(2026, 11, 3)).toEqual({ y: 2027, m: 2 })
    expect(addMonths(2026, 1, -1)).toEqual({ y: 2025, m: 12 })
    expect(isValidDate('2026-02-29')).toBe(false)
    expect(isValidDate('2028-02-29')).toBe(true)
  })
})

describe('time zones', () => {
  it('converts Berlin local time to UTC on both sides of the DST change', () => {
    expect(zonedToUtc('2026-10-23', '08:00', 'Europe/Berlin')).toBe('2026-10-23T06:00:00.000Z')
    expect(zonedToUtc('2026-10-26', '08:00', 'Europe/Berlin')).toBe('2026-10-26T07:00:00.000Z')
    expect(zonedToUtc('2027-03-29', '08:00', 'Europe/Berlin')).toBe('2027-03-29T06:00:00.000Z')
  })
  it('converts back', () => {
    expect(utcToZoned('2026-10-26T07:00:00Z', 'Europe/Berlin')).toEqual({ date: '2026-10-26', time: '08:00' })
    expect(utcToZoned('2026-10-23T22:30:00Z', 'Europe/Berlin')).toEqual({ date: '2026-10-24', time: '00:30' })
  })
})
