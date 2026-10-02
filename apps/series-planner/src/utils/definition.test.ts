import { describe, expect, it } from 'vitest'
import type { SeriesDefinition } from '../types/series'
import { definitionRange, editFrom, editWholeSeries, endSeriesAfter, parseDefinition, serializeDefinition, setOverride, setSkip, validateDefinition } from './definition'
import { plannedOccurrences } from './recurrence'

const base: SeriesDefinition = {
  version: 1,
  timeZone: 'Europe/Berlin',
  end: { kind: 'date', date: '2026-11-30' },
  segments: [{ from: '2026-10-05', rule: { kind: 'weekly', interval: 1, weekdays: [1] }, startTime: '08:00', durationMinutes: 240, resourceId: 'r1' }],
  overrides: { '2026-10-12': { resourceId: 'r2' }, '2026-11-09': { startTime: '10:00' } },
  skips: {},
}
const values = { rule: { kind: 'weekly' as const, interval: 1, weekdays: [3 as const] }, startTime: '07:00', durationMinutes: 120, resourceId: 'r3' }

describe('definition edits', () => {
  it('round-trips through JSON and rejects garbage', () => {
    const parsed = parseDefinition(serializeDefinition(base))
    expect(parsed.ok && parsed.value).toEqual(base)
    expect(parseDefinition('{"version":2}').ok).toBe(false)
    expect(parseDefinition('nope').ok).toBe(false)
  })

  it('"this and all following" adds a segment and drops later overrides on request', () => {
    const d = editFrom(base, '2026-11-02', values, base.end, { keepOverrides: false })
    expect(d.segments.map((s) => s.from)).toEqual(['2026-10-05', '2026-11-02'])
    expect(Object.keys(d.overrides)).toEqual(['2026-10-12'])
    expect(plannedOccurrences(d).map((o) => o.date)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25'])
  })

  it('editing from the first occurrence is the whole series', () => {
    const d = editFrom(base, '2026-10-05', values, base.end, { keepOverrides: true })
    expect(d.segments).toHaveLength(1)
    expect(d).toEqual(editWholeSeries(base, '2026-10-05', values, base.end, { keepOverrides: true }))
  })

  it('sets and clears overrides and skips', () => {
    let d = setOverride(base, '2026-10-19', { date: '2026-10-20', resourceId: undefined })
    expect(d.overrides['2026-10-19']).toEqual({ date: '2026-10-20' })
    d = setOverride(d, '2026-10-19', null)
    expect(d.overrides['2026-10-19']).toBeUndefined()
    d = setSkip(d, '2026-10-26', 'Feiertag')
    expect(plannedOccurrences(d).some((o) => o.key === '2026-10-26')).toBe(false)
    expect(setSkip(d, '2026-10-26', null).skips).toEqual({})
  })

  it('ends a series and reports its range', () => {
    const d = endSeriesAfter(base, '2026-10-19')
    expect(definitionRange(d)).toEqual({ first: '2026-10-05', last: '2026-10-19' })
  })

  it('validates', () => {
    expect(validateDefinition(base)).toEqual([])
    const bad = { ...base, end: { kind: 'date' as const, date: '2026-01-01' }, segments: [{ ...base.segments[0], rule: { kind: 'weekly' as const, interval: 1, weekdays: [] }, startTime: '25:00' }] }
    expect(validateDefinition(bad)).toEqual(['Mindestens einen Wochentag wählen.', 'Ungültige Uhrzeit.', 'Das Ende liegt vor dem Beginn.'])
  })
})
