import { useState } from 'react'
import type { TransferPackage } from '../types/transferHub'
import { ENVIRONMENTS } from '../config'
import { SchedulePicker } from './SchedulePicker'

interface Props {
  pkg: TransferPackage
  /** Queue the run — `scheduledFor` (ISO, UTC) only for "Run later". */
  onQueue: (scheduledFor?: string) => Promise<void>
  onClose: () => void
}

/** Local-time value for <input type="datetime-local">: next full hour. */
function defaultWhen(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Replaces the plain run confirm: queue the package's run immediately
 * ("Run now" → status Queued) or at a chosen local date/time ("Run later" →
 * status Scheduled; the scheduler flow flips it to Queued once due, checking
 * every few minutes). PROD targets get the danger styling.
 */
export function TransferRunDialog({ pkg, onQueue, onClose }: Props) {
  const [mode, setMode] = useState<'now' | 'later'>('now')
  const [when, setWhen] = useState(defaultWhen)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const danger = pkg.targetEnvKeys.includes('prod')
  const envLabel = (key: string) => ENVIRONMENTS.find((e) => e.key === key)?.label ?? key

  // Parse-only validation in render (pure); the "must be in the future"
  // check runs in the submit handler — Date.now() is impure during render.
  const whenDate = mode === 'later' && when ? new Date(when) : null
  const whenUnparsable = mode === 'later' && (!when || Number.isNaN(whenDate?.getTime()))
  const canSubmit = !busy && !whenUnparsable

  const submit = async () => {
    if (!canSubmit) return
    if (mode === 'later' && whenDate!.getTime() <= Date.now()) {
      setError('Pick a time in the future.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onQueue(mode === 'later' ? whenDate!.toISOString() : undefined)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{danger ? '⚠ ' : ''}Run "{pkg.name}"</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="muted thub-run-dialog-summary">
          The external executor will transport{' '}
          <strong>
            {pkg.entryCount ?? '?'} entr{(pkg.entryCount ?? 0) === 1 ? 'y' : 'ies'}
          </strong>{' '}
          into <strong>{pkg.targetEnvKeys.map(envLabel).join(', ')}</strong>. The
          target list is snapshotted onto the run.
        </p>

        <div className="form-row">
          <span className="form-label">When</span>
          <div className="chips">
            <button
              className={`chip ${mode === 'now' ? 'chip--active' : ''}`}
              onClick={() => setMode('now')}
            >
              ▶ Run now
            </button>
            <button
              className={`chip ${mode === 'later' ? 'chip--active' : ''}`}
              onClick={() => setMode('later')}
            >
              ⏰ Run later
            </button>
          </div>
        </div>

        {mode === 'later' && (
          <div className="form-row">
            <span className="form-label">Scheduled for (your local time)</span>
            <SchedulePicker
              value={when}
              onChange={(v) => {
                setWhen(v)
                setError(null)
              }}
            />
            {whenUnparsable && <span className="form-error">Pick a date and time.</span>}
            <span className="muted thub-hint">
              The scheduler picks due runs up every few minutes — the actual
              start can lag the chosen time slightly.
            </span>
          </div>
        )}

        {error && <div className="state state--error">{error}</div>}

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={`btn btn--primary ${danger ? 'btn--danger' : ''}`}
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {busy ? 'Queuing…' : mode === 'now' ? 'Queue run now' : 'Schedule run'}
          </button>
        </div>
      </div>
    </div>
  )
}
