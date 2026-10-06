import { describe, expect, it } from 'vitest'
import { FIXTURE_CALENDARS, OPEN_END, makeBlock, makeCalendar, rawRule, treeOf } from '../fixtures/calendars'
import type { Closure } from '../types/calendar'
import { buildTree } from './rules'
import { expandTree, resolveDay, resolveRange, sumRange, toSlots } from './resolve'

const BERLIN = 'Europe/Berlin'

/** The weekly fixture plus the holiday list `ObserveClosure` stores: a yearly root whose inner calendar is the organization's closure calendar. */
function observing(depth: 'full' | 'roots' = 'full') {
  const { calendar, inner } = FIXTURE_CALENDARS.weekly
  const list = rawRule({ calendarruleid: 'holiday-list', _calendarid_value: calendar.calendarid, _innercalendarid_value: ORG_CLOSURES.calendarid, pattern: 'FREQ=YEARLY;INTERVAL=1', starttime: '2025-01-01T00:00:00Z', duration: 525600, rank: 1, timezonecode: 110, effectiveintervalend: OPEN_END, extentcode: 2 })
  const cal = { ...calendar, calendar_calendar_rules: [...calendar.calendar_calendar_rules, list] }
  return depth === 'full' ? buildTree(cal, [...inner, ORG_CLOSURES]) : buildTree(cal, [], false)
}

const ORG_CLOSURES = FIXTURE_CALENDARS.closures.calendar
const closures2026: Closure[] = buildTree(ORG_CLOSURES, []).blocks.map((b) => ({
  id: b.rootRuleId,
  calendarId: ORG_CLOSURES.calendarid,
  name: b.description ?? '',
  start: new Date(Date.parse(`${b.start}T00:00:00+02:00`)).toISOString(),
  end: new Date(Date.parse(`${b.end ?? b.start}T00:00:00+02:00`) + 86_400_000).toISOString(),
}))

