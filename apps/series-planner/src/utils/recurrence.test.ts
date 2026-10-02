import { describe, expect, it } from 'vitest'
import type { SeriesDefinition } from '../types/series'
import { describeRule, describeSeries, expandSeries, monthlyDate, patternDates, plannedOccurrences, ruleDates } from './recurrence'

const def = (over: Partial<SeriesDefinition> = {}): SeriesDefinition => ({
  version: 1,
  timeZone: 'Europe/Berlin',
  end: { kind: 'count', count: 5 },
  segments: [{ from: '2026-10-05', rule: { kind: 'weekly', interval: 1, weekdays: [1] }, startTime: '08:00', durationMinutes: 240, resourceId: 'r1' }],
  overrides: {},
  skips: {},
  ...over,
})

describe('ruleDates', () => {
  it('weekly on several days, anchored at the start week', () => {
    expect(ruleDates({ kind: 'weekly', interval: 1, weekdays: [4, 1] }, '2026-10-07', '2026-10-20', 99)).toEqual(['2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19'])
  })
  it('every two weeks', () => {
    expect(ruleDates({ kind: 'weekly', interval: 2, weekdays: [1] }, '2026-10-05', '2026-11-30', 99)).toEqual(['2026-10-05', '2026-10-19', '2026-11-02', '2026-11-16', '2026-11-30'])
  })
  it('monthly by day, clamped to short months', () => {
    expect(ruleDates({ kind: 'monthly', interval: 1, monthly: { mode: 'day', day: 31 } }, '2026-12-01', '2027-03-31', 99)).toEqual(['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31'])
  })
  it('quarterly on the first Monday, starting after the start date', () => {
    expect(ruleDates({ kind: 'monthly', interval: 3, monthly: { mode: 'weekday', nth: 1, weekday: 1 } }, '2026-10-06', '2027-12-31', 99)).toEqual(['2027-01-04', '2027-04-05', '2027-07-05', '2027-10-04'])
  })
  it('last Friday of the month', () => {
    expect(monthlyDate(2026, 10, { mode: 'weekday', nth: -1, weekday: 5 })).toBe('2026-10-30')
    expect(monthlyDate(2027, 1, { mode: 'weekday', nth: -1, weekday: 5 })).toBe('2027-01-29')
  })
})

describe('patternDates', () => {
  it('stops after the count across segments', () => {
    const d = def({
      segments: [
        def().segments[0],
        { from: '2026-10-19', rule: { kind: 'weekly', interval: 1, weekdays: [2] }, startTime: '09:00', durationMinutes: 60, resourceId: 'r2' },
      ],
    })
    expect(patternDates(d).map((p) => `${p.key}/${p.segmentIndex}`)).toEqual(['2026-10-05/0', '2026-10-12/0', '2026-10-20/1', '2026-10-27/1', '2026-11-03/1'])
  })
  it('stops at an end date', () => {
    expect(patternDates(def({ end: { kind: 'date', date: '2026-10-19' } })).map((p) => p.key)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19'])
  })
})

describe('expandSeries', () => {
  it('applies overrides and skips and converts to UTC', () => {
    const d = def({
      overrides: { '2026-10-12': { date: '2026-10-13', resourceId: 'r9' } },
      skips: { '2026-10-26': { reason: 'Urlaub' } },
    })
    const all = expandSeries(d)
    expect(all.find((e) => e.key === '2026-10-26')?.skipped).toBe('Urlaub')
    const planned = plannedOccurrences(d)
    expect(planned.map((p) => p.date)).toEqual(['2026-10-05', '2026-10-13', '2026-10-19', '2026-11-02'])
    const moved = planned[1]
    expect(moved).toMatchObject({ key: '2026-10-12', resourceId: 'r9', moved: true, start: '2026-10-13T06:00:00.000Z', end: '2026-10-13T10:00:00.000Z' })
    // After the DST change 08:00 Berlin is 07:00 UTC.
    expect(planned[3].start).toBe('2026-11-02T07:00:00.000Z')
  })
})

describe('describe', () => {
  it('reads like a calendar', () => {
    expect(describeRule({ kind: 'weekly', interval: 2, weekdays: [4, 1] })).toBe('Alle 2 Wochen montags und donnerstags')
    expect(describeRule({ kind: 'monthly', interval: 3, monthly: { mode: 'weekday', nth: -1, weekday: 5 } })).toBe('Quartalsweise am letzten Freitag')
    expect(describeRule({ kind: 'monthly', interval: 1, monthly: { mode: 'day', day: 15 } })).toBe('Monatlich am 15.')
    expect(describeSeries(def())).toBe('Wöchentlich montags, 08:00–12:00, 5 Termine')
  })
})
