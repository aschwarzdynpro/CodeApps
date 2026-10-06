import { describe, expect, it } from 'vitest'
import { addDays, dateOnly, eachDay, endOfMonth, formatWeekdays, isoWeek, minutesInto, parseServerDate, startOfIsoWeek, timeOfDayMinutes, utcToZoned, weekday, zonedToUtc } from './dates'

describe('dates', () => {
  it('parses WCF dates from msdyn_LoadCalendars and ISO strings', () => {
    expect(parseServerDate('/Date(1791176400000)/')).toBe('2026-10-05T05:00:00.000Z')
    expect(parseServerDate('/Date(1791176400000+0100)/')).toBe('2026-10-05T05:00:00.000Z')
    expect(parseServerDate('2026-10-05T05:00:00Z')).toBe('2026-10-05T05:00:00.000Z')
    expect(parseServerDate('kaputt')).toBeNull()
    expect(parseServerDate(undefined)).toBeNull()
  })

  it('does weekday and week math on UTC day numbers', () => {
    expect(weekday('2026-10-05')).toBe(1)
    expect(startOfIsoWeek('2026-10-08')).toBe('2026-10-05')
    expect(isoWeek('2026-10-05')).toBe(41)
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(eachDay('2026-10-05', '2026-10-07')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07'])
  })

  it('converts zoned times across DST', () => {
    expect(zonedToUtc('2026-07-01', '08:00', 'Europe/Berlin')).toBe('2026-07-01T06:00:00.000Z')
    expect(zonedToUtc('2026-12-01', '08:00', 'Europe/Berlin')).toBe('2026-12-01T07:00:00.000Z')
    expect(utcToZoned('2026-07-01T06:00:00.000Z', 'Europe/Berlin')).toEqual({ date: '2026-07-01', time: '08:00' })
  })

  it('reads stored calendar rule fields literally', () => {
    expect(dateOnly('2026-10-05T00:00:00Z')).toBe('2026-10-05')
    expect(timeOfDayMinutes('2026-10-05T08:30:00Z')).toBe(510)
    expect(timeOfDayMinutes(null)).toBeNull()
  })

  it('clamps minutes into a day', () => {
    expect(minutesInto('2026-10-05T00:00:00Z', '2026-10-05T01:30:00Z', 1440)).toBe(90)
    expect(minutesInto('2026-10-05T00:00:00Z', '2026-10-06T01:30:00Z', 1440)).toBe(1440)
  })

  it('formats weekday sets compactly', () => {
    expect(formatWeekdays([1, 2, 3, 4, 5])).toBe('Mo–Fr')
    expect(formatWeekdays([1, 3, 5])).toBe('Mo, Mi, Fr')
    expect(formatWeekdays([5, 1, 2, 4])).toBe('Mo–Di, Do–Fr')
    expect(formatWeekdays([6, 7])).toBe('Sa–So')
  })
})