describe('expandTree', () => {
  it('turns the weekly block into slots with the break as a gap', () => {
    const slots = toSlots('cal', expandTree(treeOf('weekly'), '2026-10-05', '2026-10-05').work)
    expect(slots.map((s) => [s.start, s.end])).toEqual([
      ['2026-10-05T06:00:00.000Z', '2026-10-05T10:00:00.000Z'],
      ['2026-10-05T10:30:00.000Z', '2026-10-05T15:00:00.000Z'],
    ])
    expect(slots[0].effort).toBe(1)
  })

  it('is DST-safe: the same local hours in winter', () => {
    const slots = toSlots('cal', expandTree(treeOf('weekly'), '2026-12-07', '2026-12-07').work)
    expect(slots[0].start).toBe('2026-12-07T07:00:00.000Z')
  })

  it('skips weekends and days before the rule starts', () => {
    expect(expandTree(treeOf('weekly'), '2026-10-10', '2026-10-11').work).toHaveLength(0)
    expect(expandTree(treeOf('weekly'), '2026-01-02', '2026-01-04').work).toHaveLength(0)
  })

  it('carves time off out of the working time', () => {
    const ex = expandTree(treeOf('timeoff'), '2026-10-12', '2026-10-16')
    const days = new Set(ex.work.map((w) => w.localDate))
    expect([...days]).toEqual(['2026-10-15', '2026-10-16'])
    expect(ex.timeOff.map((t) => t.localDate)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14'])
  })

  it('lets a single-day occurrence own its whole day (V2 example 5)', () => {
    const ex = expandTree(treeOf('night'), '2026-10-06', '2026-10-07')
    const byDay = (d: string) => ex.work.filter((w) => w.localDate === d).map((w) => [new Date(w.start).toISOString(), new Date(w.end).toISOString()])
    // Tuesday: the night occurrence replaces the weekly 08–17 for the day.
    expect(byDay('2026-10-06')).toEqual([['2026-10-06T20:00:00.000Z', '2026-10-06T22:00:00.000Z']])
    expect(byDay('2026-10-07')).toEqual([['2026-10-06T22:00:00.000Z', '2026-10-07T04:00:00.000Z']])
  })

  it('removes business closures through the holiday list that links the closure calendar', () => {
    const ex = expandTree(observing(), '2026-05-14', '2026-05-15')
    expect([...new Set(ex.work.map((w) => w.localDate))]).toEqual(['2026-05-15'])
    expect(expandTree(treeOf('weekly'), '2026-05-14', '2026-05-14').work).toHaveLength(2)
  })

  it('lets the most recently modified recurrence win where rules intersect (V2)', () => {
    const cal = makeCalendar('c', null, [
      makeBlock({ seq: 1, calendarId: 'c', start: '2026-01-05', weekdays: [1, 2, 3, 4, 5], leaves: [{ kind: 'work', start: '08:00', end: '17:00' }], modifiedOn: '2026-01-01T00:00:00Z' }),
      makeBlock({ seq: 2, calendarId: 'c', start: '2026-01-05', weekdays: [2], leaves: [{ kind: 'work', start: '06:00', end: '10:00' }], modifiedOn: '2026-02-01T00:00:00Z' }),
    ])
    const ex = expandTree(buildTree(cal.calendar, cal.inner), '2026-10-06', '2026-10-06')
    expect(ex.work.map((w) => [new Date(w.start).toISOString(), new Date(w.end).toISOString()]).sort()).toEqual([
      ['2026-10-06T04:00:00.000Z', '2026-10-06T08:00:00.000Z'],
      ['2026-10-06T08:00:00.000Z', '2026-10-06T15:00:00.000Z'],
    ])
  })
})

describe('resolveDay', () => {
  it('explains a normal working day with its break', () => {
    const r = resolveDay({ date: '2026-10-05', viewerTz: BERLIN, tree: treeOf('weekly'), slots: null, closures: [] })
    expect(r.workMinutes).toBe(510)
    expect(r.capacityHours).toBe(8.5)
    expect(r.segments.map((s) => [s.kind, s.startMin, s.endMin])).toEqual([
      ['work', 480, 720],
      ['break', 720, 750],
      ['work', 750, 1020],
    ])
    expect(r.segments[0].origin.kind).toBe('recurrence')
    expect(r.reason).toBe('none')
  })

  it('uses slots as the truth and the rules as the explanation', () => {
    const tree = treeOf('weekly')
    const inner = tree.blocks[0].innerCalendarId
    const r = resolveDay({
      date: '2026-10-05',
      viewerTz: BERLIN,
      tree,
      slots: [{ calendarId: tree.calendarId, innerCalendarId: inner, start: '2026-10-05T07:00:00Z', end: '2026-10-05T10:00:00Z', effort: 2 }],
      closures: [],
    })
    expect(r.workMinutes).toBe(180)
    expect(r.capacityHours).toBe(6)
    expect(r.segments[0].origin.label).toContain('Wöchentlich Mo–Fr')
  })

  it('names the reason for a day without working time', () => {
    const tree = treeOf('timeoff')
    expect(resolveDay({ date: '2026-10-13', viewerTz: BERLIN, tree, slots: null, closures: [] }).reason).toBe('timeoff')
    expect(resolveDay({ date: '2026-10-10', viewerTz: BERLIN, tree, slots: null, closures: [] }).reason).toBe('weekdayOff')
    expect(resolveDay({ date: '2026-05-14', viewerTz: BERLIN, tree: observing(), slots: null, closures: closures2026 }).reason).toBe('closure')
    expect(resolveDay({ date: '2026-12-01', viewerTz: BERLIN, tree: treeOf('ending'), slots: null, closures: [] }).reason).toBe('ruleEnded')
    expect(resolveDay({ date: '2025-12-01', viewerTz: BERLIN, tree: treeOf('ending'), slots: null, closures: [] }).reason).toBe('ruleNotStarted')
    expect(resolveDay({ date: '2026-10-05', viewerTz: BERLIN, tree: null, slots: null, closures: [] }).reason).toBe('noRule')
    expect(resolveDay({ date: '2026-10-05', viewerTz: BERLIN, tree: treeOf('weekly'), slots: [], closures: [] }).reason).toBe('none')
  })

  it('shows the viewer zone: Berlin rules seen from London start at 07:00', () => {
    const r = resolveDay({ date: '2026-10-05', viewerTz: 'Europe/London', tree: treeOf('weekly'), slots: null, closures: [] })
    expect(r.segments[0].startMin).toBe(7 * 60)
  })

  it('sums a week', () => {
    const days = resolveRange({ viewerTz: BERLIN, tree: treeOf('weekly'), slots: null, closures: [] }, '2026-10-05', '2026-10-11')
    expect(days).toHaveLength(7)
    expect(sumRange(days)).toEqual({ workHours: 42.5, capacityHours: 42.5 })
  })
})

describe('business closures per resource', () => {
  const day = (tree: ReturnType<typeof observing> | null) => resolveDay({ date: '2026-05-14', viewerTz: BERLIN, tree, slots: null, closures: closures2026 })
  const closureSegments = (d: ReturnType<typeof day>) => d.segments.filter((s) => s.kind === 'closure')

  it('shows the closure once, named after it, when the loaded holiday list already holds the day', () => {
    const d = day(observing())
    expect(closureSegments(d)).toHaveLength(1)
    expect(closureSegments(d)[0].origin.label).toBe('Christi Himmelfahrt')
    expect(d.workMinutes).toBe(0)
  })

  it('shows the closure from the organization list when only root rules are loaded', () => {
    const d = day(observing('roots'))
    expect(closureSegments(d).map((s) => s.origin.label)).toEqual(['Christi Himmelfahrt'])
  })

  it('leaves resources without a holiday list alone — they work on closure days', () => {
    const d = day(treeOf('weekly'))
    expect(closureSegments(d)).toHaveLength(0)
    expect(d.workMinutes).toBeGreaterThan(0)
  })
})
