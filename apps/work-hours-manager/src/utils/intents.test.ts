import { describe, expect, it } from 'vitest'
import { FIXTURE_CALENDARS, treeOf } from '../fixtures/calendars'
import type { CalendarEventInfo } from '../types/calendar'
import { blockSegments, daySpecFromBlock, emptyAbsenceSpec, emptyWorkSpec, specFromBlock, splitAtMidnight, toRequests, validateSpec, variedParts, type EditTarget } from './intents'
import { applyRequests, previewIntent } from './preview'
import { describeBlock } from './rules'

const target: EditTarget = { entity: 'bookableresource', calendarId: 'cal-1', resourceId: 'user-1', timeZoneCode: 110, useV2: true }
const info = (r: ReturnType<typeof toRequests>[number]) => r.info as CalendarEventInfo

describe('toRequests — create', () => {
  it('builds the documented weekly recurrence with a break', () => {
    const [r] = toRequests({ op: 'create', target, spec: emptyWorkSpec('2026-10-05') })
    expect(r.action).toBe('msdyn_SaveCalendar')
    const i = info(r)
    expect(i).toMatchObject({ EntityLogicalName: 'bookableresource', CalendarId: 'cal-1', TimeZoneCode: 110, ResourceId: 'user-1', UseV2: true, ObserveClosure: true })
    expect(i.RecurrenceEndDate).toBeUndefined()
    expect(i.RulesAndRecurrences).toHaveLength(1)
    expect(i.RulesAndRecurrences[0].RecurrencePattern).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR')
    expect(i.RulesAndRecurrences[0].Rules).toEqual([
      { StartTime: '2026-10-05T08:00:00.000Z', EndTime: '2026-10-05T12:00:00.000Z', WorkHourType: 0, Effort: 1 },
      { StartTime: '2026-10-05T12:00:00.000Z', EndTime: '2026-10-05T12:30:00.000Z', WorkHourType: 1, Effort: null },
      { StartTime: '2026-10-05T12:30:00.000Z', EndTime: '2026-10-05T17:00:00.000Z', WorkHourType: 0, Effort: 1 },
    ])
  })

  it('sends the recurrence end as 23:59:59 so the chosen day stays the last one', () => {
    const spec = { ...emptyWorkSpec('2026-10-05'), recurrence: { weekdays: [1, 3] as const, endDate: '2026-12-31' } }
    const i = info(toRequests({ op: 'create', target, spec: { ...spec, recurrence: { weekdays: [1, 3], endDate: '2026-12-31' } } })[0])
    expect(i.RecurrenceEndDate).toBe('2026-12-31T23:59:59.000Z')
    expect(i.RulesAndRecurrences[0].RecurrencePattern).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE')
  })

  it('creates an occurrence with end of day as 00:00 of the next day', () => {
    const i = info(toRequests({ op: 'create', target, spec: { ...emptyWorkSpec('2026-10-06'), recurrence: null, segments: [{ kind: 'work', start: '16:00', end: '24:00' }] } })[0])
    expect(i.RulesAndRecurrences[0].RecurrencePattern).toBeUndefined()
    expect(i.RulesAndRecurrences[0].Rules[0]).toEqual({ StartTime: '2026-10-06T16:00:00.000Z', EndTime: '2026-10-07T00:00:00.000Z', WorkHourType: 0, Effort: 1 })
  })

  it('splits a night shift into two occurrences', () => {
    const reqs = toRequests({ op: 'create', target, spec: { ...emptyWorkSpec('2026-10-06'), recurrence: null, segments: [{ kind: 'work', start: '22:00', end: '06:00' }] } })
    expect(reqs).toHaveLength(2)
    expect(info(reqs[0]).RulesAndRecurrences[0].Rules[0]).toMatchObject({ StartTime: '2026-10-06T22:00:00.000Z', EndTime: '2026-10-07T00:00:00.000Z' })
    expect(info(reqs[1]).RulesAndRecurrences[0].Rules[0]).toMatchObject({ StartTime: '2026-10-07T00:00:00.000Z', EndTime: '2026-10-07T06:00:00.000Z' })
  })

  it('splits a recurring night shift and shifts the weekdays of the second rule', () => {
    const reqs = toRequests({ op: 'create', target, spec: { ...emptyWorkSpec('2026-10-05'), recurrence: { weekdays: [1, 2, 5], endDate: null }, segments: [{ kind: 'work', start: '22:00', end: '02:00' }, { kind: 'break', start: '01:00', end: '01:30' }] } })
    expect(reqs).toHaveLength(2)
    expect(info(reqs[0]).RulesAndRecurrences[0].RecurrencePattern).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,FR')
    expect(info(reqs[1]).RulesAndRecurrences[0].RecurrencePattern).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,WE,SA')
    expect(info(reqs[1]).RulesAndRecurrences[0].Rules.map((r) => [r.StartTime.slice(11, 16), r.EndTime.slice(11, 16), r.WorkHourType])).toEqual([
      ['00:00', '01:00', 0],
      ['01:00', '01:30', 1],
      ['01:30', '02:00', 0],
    ])
  })

  it('creates varied recurrences as IsVaried parts grouped by equal times', () => {
    const spec = { ...emptyWorkSpec('2026-10-05'), varied: { 1: [{ kind: 'work' as const, start: '08:00', end: '17:00' }], 2: [{ kind: 'work' as const, start: '08:00', end: '17:00' }], 3: [{ kind: 'work' as const, start: '11:00', end: '15:00' }] } }
    const [r] = toRequests({ op: 'create', target, spec })
    const i = info(r)
    expect(i.IsVaried).toBe(true)
    expect(i.RulesAndRecurrences.map((x) => [x.RecurrencePattern, x.Action])).toEqual([
      ['FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU', 1],
      ['FREQ=WEEKLY;INTERVAL=1;BYDAY=WE', 1],
    ])
    expect(variedParts(spec.varied!)).toHaveLength(2)
  })

  it('creates all-day time off with a reason and single-day non-working time', () => {
    const off = info(toRequests({ op: 'create', target, spec: { ...emptyAbsenceSpec('2026-10-12'), days: 3, reason: 'Urlaub' } })[0])
    expect(off.InnerCalendarDescription).toBe('Urlaub')
    expect(off.RulesAndRecurrences[0].Rules[0]).toEqual({ StartTime: '2026-10-12T00:00:00.000Z', EndTime: '2026-10-15T00:00:00.000Z', WorkHourType: 3, Effort: null })
    const non = info(toRequests({ op: 'create', target, spec: { ...emptyAbsenceSpec('2026-10-20', 'nonwork'), allDay: false, start: '13:00', end: '17:00' } })[0])
    expect(non.InnerCalendarDescription).toBeUndefined()
    expect(non.RulesAndRecurrences[0].Rules[0]).toEqual({ StartTime: '2026-10-20T13:00:00.000Z', EndTime: '2026-10-20T17:00:00.000Z', WorkHourType: 2, Effort: null })
  })
})

