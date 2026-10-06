import { describe, expect, it } from 'vitest'
import { FIXTURE_CALENDARS, OPEN_END, makeBlock, makeCalendar, treeOf } from '../fixtures/calendars'
import type { CalendarService } from '../services/calendarService'
import { runPlan } from '../services/runCalendarPlan'
import type { CalendarEventInfo, CalendarTree, DeleteCalendarInfo, Resource, RunRecord } from '../types/calendar'
import { applyDelete, applySave, createStore, innerCalendarsOf } from './engine'
import { emptyAbsenceSpec } from './intents'
import { buildPlan, templateSpecs, weekHours } from './plan'
import { buildTree, describeBlock } from './rules'
import { buildUndoPlan, treeFromSnapshot } from './undo'

const resource = (n: number, calendarId: string | null, extra: Partial<Resource> = {}): Resource => ({
  id: `r${n}`,
  name: `Ressource ${n}`,
  type: 'user',
  timeZoneCode: 110,
  calendarId,
  orgUnit: null,
  active: true,
  categories: [],
  territories: [],
  userId: `u${n}`,
  displayOnScheduleBoard: true,
  ...extra,
})

const template = { id: 't1', name: 'Frühschicht', description: null, calendarId: 'tcal', active: true }
const templateCal = makeCalendar('tcal', 'Vorlage', [
  makeBlock({ seq: 500, calendarId: 'tcal', start: '2025-01-06', weekdays: [1, 2, 3, 4, 5], leaves: [{ kind: 'work', start: '06:00', end: '10:00' }, { kind: 'break', start: '10:00', end: '10:30' }, { kind: 'work', start: '10:30', end: '14:30' }] }),
])
const templateTree = buildTree(templateCal.calendar, templateCal.inner)

/** A service over the engine, so a plan can really run in tests. */
function engineService(trees: CalendarTree[]): { svc: CalendarService; tree: (id: string) => CalendarTree } {
  let n = 0
  const store = createStore(
    structuredClone(trees.flatMap((t) => [{ calendarid: t.calendarId, name: t.name, description: null, type: 0, calendar_calendar_rules: t.blocks.map((b) => b.raw.root) }, ...t.blocks.map((b) => b.raw.inner!).filter(Boolean)])),
    () => `new-${++n}`,
    () => '2026-10-05T12:00:00.000Z',
  )
  const tree = (id: string) => {
    const cal = store.calendars.get(id.toLowerCase())!
    return buildTree(cal, innerCalendarsOf(store, cal))
  }
  const svc = {
    source: 'mock',
    saveCalendar: async (info: CalendarEventInfo) => applySave(store, info),
    deleteCalendar: async (info: DeleteCalendarInfo) => applyDelete(store, info),
  } as unknown as CalendarService
  return { svc, tree }
}

