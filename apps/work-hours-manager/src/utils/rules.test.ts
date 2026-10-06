import { describe, expect, it } from 'vitest'
import { FIXTURE_CALENDARS, treeOf } from '../fixtures/calendars'
import { blockAppliesOn, blocksEndingSoon, buildTree, classifyRule, describeBlock, formatPattern, groupBlocks, normalizeRule, parsePattern } from './rules'

describe('parsePattern / formatPattern', () => {
  it('reads the weekly pattern of the API', () => {
    expect(parsePattern('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR')).toEqual({ freq: 'WEEKLY', interval: 1, weekdays: [1, 2, 3, 4, 5], count: null })
  })
  it('tolerates spaces, lower case and SU first', () => {
    expect(parsePattern(' freq=weekly; interval=1; byday=su,sa ')?.weekdays).toEqual([7, 6])
  })
  it('reads daily occurrences without weekdays', () => {
    expect(parsePattern('FREQ=DAILY;COUNT=1')).toEqual({ freq: 'DAILY', interval: 1, weekdays: null, count: 1 })
    expect(parsePattern(null)).toBeNull()
  })
  it('writes BYDAY in the documented order', () => {
    expect(formatPattern([5, 1, 7, 3])).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=SU,MO,WE,FR')
  })
})

describe('classifyRule', () => {
  it('maps the SDK codes', () => {
    expect(classifyRule(0, 1)).toBe('work')
    expect(classifyRule(2, 4)).toBe('break')
    expect(classifyRule(2, 5)).toBe('closure')
    expect(classifyRule(2, 6)).toBe('timeoff')
    expect(classifyRule(2, 0)).toBe('nonwork')
    expect(classifyRule(3, 1)).toBe('unknown')
    expect(classifyRule(null, null)).toBe('unknown')
  })
})

describe('buildTree', () => {
  const tree = treeOf('weekly')

  it('joins root rules with their inner calendars', () => {
    expect(tree.blocks).toHaveLength(1)
    const b = tree.blocks[0]
    expect(b.innerCalendarId).toBe(FIXTURE_CALENDARS.weekly.inner[0].calendarid)
    expect(b.weekdays).toEqual([1, 2, 3, 4, 5])
    expect(b.rank).toBe(2)
    expect(b.leaves.map((l) => l.kind)).toEqual(['work', 'break', 'work'])
    expect(b.startMin).toBe(8 * 60)
    expect(b.endMin).toBe(17 * 60)
    expect(b.end).toBeNull()
    expect(b.timeZoneCode).toBe(110)
  })

  it('describes the block in German', () => {
    expect(describeBlock(tree.blocks[0])).toBe('Wöchentlich Mo–Fr · 08:00–12:00, 12:30–17:00 · Pause 12:00–12:30 · ab 05.01.2026 · ohne Ende')
  })

  it('applies on working days inside the interval only', () => {
    const b = tree.blocks[0]
    expect(blockAppliesOn(b, '2026-10-05')).toBe(true) // Monday
    expect(blockAppliesOn(b, '2026-10-10')).toBe(false) // Saturday
    expect(blockAppliesOn(b, '2025-12-31')).toBe(false) // before start
  })

  it('treats 9999 as open end and real dates as ending', () => {
    const ending = treeOf('ending')
    expect(ending.blocks[0].end).toBe('2026-11-30')
    expect(blocksEndingSoon(ending, '2026-10-05', 90).map((b) => b.end)).toEqual(['2026-11-30'])
    expect(blocksEndingSoon(ending, '2026-10-05', 30)).toHaveLength(0)
  })

  it('groups varied recurrences by groupdesignator', () => {
    const varied = treeOf('varied')
    const groups = groupBlocks(varied.blocks)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
    expect(groups[0].map((b) => b.weekdays)).toEqual([[1], [3]])
    expect(describeBlock(groups[0][1])).toContain('je Wochentag verschieden')
  })

  it('reads time off as a single-day block (rank 0) spanning its days with the reason', () => {
    const t = treeOf('timeoff')
    const off = t.blocks.find((b) => b.kind === 'timeoff')!
    expect(off.rank).toBe(0)
    expect(off.weekdays).toBeNull()
    expect(off.start).toBe('2026-10-12')
    expect(off.end).toBe('2026-10-14')
    expect(off.description).toBe('Urlaub')
    expect(describeBlock(off)).toBe('12.10.2026–14.10.2026 · Abwesenheit „Urlaub“ · ganztägig')
  })

  it('splits a night shift into two occurrences and keeps their order', () => {
    const t = treeOf('night')
    const occ = t.blocks.filter((b) => b.weekdays === null)
    expect(occ).toHaveLength(2)
    expect([occ[0].startMin, occ[0].endMin]).toEqual([22 * 60, 24 * 60])
    expect([occ[1].startMin, occ[1].endMin]).toEqual([0, 6 * 60])
    expect(occ[1].start).toBe('2026-10-07')
  })

  it('reports orphan inner calendars and unparsed roots', () => {
    const t = treeOf('orphan')
    expect(t.orphanInnerCalendars).toHaveLength(1)
    expect(t.unparsed).toHaveLength(1)
  })

  it('reads root-only closures as blocks without inner calendar', () => {
    const t = buildTree(FIXTURE_CALENDARS.closures.calendar, [])
    expect(t.blocks.every((b) => b.kind === 'closure' && b.innerCalendarId === null)).toBe(true)
    expect(describeBlock(t.blocks[0])).toBe('Geschäftsschließung: Neujahr 01.01.2026')
  })
})

describe('normalizeRule', () => {
  it('accepts strings for numbers and booleans', () => {
    const r = normalizeRule({ calendarruleid: 'a', _calendarid_value: 'c', duration: '480', isselected: 'true', rank: 0, timezonecode: null })
    expect(r.duration).toBe(480)
    expect(r.isselected).toBe(true)
    expect(r.rank).toBe(0)
    expect(r.timezonecode).toBeNull()
  })
})
