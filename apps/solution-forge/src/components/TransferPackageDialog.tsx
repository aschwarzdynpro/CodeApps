import { useState } from 'react'
import type {
  TransferPackage,
  TransferPackageInput,
  TransferRecurrence,
} from '../types/transferHub'
import { ENVIRONMENTS } from '../config'
import { SchedulePicker } from './SchedulePicker'
import { toLocalInputValue } from '../utils/schedule'

interface Props {
  /** Existing package to edit, or null for a new one. */
  pkg: TransferPackage | null
  onSave: (input: TransferPackageInput) => Promise<void>
  onClose: () => void
}

const RECURRENCE_OPTIONS: { value: TransferRecurrence; label: string; hint: string }[] = [
  { value: 'none', label: 'Manual only', hint: 'Runs when someone hits ▶ Run' },
  { value: 'daily', label: 'Daily', hint: 'Every day at the chosen time' },
  { value: 'weekly', label: 'Weekly', hint: 'Every week on the chosen weekday' },
]

/** Local "YYYY-MM-DDTHH:mm" default for a new schedule: tomorrow, 02:00. */
function defaultFirstRun(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(2, 0, 0, 0)
  return toLocalInputValue(d)
}

/**
 * Modal form for a transfer package: name, description, execution order, the
 * target environments as a chip multi-toggle over the ENVIRONMENTS registry
 * (stored as comma-separated keys — the registry itself is runtime
 * configuration, so no Dataverse choice) and the optional recurring schedule.
 */
export function TransferPackageDialog({ pkg, onSave, onClose }: Props) {
  const [name, setName] = useState(pkg?.name ?? '')
  const [description, setDescription] = useState(pkg?.description ?? '')
  const [order, setOrder] = useState(String(pkg?.order ?? 1))
  const [targets, setTargets] = useState<Set<string>>(
    () => new Set(pkg?.targetEnvKeys ?? []),
  )
  const [recurrence, setRecurrence] = useState<TransferRecurrence>(
    pkg?.recurrence ?? 'none',
  )
  // Local-time value for the picker; converted to ISO on save.
  const [firstRun, setFirstRun] = useState(() =>
    pkg?.nextRun ? toLocalInputValue(new Date(pkg.nextRun)) : defaultFirstRun(),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleTarget = (key: string) => {
    setTargets((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const orderNum = Number(order)
  // Parse-only in render (Date.now() is impure here); the "must be future"
  // check runs in the submit handler.
  const firstRunDate = recurrence === 'none' ? null : new Date(firstRun)
  const firstRunInvalid =
    recurrence !== 'none' && (!firstRun || Number.isNaN(firstRunDate?.getTime()))
  const canSubmit =
    !submitting &&
    name.trim() !== '' &&
    targets.size > 0 &&
    !firstRunInvalid &&
    Number.isFinite(orderNum) &&
    orderNum >= 0

  const submit = async () => {
    if (!canSubmit) return
    if (firstRunDate && firstRunDate.getTime() <= Date.now()) {
      setError('The first scheduled run must be in the future.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        // Keep the registry order (dev, uat, prod) in the stored list.
        targetEnvKeys: ENVIRONMENTS.filter((e) => targets.has(e.key)).map((e) => e.key),
        order: orderNum,
        recurrence,
        nextRun: firstRunDate ? firstRunDate.toISOString() : '',
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{pkg ? 'Edit Transfer Package' : 'New Transfer Package'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <label className="form-row">
          <span className="form-label">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Base configuration data"
            autoFocus
          />
        </label>

        <label className="form-row">
          <span className="form-label">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Which configuration data does this package transport?"
          />
        </label>

        <div className="form-row">
          <span className="form-label">Target environments</span>
          <div className="chips">
            {ENVIRONMENTS.map((env) => (
              <button
                key={env.key}
                className={`chip ${targets.has(env.key) ? 'chip--active' : ''}`}
                title={env.url}
                onClick={() => toggleTarget(env.key)}
              >
                {env.label}
                {env.isCurrent ? ' · host' : ''}
              </button>
            ))}
          </div>
          {targets.size === 0 && (
            <span className="form-error">Pick at least one target environment.</span>
          )}
        </div>

        <label className="form-row">
          <span className="form-label">Order (across packages, ascending)</span>
          <input
            type="number"
            min={0}
            max={10000}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          />
        </label>

        <div className="form-row">
          <span className="form-label">Schedule</span>
          <div className="chips">
            {RECURRENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`chip ${recurrence === opt.value ? 'chip--active' : ''}`}
                title={opt.hint}
                onClick={() => {
                  setRecurrence(opt.value)
                  setError(null)
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {recurrence !== 'none' && (
            <>
              <span className="muted thub-hint">
                Pick the <strong>first</strong> run — its time of day
                {recurrence === 'weekly' ? ' and weekday' : ''} repeats
                {recurrence === 'daily' ? ' every day' : ' every week'}. The
                scheduler queues it within a few minutes of the due time.
              </span>
              <SchedulePicker
                value={firstRun}
                onChange={(v) => {
                  setFirstRun(v)
                  setError(null)
                }}
              />
              {firstRunInvalid && (
                <span className="form-error">Pick a date and time.</span>
              )}
            </>
          )}
        </div>

        {error && <div className="state state--error">{error}</div>}

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {submitting ? 'Saving…' : pkg ? 'Save package' : 'Create package'}
          </button>
        </div>
      </div>
    </div>
  )
}
