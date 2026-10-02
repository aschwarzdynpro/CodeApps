import { describe, expect, it } from 'vitest'
import type { OccurrenceRecord, SeriesDefinition } from '../types/series'
import { editFrom, setSkip } from './definition'
import { countActions, planSeries } from './planner'
import { plannedOccurrences } from './recurrence'

const def: SeriesDefinition = {
  version: 1,
  timeZone: 'Europe/Berlin',
  end: { kind: 'count', count: 4 },
  segments: [{ from: '2026-10-05', rule: { kind: 'weekly', interval: 1, weekdays: [1] }, startTime: '08:00', durationMinutes: 240, resourceId: 'r1' }],
  overrides: {},
  skips: {},
}

/** Records exactly as `d` planned them. */
function materialize(d: SeriesDefinition): OccurrenceRecord[] {
  return plannedOccurrences(d).map((o, i) => ({
    key: o.key,
    workOrderId: `wo${i}`,
    workOrderName: `WO-${i}`,
    bookingId: `b${i}`,
    start: o.start.replace('.000Z', 'Z'),
    end: o.end,
    resource: { id: o.resourceId!, name: o.resourceId! },
    state: 'scheduled',
  }))
}

const now = '2026-10-01T00:00:00Z'

describe('planSeries', () => {
  it('creates everything for a new series and skips the past', () => {
    const actions = planSeries(def, [], { now: '2026-10-06T00:00:00Z', previous: null, overwriteDeviations: false })
    expect(actions.map((a) => `${a.kind}:${a.key}`)).toEqual(['keep:2026-10-05', 'create:2026-10-12', 'create:2026-10-19', 'create:2026-10-26'])
  })

  it('keeps matching records and updates those the edit changed', () => {
    const records = materialize(def)
    expect(countActions(planSeries(def, records, { now, previous: def, overwriteDeviations: false }))).toMatchObject({ keep: 4 })
    const edited = editFrom(def, '2026-10-19', { ...def.segments[0], startTime: '09:00', resourceId: 'r2' }, def.end, { keepOverrides: true })
    const actions = planSeries(edited, records, { now, previous: def, overwriteDeviations: false })
    const updates = actions.filter((a) => a.kind === 'update')
    expect(updates.map((a) => a.key)).toEqual(['2026-10-19', '2026-10-26'])
    expect(updates[0].kind === 'update' && updates[0].changes).toEqual(['time', 'resource'])
  })

  it('keeps hand-made changes unless told to overwrite them', () => {
    const records = materialize(def)
    records[2] = { ...records[2], start: '2026-10-19T07:00:00Z', end: '2026-10-19T11:00:00Z' } // moved on the board
    const edited = editFrom(def, '2026-10-05', { ...def.segments[0], durationMinutes: 180 }, def.end, { keepOverrides: true })
    const keep = planSeries(edited, records, { now, previous: def, overwriteDeviations: false })
    expect(keep.find((a) => a.key === '2026-10-19')).toMatchObject({ kind: 'keep', why: 'deviates' })
    const overwrite = planSeries(edited, records, { now, previous: def, overwriteDeviations: true })
    expect(overwrite.find((a) => a.key === '2026-10-19')).toMatchObject({ kind: 'update' })
  })

  it('cancels skipped dates and dates the pattern dropped, never locked ones', () => {
    const records = materialize(def)
    records[0] = { ...records[0], state: 'completed' }
    const shorter = setSkip({ ...def, end: { kind: 'count', count: 3 } }, '2026-10-12', 'Feiertag')
    const actions = planSeries(shorter, records, { now, previous: def, overwriteDeviations: false })
    expect(actions.map((a) => `${a.kind}:${a.key}`)).toEqual(['keep:2026-10-05', 'cancel:2026-10-12', 'keep:2026-10-19', 'cancel:2026-10-26'])
    expect(actions[1]).toMatchObject({ reason: 'skipped' })
    expect(actions[3]).toMatchObject({ reason: 'notInPattern' })
  })

  it('does not re-create cancelled dates unless restored', () => {
    const records = materialize(def).map((r) => (r.key === '2026-10-12' ? { ...r, state: 'canceled' as const } : r))
    expect(planSeries(def, records, { now, previous: def, overwriteDeviations: false }).find((a) => a.key === '2026-10-12')).toMatchObject({ why: 'canceled' })
    const restore = planSeries(def, records, { now, previous: def, overwriteDeviations: false, onlyKeys: new Set(['2026-10-12']), recreate: new Set(['2026-10-12']) })
    expect(restore.map((a) => a.kind)).toEqual(['create'])
  })

  it('books work orders that lost their booking', () => {
    const records = materialize(def)
    records[1] = { ...records[1], bookingId: null, start: null, end: null, resource: null, state: 'unscheduled' }
    expect(planSeries(def, records, { now, previous: def, overwriteDeviations: false }).find((a) => a.key === '2026-10-12')).toMatchObject({ kind: 'update' })
  })
})
