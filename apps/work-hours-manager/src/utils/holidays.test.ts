import { describe, expect, it } from 'vitest'
import type { Closure } from '../types/calendar'
import { bussUndBettag, closureSpan, easterSunday, generateHolidays, reconcile } from './holidays'

describe('easterSunday', () => {
  it('matches known dates', () => {
    expect(easterSunday(2024)).toBe('2024-03-31')
    expect(easterSunday(2025)).toBe('2025-04-20')
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')
    expect(easterSunday(2038)).toBe('2038-04-25')
  })
})

describe('generateHolidays', () => {
  it('produces the nine nationwide German holidays', () => {
    const h = generateHolidays('DE', 2026)
    expect(h.map((x) => `${x.date} ${x.name}`)).toEqual([
      '2026-01-01 Neujahr',
      '2026-04-03 Karfreitag',
      '2026-04-06 Ostermontag',
      '2026-05-01 Tag der Arbeit',
      '2026-05-14 Christi Himmelfahrt',
      '2026-05-25 Pfingstmontag',
      '2026-10-03 Tag der Deutschen Einheit',
      '2026-12-25 1. Weihnachtstag',
      '2026-12-26 2. Weihnachtstag',
    ])
    expect(h.every((x) => x.scope === 'national')).toBe(true)
  })

  it('adds the Bavarian holidays, marking Mariä Himmelfahrt as optional', () => {
    const h = generateHolidays('DE-BY', 2027)
    const regional = h.filter((x) => x.scope === 'regional').map((x) => x.name)
    expect(regional).toEqual(['Heilige Drei Könige', 'Fronleichnam', 'Mariä Himmelfahrt', 'Allerheiligen'])
    expect(h.find((x) => x.key === 'fronleichnam')?.date).toBe('2027-05-27')
    expect(h.find((x) => x.key === 'mariae-himmelfahrt')?.optional).toBe(true)
    expect(h).toHaveLength(13)
  })

  it('computes Buß- und Bettag for Saxony', () => {
    expect(bussUndBettag(2026)).toBe('2026-11-18')
    expect(bussUndBettag(2027)).toBe('2027-11-17')
    expect(generateHolidays('DE-SN', 2026).map((x) => x.key)).toContain('buss-und-bettag')
  })

  it('knows Austria and Switzerland', () => {
    expect(generateHolidays('AT', 2026)).toHaveLength(13)
    expect(generateHolidays('AT', 2026).find((x) => x.key === 'nationalfeiertag')?.date).toBe('2026-10-26')
    expect(generateHolidays('CH', 2026).find((x) => x.key === 'bundesfeier')?.date).toBe('2026-08-01')
    expect(generateHolidays('XX', 2026)).toEqual([])
  })
})

describe('reconcile', () => {
  const tz = 'Europe/Berlin'
  const closure = (id: string, name: string, date: string, days = 1): Closure => ({ id, name, ...closureSpan(date, tz, days) })

  it('classifies present, missing, renamed and partial closures and finds extras and duplicates', () => {
    const holidays = generateHolidays('DE', 2026)
    const closures: Closure[] = [
      closure('a', 'Neujahr', '2026-01-01'),
      closure('b', 'Good Friday', '2026-04-03'),
      { id: 'c', name: 'Ostermontag', start: '2026-04-06T06:00:00.000Z', end: '2026-04-06T12:00:00.000Z' },
      closure('d', 'Betriebsferien', '2026-12-28', 4),
      closure('e', 'Tag der Arbeit', '2026-05-01'),
      closure('f', 'Maifeiertag', '2026-05-01'),
    ]
    const r = reconcile(holidays, closures, 2026, tz)
    const status = Object.fromEntries(r.matches.map((m) => [m.holiday.key, m.status]))
    expect(status.neujahr).toBe('ok')
    expect(status.karfreitag).toBe('nameDiffers')
    expect(status.ostermontag).toBe('partial')
    expect(status['tag-der-arbeit']).toBe('ok')
    expect(status['christi-himmelfahrt']).toBe('missing')
    expect(r.extra.map((c) => c.id)).toEqual(['d', 'f'])
    expect(r.duplicates).toHaveLength(1)
    expect(r.duplicates[0].map((c) => c.id)).toEqual(['e', 'f'])
  })

  it('builds the closure span of a local day in UTC', () => {
    expect(closureSpan('2026-10-03', tz)).toEqual({ start: '2026-10-02T22:00:00.000Z', end: '2026-10-03T22:00:00.000Z' })
    expect(closureSpan('2026-12-25', tz, 2)).toEqual({ start: '2026-12-24T23:00:00.000Z', end: '2026-12-26T23:00:00.000Z' })
  })
})
