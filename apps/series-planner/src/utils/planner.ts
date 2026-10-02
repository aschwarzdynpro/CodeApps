import type { OccurrenceRecord, PlannedOccurrence, SeriesDefinition } from '../types/series'
import { sameInstant, utcToZoned } from './dates'
import { plannedOccurrences } from './recurrence'

/**
 * Reconciles what a definition wants with the work orders that exist.
 *
 * The result is a list of actions the UI shows before anything is written
 * (create / update / cancel / keep), the same preview-then-apply flow as the
 * other apps in the repo. Rules:
 *
 * - Never touch the past or work that started: occurrences that began, are
 *   in progress or completed stay as they are.
 * - A record that no longer matches the previous definition was changed by
 *   hand (on the schedule board, in the work order). It is kept unless the
 *   user asks to overwrite deviations — Outlook asks the same question.
 * - A cancelled work order blocks re-creating its date, unless the date is
 *   restored explicitly.
 */

export type ChangeKind = 'date' | 'time' | 'resource'

export type PlanAction =
  | { kind: 'create'; key: string; occ: PlannedOccurrence }
  | { kind: 'update'; key: string; occ: PlannedOccurrence; record: OccurrenceRecord; changes: ChangeKind[] }
  | { kind: 'cancel'; key: string; record: OccurrenceRecord; reason: 'skipped' | 'notInPattern' }
  | {
      kind: 'keep'
      key: string
      record?: OccurrenceRecord
      occ?: PlannedOccurrence
      why: 'unchanged' | 'locked' | 'deviates' | 'canceled' | 'past' | 'duplicate'
    }

export interface PlanOptions {
  /** ISO instant; earlier occurrences are locked. */
  now: string
  /** Definition before the edit — tells "changed by the edit" from "changed by hand". */
  previous: SeriesDefinition | null
  overwriteDeviations: boolean
  /** Restrict the plan to these keys (single-occurrence edits). */
  onlyKeys?: Set<string>
  /** Keys to create even though a cancelled work order exists (restore). */
  recreate?: Set<string>
}

const sameId = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

export function recordMatches(record: OccurrenceRecord, occ: PlannedOccurrence): boolean {
  return !!record.bookingId && sameInstant(record.start, occ.start) && sameInstant(record.end, occ.end) && sameId(record.resource?.id, occ.resourceId)
}

export function changesBetween(record: OccurrenceRecord, occ: PlannedOccurrence, tz: string): ChangeKind[] {
  if (!record.start || !record.end) return ['date', 'time', 'resource'].filter((c) => c !== 'resource' || !!occ.resourceId) as ChangeKind[]
  const was = utcToZoned(record.start, tz)
  const out: ChangeKind[] = []
  if (was.date !== occ.date) out.push('date')
  if (was.time !== occ.startTime || !sameInstant(record.end, occ.end)) out.push('time')
  if (!sameId(record.resource?.id, occ.resourceId)) out.push('resource')
  return out
}

const isLocked = (record: OccurrenceRecord, now: number) =>
  record.state === 'inProgress' || record.state === 'completed' || (record.start !== null && Date.parse(record.start) < now)

export function planSeries(def: SeriesDefinition, records: OccurrenceRecord[], opts: PlanOptions): PlanAction[] {
  const now = Date.parse(opts.now)
  const wanted = (key: string) => !opts.onlyKeys || opts.onlyKeys.has(key)
  const desired = new Map(plannedOccurrences(def).map((o) => [o.key, o]))
  const previous = opts.previous ? new Map(plannedOccurrences(opts.previous).map((o) => [o.key, o])) : null

  const active = new Map<string, OccurrenceRecord>()
  const canceled = new Set<string>()
  const actions: PlanAction[] = []

  for (const r of records) {
    if (!wanted(r.key)) continue
    if (r.state === 'canceled') {
      canceled.add(r.key)
      continue
    }
    if (active.has(r.key)) {
      actions.push({ kind: 'keep', key: r.key, record: r, why: 'duplicate' })
      continue
    }
    active.set(r.key, r)
  }

  for (const [key, record] of active) {
    const occ = desired.get(key)
    if (isLocked(record, now)) {
      actions.push({ kind: 'keep', key, record, occ, why: 'locked' })
    } else if (!occ) {
      actions.push({ kind: 'cancel', key, record, reason: def.skips[key] ? 'skipped' : 'notInPattern' })
    } else if (recordMatches(record, occ)) {
      actions.push({ kind: 'keep', key, record, occ, why: 'unchanged' })
    } else {
      const prev = previous?.get(key)
      // Not booked yet, or still exactly as the old definition planned it: the edit applies.
      const inSync = !record.bookingId || (!!prev && recordMatches(record, prev))
      actions.push(
        inSync || opts.overwriteDeviations
          ? { kind: 'update', key, occ, record, changes: changesBetween(record, occ, def.timeZone) }
          : { kind: 'keep', key, record, occ, why: 'deviates' },
      )
    }
  }

  for (const [key, occ] of desired) {
    if (!wanted(key) || active.has(key)) continue
    if (canceled.has(key) && !opts.recreate?.has(key)) actions.push({ kind: 'keep', key, occ, why: 'canceled' })
    else if (Date.parse(occ.start) < now) actions.push({ kind: 'keep', key, occ, why: 'past' })
    else actions.push({ kind: 'create', key, occ })
  }

  return actions.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/** Actions that write something. */
export const isWrite = (a: PlanAction): a is Exclude<PlanAction, { kind: 'keep' }> => a.kind !== 'keep'

export function countActions(actions: PlanAction[]): Record<PlanAction['kind'], number> & { deviates: number } {
  const out = { create: 0, update: 0, cancel: 0, keep: 0, deviates: 0 }
  for (const a of actions) {
    out[a.kind]++
    if (a.kind === 'keep' && a.why === 'deviates') out.deviates++
  }
  return out
}
