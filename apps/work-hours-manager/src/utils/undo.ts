import { S } from '../strings'
import type { CalendarTree, Resource, RunRecord, TreeSnapshot } from '../types/calendar'
import { recurrenceEndIso, specFromBlock, toRequests, type ApiRequest } from './intents'
import { applyRequests } from './preview'
import { snapshotOf, targetOf, weekHours, type RunPlan, type RunStep } from './plan'
import { buildTree, findBlock } from './rules'

/**
 * Undo as a normal run with preview: delete what the run created, restore
 * the recurrence ends it changed and re-create what it deleted — from the
 * snapshot taken before the run (concept: "Rückgängig ist ein normaler Lauf
 * mit Vorschau", tree equal up to ids).
 */

export const treeFromSnapshot = (s: TreeSnapshot): CalendarTree => buildTree(s.outer, s.inner)

const OPEN_END = '9999-12-30T23:59:59.000Z'

export function buildUndoPlan(record: RunRecord, currentTrees: Record<string, CalendarTree>, resources: Resource[], useV2: boolean, today: string): RunPlan {
  const steps: RunStep[] = []
  const snapshot: Record<string, TreeSnapshot> = {}
  for (const done of record.steps) {
    const resource = resources.find((r) => r.id === done.resourceId)
    const calendarId = done.calendarId?.toLowerCase() ?? null
    const current = calendarId ? (currentTrees[calendarId] ?? null) : null
    const base = { resourceId: done.resourceId, resourceName: done.resourceName, calendarId: done.calendarId, endedInnerCalendarIds: [] as string[], deletedInnerCalendarIds: [] as string[] }
    if (done.status !== 'done') {
      steps.push({ ...base, requests: [], status: 'skipped', note: S.runs.undoSkipNotDone, before: 0, after: 0, rulesBefore: 0, rulesAfter: 0 })
      continue
    }
    if (!resource || !current || !calendarId) {
      steps.push({ ...base, requests: [], status: 'skipped', note: S.runs.skipNoCalendar, before: 0, after: 0, rulesBefore: 0, rulesAfter: 0 })
      continue
    }
    snapshot[calendarId] = snapshotOf(current)
    const before = record.snapshot[calendarId] ? treeFromSnapshot(record.snapshot[calendarId]) : null
    const target = targetOf(resource, useV2)
    const requests: ApiRequest[] = []
    const notes: string[] = []

    // 1. delete what the run created (one delete per varied group).
    const seenGroups = new Set<string>()
    let deleted = 0
    for (const id of done.createdInnerCalendarIds) {
      const block = findBlock(current, id)
      if (!block || !block.innerCalendarId) continue
      if (block.groupId) {
        if (seenGroups.has(block.groupId)) continue
        seenGroups.add(block.groupId)
      }
      requests.push(...toRequests({ op: 'delete', target, block }))
      base.deletedInnerCalendarIds.push(block.innerCalendarId)
      deleted++
    }
    if (deleted) notes.push(S.runs.undoNoteDelete(deleted))

    // 2. restore the ends the run changed.
    let restored = 0
    for (const id of done.endedInnerCalendarIds) {
      const was = before ? findBlock(before, id) : null
      const now = findBlock(current, id)
      if (!was || !now || !now.innerCalendarId || was.end === now.end) continue
      const spec = specFromBlock(was, before?.blocks)
      if (spec.kind !== 'work' || !spec.recurrence) continue
      const info = toRequests({ op: 'edit', target, block: now, spec: { ...spec, recurrence: { ...spec.recurrence, endDate: was.end } }, split: false })[0]
      if (info.action === 'msdyn_SaveCalendar') {
        if (was.end === null) info.info.RecurrenceEndDate = OPEN_END
        else info.info.RecurrenceEndDate = recurrenceEndIso(was.end)
        requests.push(info)
        base.endedInnerCalendarIds.push(now.innerCalendarId)
        restored++
      }
    }
    if (restored) notes.push(S.runs.undoNoteRestore(restored))

    // 3. re-create what the run deleted (new ids).
    let recreated = 0
    for (const id of done.deletedInnerCalendarIds) {
      const was = before ? findBlock(before, id) : null
      if (!was || findBlock(current, id)) continue
      const spec = specFromBlock(was, before?.blocks)
      requests.push(...toRequests({ op: 'create', target, spec }))
      recreated++
    }
    if (recreated) notes.push(S.runs.undoNoteRecreate(recreated))

    if (requests.length === 0) {
      steps.push({ ...base, requests: [], status: 'skipped', note: S.runs.undoNothing, before: weekHours(current, today), after: weekHours(current, today), rulesBefore: current.blocks.length, rulesAfter: current.blocks.length })
      continue
    }
    try {
      const after = applyRequests(current, requests)
      steps.push({ ...base, requests, status: 'change', note: notes.join(' · '), before: weekHours(current, today), after: weekHours(after, today), rulesBefore: current.blocks.length, rulesAfter: after.blocks.length })
    } catch (err) {
      steps.push({ ...base, requests: [], status: 'skipped', note: `${S.runs.skipError}: ${err instanceof Error ? err.message : String(err)}`, before: weekHours(current, today), after: weekHours(current, today), rulesBefore: current.blocks.length, rulesAfter: current.blocks.length })
    }
  }
  return { kind: 'undo', label: S.runs.labelUndo(record.label), summary: S.runs.summaryUndo(record.label, new Date(record.startedAt).toLocaleString('de-DE')), steps, snapshot, undoOf: record.id }
}