describe('buildPlan — apply template', () => {
  const weekly = treeOf('weekly')
  const ending = treeOf('ending')

  it('turns the template into specs from the cutoff', () => {
    const { specs, ignored } = templateSpecs(templateTree, '2026-11-02')
    expect(specs).toHaveLength(1)
    expect(specs[0]).toMatchObject({ kind: 'work', date: '2026-11-02', recurrence: { weekdays: [1, 2, 3, 4, 5], endDate: null }, effort: 1 })
    expect(specs[0].segments).toHaveLength(3)
    expect(ignored).toEqual([])
  })

  it('plans end-of-existing + create per resource with before/after hours', () => {
    const plan = buildPlan({ kind: 'applyTemplate', template, templateTree, cutoff: '2026-11-02', endExisting: true, useV2: true }, [
      { resource: resource(1, weekly.calendarId), tree: weekly },
      { resource: resource(2, null), tree: null },
      { resource: resource(3, ending.calendarId), tree: ending },
    ])
    expect(plan.kind).toBe('applyTemplate')
    expect(plan.steps.map((s) => s.status)).toEqual(['change', 'skipped', 'change'])
    const first = plan.steps[0]
    expect(first.requests.map((r) => r.action)).toEqual(['msdyn_SaveCalendar', 'msdyn_SaveCalendar'])
    expect(first.endedInnerCalendarIds).toEqual([weekly.blocks[0].innerCalendarId])
    expect(first.before).toBe(42.5)
    expect(first.after).toBe(40)
    expect(first.rulesAfter).toBe(2)
    expect(plan.steps[1].note).toBe('kein Kalender')
    expect(Object.keys(plan.snapshot)).toEqual([weekly.calendarId.toLowerCase(), ending.calendarId.toLowerCase()])
  })

  it('without ending, the server takes the template weekdays out of the old rule (live) — same hours as with ending', () => {
    const plan = buildPlan({ kind: 'applyTemplate', template, templateTree, cutoff: '2026-11-02', endExisting: false, useV2: true }, [{ resource: resource(1, weekly.calendarId), tree: weekly }])
    expect(plan.steps[0].requests).toHaveLength(1)
    expect(plan.steps[0].endedInnerCalendarIds).toEqual([])
    const ended = buildPlan({ kind: 'applyTemplate', template, templateTree, cutoff: '2026-11-02', endExisting: true, useV2: true }, [{ resource: resource(1, weekly.calendarId), tree: weekly }])
    expect(plan.steps[0].after).toBe(ended.steps[0].after)
  })

  it('caps the run at the limit', () => {
    const targets = Array.from({ length: 55 }, (_, i) => ({ resource: resource(i, weekly.calendarId), tree: weekly }))
    expect(buildPlan({ kind: 'timeOff', absence: emptyAbsenceSpec('2026-12-24'), useV2: true }, targets).steps).toHaveLength(50)
  })
})

describe('buildPlan — absence', () => {
  it('creates one absence request per resource', () => {
    const weekly = treeOf('weekly')
    const plan = buildPlan({ kind: 'timeOff', absence: { ...emptyAbsenceSpec('2026-12-28'), days: 4, reason: 'Betriebsferien' }, useV2: true }, [{ resource: resource(1, weekly.calendarId), tree: weekly }])
    expect(plan.label).toBe('Abwesenheit „Betriebsferien“')
    expect(plan.steps[0].requests).toHaveLength(1)
    expect(plan.steps[0].before).toBe(42.5)
    expect(plan.steps[0].after).toBe(8.5)
  })
})

