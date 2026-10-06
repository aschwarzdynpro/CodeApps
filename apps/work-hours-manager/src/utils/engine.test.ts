import { describe, expect, it } from 'vitest'
import type { RawCalendar } from '../types/calendar'
import { buildTree, describeBlock } from './rules'
import { applyClosureSave, applyDelete, applySave, createStore, innerCalendarsOf, recurrenceEnd } from './engine'

function freshStore() {
  let n = 0
  const cal: RawCalendar = { calendarid: 'cal-1', name: 'Test', description: null, type: 0, calendar_calendar_rules: [] }
  const store = createStore([cal], () => `id-${++n}`, () => '2026-10-05T12:00:00.000Z')
  const tree = () => buildTree(store.calendars.get('cal-1')!, innerCalendarsOf(store, store.calendars.get('cal-1')!))
  return { store, tree }
}

describe('recurrenceEnd', () => {
  it('moves timestamps of 08:00:00 or earlier to the day before', () => {
    expect(recurrenceEnd('2026-11-30T00:00:00.000Z')).toBe('2026-11-29')
    expect(recurrenceEnd('2026-11-30T08:00:00Z')).toBe('2026-11-29')
    expect(recurrenceEnd('2026-11-30T08:00:01Z')).toBe('2026-11-30')
    expect(recurrenceEnd('2026-11-30T23:59:59Z')).toBe('2026-11-30')
    expect(recurrenceEnd(undefined)).toBeNull()
    expect(recurrenceEnd('9999-12-30T23:59:59Z')).toBeNull()
  })
})

