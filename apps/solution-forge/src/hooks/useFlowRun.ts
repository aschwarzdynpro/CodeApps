import { useSyncExternalStore } from 'react'
import type { WorkingSolution } from '../types/solution'
import type {
  BulkAction,
  BulkResult,
  ComparerBulkRun,
  ComparerEnvState,
  ComparerResult,
  ComparerRow,
  ComparerRunApi,
} from '../types/comparer'
import { recomputeDrift } from '../types/comparer'
import { ENVIRONMENTS, currentEnvKey } from '../config'
import { flowComparerService } from '../services/flowComparerService'

/**
 * The Flow Comparer's run, held in a MODULE SINGLETON so the compare result and
 * an in-flight bulk run survive navigating to another tab (the workspace
 * unmounts, this keeps going) and can be surfaced by the global activity bar —
 * the same idea as {@link file://./useAnalysisRun} / {@link file://./useReadinessRun},
 * but the run also owns the mutated result (single toggles + bulk) so it must
 * live above the component. Components read it via {@link useFlowRun}.
 */
interface FlowRunState {
  solutionId: string
  result: ComparerResult | null
  comparing: boolean
  compareProgress: string
  loadedAt: Date | null
  error: string | null
  bulk: ComparerBulkRun | null
}

let state: FlowRunState = {
  solutionId: '',
  result: null,
  comparing: false,
  compareProgress: '',
  loadedAt: null,
  error: null,
  bulk: null,
}

const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}
const set = (patch: Partial<FlowRunState>) => {
  state = { ...state, ...patch }
  emit()
}
const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
const getSnapshot = () => state

// Guards against a stale compare finishing after a newer one started.
let compareReq = 0

function setSolutionId(id: string): void {
  // Switching solution drops the previous result + any finished bulk summary.
  set({ solutionId: id, result: null, error: null, bulk: null })
}

function startCompare(solution: WorkingSolution): void {
  const reqId = ++compareReq
  set({
    solutionId: solution.id,
    comparing: true,
    compareProgress: '',
    error: null,
    result: null,
    bulk: null,
  })
  flowComparerService
    .compareFlows(solution, (msg) => {
      if (reqId === compareReq) set({ compareProgress: msg })
    })
    .then((res) => {
      if (reqId !== compareReq) return
      set({
        comparing: false,
        compareProgress: '',
        result: res,
        loadedAt: new Date(),
      })
    })
    .catch((err) => {
      if (reqId !== compareReq) return
      set({
        comparing: false,
        compareProgress: '',
        error: err instanceof Error ? err.message : String(err),
      })
    })
}

function applyCell(rowId: string, envKey: string, cell: ComparerEnvState): void {
  const prev = state.result
  if (!prev) return
  const hostKey = currentEnvKey()
  const envKeys = ENVIRONMENTS.map((e) => e.key)
  const rows = prev.rows.map((r) => {
    if (r.id !== rowId) return r
    const updated: ComparerRow = { ...r, byEnv: { ...r.byEnv, [envKey]: cell } }
    updated.statusDrift = recomputeDrift(updated, hostKey, envKeys)
    return updated
  })
  set({ result: { ...prev, rows } })
}

async function startBulk(opts: {
  action: BulkAction
  rows: ComparerRow[]
  targetEnvKey: string
  targetEnvLabel: string
}): Promise<void> {
  const { action, rows, targetEnvKey, targetEnvLabel } = opts
  const total = rows.length
  set({
    bulk: { running: true, done: 0, total, label: '', targetEnvLabel, results: null },
  })
  const results: BulkResult[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const label =
      action.kind === 'owner'
        ? `Assigning owner of “${row.name}”…`
        : action.kind === 'activate'
          ? `Activating “${row.name}”…`
          : `Deactivating “${row.name}”…`
    // `done` = items completed so far; `label` = the item now in progress.
    set({ bulk: { running: true, done: i, total, label, targetEnvLabel, results: null } })
    const cell = row.byEnv[targetEnvKey]
    if (!cell || !cell.present) {
      results.push({ id: row.id, name: row.name, ok: false, skipped: true })
    } else {
      try {
        const nc =
          action.kind === 'owner'
            ? await flowComparerService.setFlowOwner(
                targetEnvKey,
                row.id,
                action.user.id,
              )
            : await flowComparerService.setFlowState(
                targetEnvKey,
                row.id,
                action.kind === 'activate',
              )
        applyCell(row.id, targetEnvKey, nc)
        results.push({ id: row.id, name: row.name, ok: true })
      } catch (err) {
        results.push({
          id: row.id,
          name: row.name,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }
  set({
    bulk: { running: false, done: total, total, label: '', targetEnvLabel, results },
  })
}

function dismissBulk(): void {
  if (state.bulk && !state.bulk.running) set({ bulk: null })
}

/** Read the singleton Flow run (subscribes for live updates). */
export function useFlowRun(): ComparerRunApi {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    ...snap,
    setSolutionId,
    startCompare,
    applyCell,
    startBulk: (opts) => void startBulk(opts),
    dismissBulk,
  }
}
