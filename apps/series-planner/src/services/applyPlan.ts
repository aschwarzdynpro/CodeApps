import type { Series } from '../types/series'
import { formatDate } from '../utils/dates'
import { isWrite, type PlanAction } from '../utils/planner'
import type { SeriesService } from './seriesService'

export interface ActionResult {
  key: string
  kind: 'create' | 'update' | 'cancel'
  ok: boolean
  message: string
}

/**
 * Runs the write actions of a plan one by one. A failure doesn't stop the
 * rest — every occurrence is independent, and "Abgleichen" picks up what
 * is left over.
 */
export async function runActions(
  svc: SeriesService,
  series: Series,
  actions: PlanAction[],
  onProgress: (done: number, total: number) => void,
): Promise<ActionResult[]> {
  const writes = actions.filter(isWrite)
  const results: ActionResult[] = []
  for (const [i, a] of writes.entries()) {
    try {
      if (a.kind === 'create') {
        const rec = await svc.createOccurrence(series, a.occ)
        results.push({ key: a.key, kind: a.kind, ok: true, message: `${rec.workOrderName} angelegt und gebucht` })
      } else if (a.kind === 'update') {
        await svc.updateOccurrence(series, a.record, a.occ)
        results.push({ key: a.key, kind: a.kind, ok: true, message: `${a.record.workOrderName} geändert` })
      } else {
        await svc.cancelOccurrence(a.record, a.reason)
        results.push({ key: a.key, kind: a.kind, ok: true, message: `${a.record.workOrderName} abgesagt` })
      }
    } catch (err) {
      results.push({ key: a.key, kind: a.kind, ok: false, message: `${formatDate(a.key)}: ${err instanceof Error ? err.message : String(err)}` })
    }
    onProgress(i + 1, writes.length)
  }
  return results
}
