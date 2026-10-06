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

/** Stores the run; false when the browser refuses (private mode, quota — a large snapshot) — the caller must offer the download, it is the only undo package then. */
export function saveRun(record: RunRecord): boolean {
  const next = [record, ...listRuns().filter((r) => r.id !== record.id)].slice(0, LIMITS.historyMax)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    return true
  } catch {
    // storage unavailable or full — the run itself must not fail over this
    return false
  }
}

export const runFileName = (r: RunRecord): string => `lauf-${r.startedAt.slice(0, 10)}-${r.id.slice(0, 8)}.json`

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