describe('toRequests — edit, end, delete', () => {
  const tree = treeOf('weekly')
  const block = tree.blocks[0]

  it('edits the whole recurrence in place', () => {
    const spec = specFromBlock(block)
    expect(spec.kind).toBe('work')
    const i = info(toRequests({ op: 'edit', target, block, spec: { ...(spec as ReturnType<typeof emptyWorkSpec>), segments: [{ kind: 'work', start: '09:00', end: '17:00' }] }, split: false })[0])
    expect(i.IsEdit).toBe(true)
    expect(i.RecurrenceSplit).toBeUndefined()
    expect(i.RulesAndRecurrences[0].InnerCalendarId).toBe(block.innerCalendarId)
    expect(i.RulesAndRecurrences[0].Rules[0].StartTime).toBe('2026-01-05T09:00:00.000Z')
  })

  it('"this and following" sets RecurrenceSplit and starts at the split date', () => {
    const spec = { ...(specFromBlock(block) as ReturnType<typeof emptyWorkSpec>), date: '2026-11-02' }
    const i = info(toRequests({ op: 'edit', target, block, spec, split: true })[0])
    expect(i.RecurrenceSplit).toBe(true)
    expect(i.IsEdit).toBe(true)
    expect(i.RulesAndRecurrences[0].Rules[0].StartTime.slice(0, 10)).toBe('2026-11-02')
  })

  it('ends a recurrence with the block\'s own rules and the end date', () => {
    const i = info(toRequests({ op: 'end', target, block, lastDay: '2026-12-31' })[0])
    expect(i.IsEdit).toBe(true)
    expect(i.RecurrenceEndDate).toBe('2026-12-31T23:59:59.000Z')
    expect(i.RulesAndRecurrences[0].InnerCalendarId).toBe(block.innerCalendarId)
    expect(i.RulesAndRecurrences[0].Rules).toHaveLength(3)
    expect(() => toRequests({ op: 'end', target, block, lastDay: '2025-01-01' })).toThrow()
  })

  it('deletes with IsVaried for grouped blocks', () => {
    const [r] = toRequests({ op: 'delete', target, block })
    expect(r).toEqual({ action: 'msdyn_DeleteCalendar', info: { EntityLogicalName: 'bookableresource', CalendarId: 'cal-1', InnerCalendarId: block.innerCalendarId, UseV2: true } })
    const varied = treeOf('varied').blocks[0]
    expect(toRequests({ op: 'delete', target, block: varied })[0].info).toMatchObject({ IsVaried: true })
  })

  it('edits one day of a recurrence as a new single day — never with the recurrence id (live: that replaces the recurrence)', () => {
    const spec = daySpecFromBlock(block, '2026-10-07')
    expect(spec.recurrence).toBeNull()
    const i = info(toRequests({ op: 'editDay', target, block, spec: { ...spec, segments: [{ kind: 'work', start: '13:00', end: '19:00' }] } })[0])
    expect(i.IsEdit).toBeUndefined()
    expect(i.RulesAndRecurrences[0].InnerCalendarId).toBeUndefined()
    expect(i.RulesAndRecurrences[0].Rules[0].StartTime).toBe('2026-10-07T13:00:00.000Z')
  })

  it('edits a varied group with Actions 2/3/1', () => {
    const vt = treeOf('varied')
    const spec = specFromBlock(vt.blocks[0], vt.blocks) as ReturnType<typeof emptyWorkSpec>
    expect(spec.varied).toEqual({ 1: [{ kind: 'work', start: '08:00', end: '17:00' }], 3: [{ kind: 'work', start: '11:00', end: '15:00' }] })
    const edited = { ...spec, varied: { 1: [{ kind: 'work' as const, start: '09:00', end: '17:00' }], 5: [{ kind: 'work' as const, start: '08:00', end: '12:00' }] } }
    const i = info(toRequests({ op: 'edit', target, block: vt.blocks[0], spec: edited, split: false, group: vt.blocks })[0])
    expect(i.IsVaried).toBe(true)
    expect(i.IsEdit).toBe(true)
    expect(i.RulesAndRecurrences.map((x) => [x.RecurrencePattern?.slice(-2), x.Action, x.InnerCalendarId === null ? 'new' : 'existing'])).toEqual([
      ['MO', 3, 'existing'],
      ['FR', 1, 'new'],
      ['WE', 2, 'existing'],
    ])
  })
})

