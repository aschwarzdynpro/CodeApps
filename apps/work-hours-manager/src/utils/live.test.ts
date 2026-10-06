import { describe, expect, it } from 'vitest'
import { FIXTURE_CALENDARS, OPEN_END, treeOf } from '../fixtures/calendars'
import { expandTree, resolveDay } from './resolve'
import { buildTree, describeBlock, groupBlocks, hasWorkRules, isRecurrence, lastDayOf } from './rules'

/**
 * The storage shape read live from Schulz UAT (README "Verifiziert"),
 * anonymized in `FIXTURE_CALENDARS.live`: split weekly rules (rank 2, fixed
 * designator, exclusive ends), a holiday list (yearly, rank 1) and a single
 * working day (rank 0) on a holiday.
 */

const BERLIN = 'Europe/Berlin'
const live = treeOf('live')
const workDays = (from: string, to: string) => [...new Set(expandTree(live, from, to).work.map((w) => w.localDate))]

describe('lastDayOf', () => {
  it('reads the exclusive next midnight as the day before', () => {
    expect(lastDayOf('2025-09-10T00:00:00Z')).toBe('2025-09-09')
    expect(lastDayOf('2026-11-30T23:59:59Z')).toBe('2026-11-30')
    expect(lastDayOf(OPEN_END)).toBeNull()
    expect(lastDayOf('9999-12-30T23:59:59Z')).toBeNull()
    expect(lastDayOf(null)).toBeNull()
  })
})

describe('live tree', () => {
  it('reads weekly rules by their pattern, with inclusive last days', () => {
    const weekly = live.blocks.filter(isRecurrence)
    expect(weekly.map((b) => [b.start, b.end, b.rank])).toEqual([
      ['2000-01-01', '2025-09-02', 2],
      ['2025-09-03', '2025-09-09', 2],
      ['2025-09-10', null, 2],
      ['2025-09-10', '2025-09-10', 2],
    ])
  })

  it('does not treat the fixed weekly designator as a varied group', () => {
    expect(live.blocks.every((b) => b.groupId === null)).toBe(true)
    expect(groupBlocks(live.blocks).every((g) => g.length === 1)).toBe(true)
  })

  it('reads the holiday list with each holiday on its local day', () => {
    const list = live.blocks.find((b) => b.holidays)!
    expect(list.kind).toBe('closure')
    expect(isRecurrence(list)).toBe(false)
    expect(list.holidays).toEqual([
      { start: '2025-04-18', end: '2025-04-21' },
      { start: '2025-05-29', end: '2025-05-29' },
      { start: '2025-10-31', end: '2025-10-31' },
      { start: '2025-12-25', end: '2025-12-25' },
    ])
    expect(describeBlock(list)).toBe('Feiertagsliste · 4 Feiertage · ab 01.01.2000')
  })

  it('follows the live precedence: single day beats holiday beats weekly', () => {
    // Easter Fri–Mon and Ascension Thursday are off; the 31.10. holiday is worked because of the single day.
    expect(workDays('2025-04-14', '2025-04-22')).toEqual(['2025-04-14', '2025-04-15', '2025-04-16', '2025-04-17', '2025-04-22'])
    expect(workDays('2025-05-29', '2025-05-29')).toEqual([])
    expect(workDays('2025-10-30', '2025-10-31')).toEqual(['2025-10-30', '2025-10-31'])
    expect(expandTree(live, '2025-10-31', '2025-10-31').holidays).toHaveLength(0)
  })

  it('switches between the split weekly rules on their exact days', () => {
    // The Saturday rule runs 10.09. (a Wednesday) to 11.09. exclusive — live artefact of an edit, it never hits a Saturday.
    expect(workDays('2025-09-01', '2025-09-14')).toEqual(['2025-09-01', '2025-09-02', '2025-09-03', '2025-09-04', '2025-09-05', '2025-09-06', '2025-09-08', '2025-09-09', '2025-09-10', '2025-09-11', '2025-09-12'])
  })

  it('explains a holiday as closure segment of the list', () => {
    const day = resolveDay({ date: '2025-05-29', viewerTz: BERLIN, tree: live, slots: null, closures: [] })
    expect(day.workMinutes).toBe(0)
    expect(day.reason).toBe('closure')
    expect(day.segments[0].origin.label).toContain('Feiertagsliste')
  })
})

describe('root rules only (list view)', () => {
  const outer = buildTree(FIXTURE_CALENDARS.live.calendar, [], false)

  it('marks the tree and still knows the weekly rules as working time', () => {
    expect(outer.innerLoaded).toBe(false)
    expect(outer.blocks).toHaveLength(live.blocks.length)
    expect(outer.blocks.filter(isRecurrence).every((b) => b.kind === 'work' && b.leaves.length === 0)).toBe(true)
    expect(hasWorkRules(outer)).toBe(true)
    expect(outer.blocks.find((b) => b.holidays)!.holidays).toEqual([])
  })
})
