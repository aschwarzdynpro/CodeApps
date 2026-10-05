import { S } from '../strings'
import type { RunRecord, RunStepResult } from '../types/calendar'
import type { RunPlan } from '../utils/plan'
import type { CalendarService } from './calendarService'

/**
 * Executes a plan: resource by resource, request by request, sequentially.
 * Each step reports what the server created, ended or deleted (for undo).
 * The first failure stops the run — the record says what was written and
 * what was not. An AbortSignal stops between steps.
 */

export interface RunProgress {
  index: number
  total: number
  step: RunStepResult
}

export async function runPlan(plan: RunPlan, svc: CalendarService, opts: { onProgress: (p: RunProgress) => void; signal?: AbortSignal; now?: () => string }): Promise<RunRecord> {
  const now = opts.now ?? (() => new Date().toISOString())
  const record: RunRecord = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()),
    kind: plan.kind,
    label: plan.label,
    summary: plan.summary,
    startedAt: now(),
    finishedAt: null,
    snapshot: plan.snapshot,
    steps: plan.steps.map((s) => ({
      resourceId: s.resourceId,
      resourceName: s.resourceName,
      calendarId: s.calendarId,
      status: s.status === 'skipped' ? 'skipped' : 'pending',
      message: s.note,
      createdInnerCalendarIds: [],
      deletedInnerCalendarIds: [],
      endedInnerCalendarIds: [],
    })),
    undoOf: plan.undoOf,
    undoneBy: null,
  }
  let stopped = false
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]
    const result = record.steps[i]
    if (result.status === 'skipped') {
      opts.onProgress({ index: i, total: plan.steps.length, step: result })
      continue
    }
    if (stopped || opts.signal?.aborted) {
      result.status = 'aborted'
      result.message = S.runs.aborted
      opts.onProgress({ index: i, total: plan.steps.length, step: result })
      continue
    }
    const existing = new Set(Object.values(plan.snapshot[step.calendarId?.toLowerCase() ?? ''] ?? { inner: [] }).flatMap((v) => (Array.isArray(v) ? v.map((c) => c.calendarid.toLowerCase()) : [])))
    try {
      for (const r of step.requests) {
        if (r.action === 'msdyn_SaveCalendar') {
          const ids = await svc.saveCalendar(r.info)
          if (!r.info.IsEdit) result.createdInnerCalendarIds.push(...ids)
          else {
            // Edits answer with the ids involved; split edits create a new part.
            for (const id of ids) if (!existing.has(id.toLowerCase())) result.createdInnerCalendarIds.push(id)
          }
        } else {
          await svc.deleteCalendar(r.info)
        }
      }
      result.createdInnerCalendarIds = [...new Set(result.createdInnerCalendarIds)]
      result.endedInnerCalendarIds = step.endedInnerCalendarIds
      result.deletedInnerCalendarIds = step.deletedInnerCalendarIds
      result.status = 'done'
      result.message = step.note
    } catch (err) {
      result.status = 'failed'
      result.message = err instanceof Error ? err.message : String(err)
      stopped = true
    }
    opts.onProgress({ index: i, total: plan.steps.length, step: result })
  }
  record.finishedAt = now()
  return record
}