describe('validateSpec', () => {
  it('rejects what the API would reject, in German', () => {
    expect(validateSpec({ ...emptyWorkSpec('2026-10-05'), segments: [{ kind: 'break', start: '12:00', end: '12:30' }] })).toContain('Pausen brauchen Arbeitszeit am selben Tag.')
    expect(validateSpec({ ...emptyWorkSpec('2026-10-05'), segments: [{ kind: 'work', start: '08:00', end: '12:00' }, { kind: 'work', start: '11:00', end: '13:00' }] })).toContain('Zeiten überschneiden sich.')
    expect(validateSpec({ ...emptyWorkSpec('2026-10-05'), allDay: true })).toContain('Ganztägige Wiederholungen unterstützt die API nicht.')
    expect(validateSpec({ ...emptyWorkSpec('2026-10-05'), recurrence: { weekdays: [], endDate: null } })).toContain('Mindestens einen Wochentag wählen.')
    expect(validateSpec({ ...emptyWorkSpec('2026-10-05'), recurrence: { weekdays: [1], endDate: '2026-01-01' } })).toContain('Das Ende liegt vor dem Beginn.')
    expect(validateSpec({ ...emptyWorkSpec('2026-10-05'), effort: 0.5 })).toContain('Kapazität ist eine ganze Zahl ab 1.')
    expect(validateSpec(emptyWorkSpec('2026-10-05'))).toEqual([])
    expect(validateSpec({ ...emptyAbsenceSpec('2026-10-05'), allDay: false, start: '10:00', end: '10:00' })).toContain('Ende muss nach dem Beginn liegen.')
  })

  it('splits segments at midnight', () => {
    expect(splitAtMidnight([{ kind: 'work', start: '22:00', end: '06:00' }])).toEqual({ today: [{ kind: 'work', start: '22:00', end: '24:00' }], tomorrow: [{ kind: 'work', start: '00:00', end: '06:00' }] })
    expect(splitAtMidnight([{ kind: 'work', start: '08:00', end: '17:00' }]).tomorrow).toEqual([])
  })
})

