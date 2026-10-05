/**
 * Browser storage for per-user conveniences: the run history and the
 * "correct as is" markers. Both are local to this browser (v2: own table);
 * every access is guarded — storage can be blocked in the Power Apps host.
 */

export interface RunRecord {
  id: string
  at: string
  orgUrl: string
  solution: string
  /** Changed cells per language. */
  counts: Record<number, number>
  importJobId: string | null
  status: 'succeeded' | 'failed' | 'running' | 'error'
  /** null: unknown (publishing didn't answer in time). */
  published: boolean | null
  /** Short outcome: error text or "n Meldungen". */
  message: string
}

const HISTORY = 'translation-studio.history'
const HISTORY_MAX = 25
const ACK = 'translation-studio.ack'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: history is a convenience, the import itself is unaffected.
  }
}

export function loadHistory(): RunRecord[] {
  return read<RunRecord[]>(HISTORY, [])
}

/** Adds or replaces a run (by id), newest first. */
export function saveRun(run: RunRecord): RunRecord[] {
  const next = [run, ...loadHistory().filter((r) => r.id !== run.id)].slice(0, HISTORY_MAX)
  write(HISTORY, next)
  return next
}

export function clearHistory(): void {
  write(HISTORY, [])
}

const DURATION = 'translation-studio.exportms'
const durationKey = (orgUrl: string, solution: string) => `${orgUrl || 'mock'}|${solution}`

/** Duration of the last export of a solution in this browser (ms), for the load progress. */
export function loadExportDuration(orgUrl: string, solution: string): number | null {
  const ms = read<Record<string, number>>(DURATION, {})[durationKey(orgUrl, solution)]
  return typeof ms === 'number' && ms > 0 ? ms : null
}

export function saveExportDuration(orgUrl: string, solution: string, ms: number): void {
  write(DURATION, { ...read<Record<string, number>>(DURATION, {}), [durationKey(orgUrl, solution)]: Math.round(ms) })
}

/** Duration of the last import job of a solution in this browser (ms): the apply dialog measures against it. */
export function loadImportDuration(orgUrl: string, solution: string): number | null {
  const ms = read<Record<string, number>>(DURATION, {})[`import|${durationKey(orgUrl, solution)}`]
  return typeof ms === 'number' && ms > 0 ? ms : null
}

export function saveImportDuration(orgUrl: string, solution: string, ms: number): void {
  write(DURATION, { ...read<Record<string, number>>(DURATION, {}), [`import|${durationKey(orgUrl, solution)}`]: Math.round(ms) })
}

const DETAILS = 'translation-studio.details'

/** Whether the designer's details panel (inspector) is open; null when the user never chose. */
export function loadDetailsOpen(): boolean | null {
  const v = read<unknown>(DETAILS, null)
  return typeof v === 'boolean' ? v : null
}

export function saveDetailsOpen(open: boolean): void {
  write(DETAILS, open)
}

/** Designer panes: explorer shown, widths of explorer and details (px). */
export interface Panes {
  explorer: boolean
  explorerWidth: number
  detailsWidth: number
}

const PANES = 'translation-studio.panes'
export const DEFAULT_PANES: Panes = { explorer: true, explorerWidth: 280, detailsWidth: 320 }

export function loadPanes(): Panes {
  const v = read<Partial<Panes>>(PANES, {})
  const num = (n: unknown, d: number) => (typeof n === 'number' && Number.isFinite(n) ? n : d)
  return {
    explorer: typeof v.explorer === 'boolean' ? v.explorer : DEFAULT_PANES.explorer,
    explorerWidth: num(v.explorerWidth, DEFAULT_PANES.explorerWidth),
    detailsWidth: num(v.detailsWidth, DEFAULT_PANES.detailsWidth),
  }
}

export function savePanes(panes: Panes): void {
  write(PANES, panes)
}

const ackKey = (orgUrl: string, solution: string) => `${ACK}.${orgUrl || 'mock'}.${solution}`

/** Cell ids marked "correct as is" for one solution. */
export function loadAcknowledged(orgUrl: string, solution: string): Set<string> {
  return new Set(read<string[]>(ackKey(orgUrl, solution), []))
}

export function saveAcknowledged(orgUrl: string, solution: string, ids: ReadonlySet<string>): void {
  write(ackKey(orgUrl, solution), [...ids])
}