describe('runPlan + buildUndoPlan', () => {
  it('runs the plan, records created/ended ids, and the undo restores the tree up to ids', async () => {
    const weekly = treeOf('weekly')
    const { svc, tree } = engineService([weekly])
    const r1 = resource(1, weekly.calendarId)
    const plan = buildPlan({ kind: 'applyTemplate', template, templateTree, cutoff: '2026-11-02', endExisting: true, useV2: true }, [{ resource: r1, tree: tree(weekly.calendarId) }])
    const progress: string[] = []
    const record = await runPlan(plan, svc, { onProgress: (p) => progress.push(`${p.index}:${p.step.status}`), now: () => '2026-10-05T12:00:00.000Z' })
    expect(progress).toEqual(['0:done'])
    expect(record.steps[0].createdInnerCalendarIds).toHaveLength(1)
    expect(record.steps[0].endedInnerCalendarIds).toEqual([weekly.blocks[0].innerCalendarId])
    const afterRun = tree(weekly.calendarId)
    expect(afterRun.blocks.map(describeBlock)).toEqual([
      'Wöchentlich Mo–Fr · 08:00–12:00, 12:30–17:00 · Pause 12:00–12:30 · ab 05.01.2026 · bis 01.11.2026',
      'Wöchentlich Mo–Fr · 06:00–10:00, 10:30–14:30 · Pause 10:00–10:30 · ab 02.11.2026 · ohne Ende',
    ])
    expect(weekHours(afterRun, '2026-11-02')).toBe(40)

    const undo = buildUndoPlan(record, { [weekly.calendarId.toLowerCase()]: afterRun }, [r1], true, '2026-10-05')
    expect(undo.kind).toBe('undo')
    expect(undo.steps[0].status).toBe('change')
    expect(undo.steps[0].requests.map((r) => r.action)).toEqual(['msdyn_DeleteCalendar', 'msdyn_SaveCalendar'])
    const undoRecord = await runPlan(undo, svc, { onProgress: () => {} })
    expect(undoRecord.steps[0].status).toBe('done')
    const restored = tree(weekly.calendarId)
    expect(restored.blocks.map(describeBlock)).toEqual(treeFromSnapshot(record.snapshot[weekly.calendarId.toLowerCase()]).blocks.map(describeBlock))
    expect(restored.blocks[0].innerCalendarId).toBe(weekly.blocks[0].innerCalendarId)
  })

  it('stops at the first failure and marks the rest aborted', async () => {
    const weekly = treeOf('weekly')
    const varied = treeOf('varied')
    const { svc } = engineService([weekly, varied])
    const failing = { ...svc, saveCalendar: async () => { throw new Error('privilege missing') } } as CalendarService
    const plan = buildPlan({ kind: 'timeOff', absence: emptyAbsenceSpec('2026-12-24'), useV2: true }, [
      { resource: resource(1, weekly.calendarId), tree: weekly },
      { resource: resource(2, varied.calendarId), tree: varied },
    ])
    const record = await runPlan(plan, failing, { onProgress: () => {} })
    expect(record.steps.map((s) => s.status)).toEqual(['failed', 'aborted'])
    expect(record.steps[0].message).toContain('privilege')
  })

  it('re-creates what a run deleted', async () => {
    const weekly = treeOf('weekly')
    // a recurrence starting after the cutoff gets deleted by "end existing"
    const cal = makeCalendar('c2', null, [makeBlock({ seq: 600, calendarId: 'c2', start: '2026-12-01', weekdays: [1, 2, 3], leaves: [{ kind: 'work', start: '09:00', end: '15:00' }] })])
    const future = buildTree(cal.calendar, cal.inner)
    const { svc, tree } = engineService([weekly, future])
    const r2 = resource(2, 'c2')
    const plan = buildPlan({ kind: 'applyTemplate', template, templateTree, cutoff: '2026-11-02', endExisting: true, useV2: true }, [{ resource: r2, tree: tree('c2') }])
    expect(plan.steps[0].deletedInnerCalendarIds).toEqual([future.blocks[0].innerCalendarId])
    const record = await runPlan(plan, svc, { onProgress: () => {} })
    expect(tree('c2').blocks).toHaveLength(1)
    const undo = buildUndoPlan(record, { c2: tree('c2') }, [r2], true, '2026-10-05')
    await runPlan(undo, svc, { onProgress: () => {} })
    expect(tree('c2').blocks.map(describeBlock)).toEqual(['Wöchentlich Mo–Mi · 09:00–15:00 · ab 01.12.2026 · ohne Ende'])
  })

  it('leaves the fixtures untouched', () => {
    expect(FIXTURE_CALENDARS.weekly.calendar.calendar_calendar_rules[0].effectiveintervalend).toBe(OPEN_END)
  })

  it('undo of a run with nothing done is a skipped plan', () => {
    const record: RunRecord = { id: 'x', kind: 'timeOff', label: 'l', summary: 's', startedAt: '', finishedAt: '', snapshot: {}, steps: [{ resourceId: 'r1', resourceName: 'R', calendarId: null, status: 'skipped', message: '', createdInnerCalendarIds: [], deletedInnerCalendarIds: [], endedInnerCalendarIds: [] }], undoOf: null, undoneBy: null }
    expect(buildUndoPlan(record, {}, [], true, '2026-10-05').steps[0].status).toBe('skipped')
  })
})