describe('round trip through the server emulation', () => {
  it('reads back the spec it wrote', () => {
    const tree = treeOf('weekly')
    const spec = { ...emptyWorkSpec('2026-11-02'), recurrence: { weekdays: [6, 7] as [6, 7], endDate: '2027-03-31' }, segments: [{ kind: 'work' as const, start: '09:00', end: '13:00' }], effort: 2 }
    const after = applyRequests(tree, toRequests({ op: 'create', target: { ...target, calendarId: tree.calendarId }, spec }))
    const created = after.blocks.find((b) => b.start === '2026-11-02' && !b.holidays)!
    // ObserveClosure: the server adds a holiday list on the closure calendar (live).
    expect(after.blocks.filter((b) => b.holidays)).toHaveLength(1)
    expect(describeBlock(created)).toBe('Wöchentlich Sa–So · 09:00–13:00 · Kapazität 2 · ab 02.11.2026 · bis 31.03.2027')
    expect(specFromBlock(created)).toMatchObject({ kind: 'work', date: '2026-11-02', recurrence: { weekdays: [6, 7], endDate: '2027-03-31' }, effort: 2 })
    expect(blockSegments(created)).toEqual(spec.segments)
  })

  it('previews the affected days of a time off', () => {
    const tree = treeOf('weekly')
    const p = previewIntent(tree, { op: 'create', target: { ...target, calendarId: tree.calendarId }, spec: { ...emptyAbsenceSpec('2026-10-12'), days: 2, reason: 'Urlaub' } }, { closures: [], viewerTz: 'Europe/Berlin', useV2: true, today: '2026-10-05' })
    expect(p.error).toBeNull()
    expect(p.days[0].date).toBe('2026-10-12')
    expect(p.changedCount).toBe(2)
    expect(p.days[0].before.workMinutes).toBe(510)
    expect(p.days[0].after.workMinutes).toBe(0)
    expect(p.days[0].after.reason).toBe('timeoff')
    expect(p.descriptions[0]).toContain('msdyn_SaveCalendar')
  })

  it('reports an invalid spec as preview error instead of throwing', () => {
    const tree = treeOf('weekly')
    const p = previewIntent(tree, { op: 'create', target, spec: { ...emptyWorkSpec('2026-10-05'), segments: [] } }, { closures: [], viewerTz: 'Europe/Berlin', useV2: true, today: '2026-10-05' })
    expect(p.error).toContain('Mindestens eine Zeit angeben.')
  })

  it('"this and following" ends the old recurrence the day before', () => {
    const tree = treeOf('weekly')
    const block = tree.blocks[0]
    const spec = { ...(specFromBlock(block) as ReturnType<typeof emptyWorkSpec>), date: '2026-11-02', segments: [{ kind: 'work' as const, start: '07:00', end: '15:00' }] }
    const after = applyRequests(tree, toRequests({ op: 'edit', target: { ...target, calendarId: tree.calendarId }, block, spec, split: true }))
    expect(after.blocks.map((b) => [b.start, b.end, b.startMin])).toEqual([
      ['2026-01-05', '2026-11-01', 480],
      ['2026-11-02', null, 420],
    ])
    expect(FIXTURE_CALENDARS.weekly.calendar.calendar_calendar_rules).toHaveLength(1) // fixture untouched (deep copy)
  })
})

describe('closure observation and time zones of existing rules', () => {
  const weekly = treeOf('weekly')
  const t = { ...target, calendarId: weekly.calendarId }

  it('sends ObserveClosure only while the calendar has no open holiday list', () => {
    expect(info(toRequests({ op: 'create', target: t, spec: emptyWorkSpec('2026-10-05') })[0]).ObserveClosure).toBe(true)
    expect(info(toRequests({ op: 'create', target: { ...t, closuresObserved: true }, spec: emptyWorkSpec('2026-10-05') })[0]).ObserveClosure).toBeUndefined()
    expect(info(toRequests({ op: 'create', target: t, spec: { ...emptyWorkSpec('2026-10-05'), observeClosure: false } })[0]).ObserveClosure).toBeUndefined()
  })

  it('never sends it with the night-shift spill-over (one more holiday list per save)', () => {
    const reqs = toRequests({ op: 'create', target: t, spec: { ...emptyWorkSpec('2026-10-05'), segments: [{ kind: 'work', start: '22:00', end: '06:00' }] } })
    expect(reqs).toHaveLength(2)
    expect(reqs.map((r) => info(r).ObserveClosure)).toEqual([true, undefined])
  })

  it('edits leave closure observation untouched', () => {
    const block = weekly.blocks[0]
    expect(specFromBlock(block, weekly.blocks)).toMatchObject({ observeClosure: false })
    expect(info(toRequests({ op: 'edit', target: t, block, spec: specFromBlock(block, weekly.blocks), split: false })[0]).ObserveClosure).toBeUndefined()
  })

  it('ends a recurrence in the time zone of the rule, not of the resource', () => {
    const block = { ...weekly.blocks[0], timeZoneCode: 105 }
    const i = info(toRequests({ op: 'end', target: { ...t, timeZoneCode: 92 }, block, lastDay: '2026-12-31' })[0])
    expect(i.TimeZoneCode).toBe(105)
  })
})
