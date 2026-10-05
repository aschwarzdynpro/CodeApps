import { useEffect, useState } from 'react'
import { ProgressBar, Spinner } from '@fluentui/react-components'
import { CheckmarkCircleFilled, CircleRegular } from '@fluentui/react-icons'
import { Btn } from './ui'
import { S } from '../strings'
import type { ChunkProgress } from '../services/chunkedExport'

export type LoadPhase = 'export' | 'read'

export interface LoadProgressState {
  phase: LoadPhase
  /** Solution name shown in the title. */
  name: string
  /** Start of the current phase (ms). */
  phaseAt: number
  /** Duration of the last export of this solution in this browser (ms). */
  lastMs: number | null
  /** A large solution exported in parts: where it stands. */
  parts?: ChunkProgress
}

const STEPS: LoadPhase[] = ['export', 'read']

/** Share of the bar per step of a chunked export: [start, length] (measured: adding ~25 %, exporting ~65 %). */
const CHUNK_SHARE: Record<ChunkProgress['step'], [number, number]> = { prepare: [0, 0.03], add: [0.03, 0.25], export: [0.28, 0.65], merge: [0.93, 0.05] }

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Re-renders every `intervalMs` with the current time. */
function useNow(start: number, intervalMs: number): number {
  const [now, setNow] = useState(start)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return Math.max(now, start)
}

/**
 * Progress of loading a solution. The export is one synchronous server call
 * without intermediate status, so the bar measures against the last export of
 * the same solution (stored per browser); without one it runs indeterminate.
 */
export function LoadProgress({ state, onCancel }: { state: LoadProgressState; onCancel: () => void }) {
  const now = useNow(state.phaseAt, 500)
  const elapsed = now - state.phaseAt
  const exporting = state.phase === 'export'
  const longer = exporting && state.lastMs !== null && elapsed > state.lastMs
  const parts = exporting ? state.parts : undefined
  const value =
    parts && parts.total > 0 && parts.step !== 'prepare'
      ? CHUNK_SHARE[parts.step][0] + (CHUNK_SHARE[parts.step][1] * parts.done) / parts.total
      : exporting && state.lastMs !== null && !longer
        ? Math.min(elapsed / state.lastMs, 0.95)
        : undefined
  const current = STEPS.indexOf(state.phase)

  return (
    <div className="progress" role="status" aria-live="polite">
      <div className="progress__head">
        <strong>{S.progress.title(state.name)}</strong>
        <Btn kind="ghost" small onClick={onCancel}>
          {S.progress.cancel}
        </Btn>
      </div>
      <ol className="progress__steps">
        {STEPS.map((step, i) => (
          <li key={step} className={`progress__step progress__step--${i < current ? 'done' : i === current ? 'active' : 'todo'}`}>
            {i < current ? <CheckmarkCircleFilled aria-hidden /> : i === current ? <Spinner size="extra-tiny" /> : <CircleRegular aria-hidden />}
            <span>{S.progress[step]}</span>
            {i === current ? <span className="muted small">{S.progress.elapsed(formatDuration(elapsed))}</span> : null}
          </li>
        ))}
      </ol>
      <ProgressBar value={value} max={1} thickness="large" />
      {parts ? (
        <p className="small">
          <strong>{S.progress.parts[parts.step](parts.done, parts.total)}</strong> · <span className="muted">{S.progress.partsHint}</span>
        </p>
      ) : exporting ? (
        <p className="muted small">
          {state.lastMs !== null ? `${longer ? S.progress.longer : S.progress.last(formatDuration(state.lastMs))} · ` : ''}
          {S.progress.exportHint}
        </p>
      ) : null}
    </div>
  )
}