describe('applySave / applyDelete', () => {
  it('creates a weekly recurrence with a break and reads it back', () => {
    const { store, tree } = freshStore()
    const ids = applySave(store, {
      EntityLogicalName: 'bookableresource',
      CalendarId: 'cal-1',
      TimeZoneCode: 110,
      RulesAndRecurrences: [
        {
          Rules: [
            { StartTime: '2026-10-05T08:00:00.000Z', EndTime: '2026-10-05T12:00:00.000Z', WorkHourType: 0, Effort: 1 },
            { StartTime: '2026-10-05T12:00:00.000Z', EndTime: '2026-10-05T12:30:00.000Z', WorkHourType: 1, Effort: null },
            { StartTime: '2026-10-05T12:30:00.000Z', EndTime: '2026-10-05T17:00:00.000Z', WorkHourType: 0, Effort: 1 },
          ],
          RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR',
        },
      ],
    })
    expect(ids).toHaveLength(1)
    const t = tree()
    expect(t.blocks).toHaveLength(1)
    expect(describeBlock(t.blocks[0])).toBe('Wöchentlich Mo–Fr · 08:00–12:00, 12:30–17:00 · Pause 12:00–12:30 · ab 05.10.2026 · ohne Ende')
    expect(t.blocks[0].innerCalendarId).toBe(ids[0])
  })

  it('edits in place with IsEdit + InnerCalendarId and keeps the id', () => {
    const { store, tree } = freshStore()
    const [id] = applySave(store, {
      EntityLogicalName: 'bookableresource',
      CalendarId: 'cal-1',
      RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-10-05T08:00:00Z', EndTime: '2026-10-05T17:00:00Z', WorkHourType: 0 }], RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU' }],
    })
    const edited = applySave(store, {
      EntityLogicalName: 'bookableresource',
      CalendarId: 'cal-1',
      IsEdit: true,
      RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-10-05T09:00:00Z', EndTime: '2026-10-05T17:00:00Z', WorkHourType: 0 }], InnerCalendarId: id, RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU' }],
    })
    expect(edited).toEqual([id])
    expect(tree().blocks[0].startMin).toBe(9 * 60)
    expect(tree().blocks[0].weekdays).toEqual([1, 2])
  })

  it('splits "this and following" into an ended old and a new recurrence', () => {
    const { store, tree } = freshStore()
    const [id] = applySave(store, {
      EntityLogicalName: 'bookableresource',
      CalendarId: 'cal-1',
      RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-01-05T08:00:00Z', EndTime: '2026-01-05T17:00:00Z', WorkHourType: 0 }], RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR' }],
    })
    const ids = applySave(store, {
      EntityLogicalName: 'bookableresource',
      CalendarId: 'cal-1',
      IsEdit: true,
      RecurrenceSplit: true,
      RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-11-02T07:00:00Z', EndTime: '2026-11-02T15:00:00Z', WorkHourType: 0 }], InnerCalendarId: id, RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR' }],
    })
    const blocks = tree().blocks
    expect(blocks).toHaveLength(2)
    expect(blocks[0].end).toBe('2026-11-01')
    expect(blocks[1].start).toBe('2026-11-02')
    expect(blocks[1].startMin).toBe(7 * 60)
    expect(ids[0]).toBe(blocks[1].innerCalendarId)
  })

  it('stores varied parts as single rules (live: fixed designator, isvaried) and deletes one part at a time', () => {
    const { store, tree } = freshStore()
    const ids = applySave(store, {
      EntityLogicalName: 'bookableresource',
      CalendarId: 'cal-1',
      IsVaried: true,
      RulesAndRecurrences: [
        { Rules: [{ StartTime: '2026-10-05T08:00:00Z', EndTime: '2026-10-05T17:00:00Z', WorkHourType: 0 }], Action: 1, RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO' },
        { Rules: [{ StartTime: '2026-10-05T11:00:00Z', EndTime: '2026-10-05T15:00:00Z', WorkHourType: 0 }], Action: 1, RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=WE' },
      ],
    })
    expect(ids).toHaveLength(2)
    const t = tree()
    expect(t.blocks.every((b) => b.groupId === null && b.raw.root.isvaried === true)).toBe(true)
    const removed = applyDelete(store, { EntityLogicalName: 'bookableresource', CalendarId: 'cal-1', InnerCalendarId: ids[1], IsVaried: true })
    expect(removed).toEqual([ids[1]])
    expect(tree().blocks.map((b) => b.innerCalendarId)).toEqual([ids[0]])
  })

  it('takes the weekdays of a new recurrence out of the older one (live T11, NAAF-Backup)', () => {
    const { store, tree } = freshStore()
    applySave(store, { EntityLogicalName: 'bookableresource', CalendarId: 'cal-1', RulesAndRecurrences: [{ Rules: [{ StartTime: '2000-01-01T07:00:00Z', EndTime: '2000-01-01T15:00:00Z', WorkHourType: 0 }], RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR' }] })
    applySave(store, {
      EntityLogicalName: 'bookableresource',
      CalendarId: 'cal-1',
      IsVaried: true,
      UseV2: true,
      RulesAndRecurrences: [
        { Rules: [{ StartTime: '2026-11-30T08:00:00Z', EndTime: '2026-11-30T17:00:00Z', WorkHourType: 0 }], Action: 1, RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO' },
        { Rules: [{ StartTime: '2026-11-30T11:00:00Z', EndTime: '2026-11-30T15:00:00Z', WorkHourType: 0 }], Action: 1, RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=WE' },
      ],
    })
    const t = tree()
    expect(t.blocks.map((b) => [b.weekdays?.join(''), b.start, b.end, b.startMin, b.endMin]).sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])))).toEqual([
      ['12345', '2000-01-01', '2026-11-29', 420, 900],
      ['1', '2026-11-30', null, 480, 1020],
      ['245', '2026-11-30', null, 420, 900],
      ['3', '2026-11-30', null, 660, 900],
    ])
  })

  it('creates multi-day time off with reason and a single-day exception that owns the day', () => {
    const { store, tree } = freshStore()
    const [weekly] = applySave(store, {
      EntityLogicalName: 'bookableresource',
      CalendarId: 'cal-1',
      RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-01-05T08:00:00Z', EndTime: '2026-01-05T17:00:00Z', WorkHourType: 0 }], RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR' }],
    })
    applySave(store, {
      EntityLogicalName: 'bookableresource',
      CalendarId: 'cal-1',
      InnerCalendarDescription: 'Urlaub',
      RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-10-12T00:00:00Z', EndTime: '2026-10-15T00:00:00Z', WorkHourType: 3 }] }],
    })
    applySave(store, {
      EntityLogicalName: 'bookableresource',
      CalendarId: 'cal-1',
      RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-10-20T13:00:00Z', EndTime: '2026-10-20T19:00:00Z', WorkHourType: 0 }] }],
    })
    const t = tree()
    const off = t.blocks.find((b) => b.kind === 'timeoff')!
    expect([off.start, off.end, off.description]).toEqual(['2026-10-12', '2026-10-14', 'Urlaub'])
    const exception = t.blocks.find((b) => b.weekdays === null && b.kind === 'work')!
    expect([exception.start, exception.startMin, exception.endMin]).toEqual(['2026-10-20', 13 * 60, 19 * 60])
    expect(t.blocks.some((b) => b.innerCalendarId === weekly && b.weekdays !== null)).toBe(true)
  })

  it('replaces the recurrence when a single day carries its InnerCalendarId (live behaviour the app avoids)', () => {
    const { store, tree } = freshStore()
    const [weekly] = applySave(store, {
      EntityLogicalName: 'bookableresource',
      CalendarId: 'cal-1',
      RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-01-05T08:00:00Z', EndTime: '2026-01-05T17:00:00Z', WorkHourType: 0 }], RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR' }],
    })
    applySave(store, { EntityLogicalName: 'bookableresource', CalendarId: 'cal-1', RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-11-16T10:00:00Z', EndTime: '2026-11-16T14:00:00Z', WorkHourType: 0 }], InnerCalendarId: weekly }] })
    const t = tree()
    expect(t.blocks.filter((b) => b.weekdays !== null)).toHaveLength(0)
    expect(t.blocks.map((b) => [b.innerCalendarId, b.start])).toEqual([[weekly, '2026-11-16']])
  })

  it('refuses what the API refuses', () => {
    const { store } = freshStore()
    const base = { EntityLogicalName: 'bookableresource' as const, CalendarId: 'cal-1' }
    expect(() => applySave(store, { ...base, RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-10-05T17:00:00Z', EndTime: '2026-10-05T08:00:00Z', WorkHourType: 0 }] }] })).toThrow(/StartTime/)
    expect(() => applySave(store, { ...base, RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-10-05T08:00:00Z', EndTime: '2026-10-05T17:00:00Z', WorkHourType: 3 }], RecurrencePattern: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO' }] })).toThrow(/Time off/)
    expect(() => applySave(store, { ...base, RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-10-05T08:00:00Z', EndTime: '2026-10-05T17:00:00Z', WorkHourType: 0 }], RecurrencePattern: 'FREQ=DAILY;INTERVAL=1' }] })).toThrow(/pattern/)
    expect(() => applySave(store, { ...base, RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-10-05T12:00:00Z', EndTime: '2026-10-05T12:30:00Z', WorkHourType: 1 }] }] })).toThrow(/Breaks/)
    expect(() => applySave(store, { ...base, RulesAndRecurrences: [{ Rules: [{ StartTime: '2026-10-05T20:00:00Z', EndTime: '2026-10-06T06:00:00Z', WorkHourType: 0 }] }] })).toThrow(/within one day/)
  })

  it('adds closures as root-only rules', () => {
    const { store } = freshStore()
    store.calendars.set('closures', { calendarid: 'closures', name: null, description: null, type: 2, calendar_calendar_rules: [] })
    applyClosureSave(store, 'closures', 'Neujahr', '2026-12-31T23:00:00.000Z', '2027-01-01T23:00:00.000Z')
    const t = buildTree(store.calendars.get('closures')!, [])
    expect(t.blocks).toHaveLength(1)
    expect(t.blocks[0].kind).toBe('closure')
    expect(t.blocks[0].innerCalendarId).toBeNull()
  })
})
