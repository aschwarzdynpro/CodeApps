import { LIMITS } from '../config'
import type { RunRecord } from '../types/calendar'

/**
 * Local run history (last 20): plan summary, snapshot and results per
 * step — the undo package. Browser storage can be missing (private mode,
 * blocked site data): every access is guarded and the app works without it.
 */

const KEY = 'whm.runs'

export function listRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as RunRecord[]) : []
  } catch {
    return []
  }
}

export function saveRun(record: RunRecord): RunRecord[] {
  const next = [record, ...listRuns().filter((r) => r.id !== record.id)].slice(0, LIMITS.historyMax)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage unavailable or full — the run itself must not fail over this
  }
  return next
}

export function markUndone(runId: string, undoneBy: string): RunRecord[] {
  const next = listRuns().map((r) => (r.id === runId ? { ...r, undoneBy } : r))
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // see saveRun
  }
  return next
}

/** Downloads a run as JSON — the snapshot that survives a cleared browser. */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
