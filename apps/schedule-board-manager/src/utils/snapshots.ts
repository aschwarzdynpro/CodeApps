import type { BoardContent } from '../types/board'

/**
 * Local safety net: before every write the board's previous content is kept
 * in this browser (last 10 per board). Restoring loads it as a draft, so it
 * goes through the normal diff + save path. Browser storage can be missing
 * (private mode, blocked site data) — every access is guarded and the app
 * works without it.
 */

export interface Snapshot {
  at: string
  label: string
  content: BoardContent
}

const MAX = 10
const keyFor = (boardId: string) => `sbm.snapshots.${boardId.toLowerCase()}`

export function listSnapshots(boardId: string): Snapshot[] {
  try {
    const raw = localStorage.getItem(keyFor(boardId))
    return raw ? (JSON.parse(raw) as Snapshot[]) : []
  } catch {
    return []
  }
}

export function saveSnapshot(boardId: string, label: string, content: BoardContent): void {
  try {
    const next = [{ at: new Date().toISOString(), label, content }, ...listSnapshots(boardId)].slice(0, MAX)
    localStorage.setItem(keyFor(boardId), JSON.stringify(next))
  } catch {
    // Storage unavailable or full — the write itself must not fail over this.
  }
}

/** Downloads a board's content as JSON — the snapshot that survives a cleared browser. */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
