import { useState } from 'react'
import type { TransferPackage, TransferPackageInput } from '../types/transferHub'
import { ENVIRONMENTS } from '../config'

interface Props {
  /** Existing package to edit, or null for a new one. */
  pkg: TransferPackage | null
  onSave: (input: TransferPackageInput) => Promise<void>
  onClose: () => void
}

/**
 * Modal form for a transfer package: name, description, execution order and
 * the target environments as a chip multi-toggle over the ENVIRONMENTS
 * registry (stored as comma-separated keys — the registry itself is runtime
 * configuration, so no Dataverse choice).
 */
export function TransferPackageDialog({ pkg, onSave, onClose }: Props) {
  const [name, setName] = useState(pkg?.name ?? '')
  const [description, setDescription] = useState(pkg?.description ?? '')
  const [order, setOrder] = useState(String(pkg?.order ?? 1))
  const [targets, setTargets] = useState<Set<string>>(
    () => new Set(pkg?.targetEnvKeys ?? []),
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
  const canSubmit =
    !submitting &&
    name.trim() !== '' &&
    targets.size > 0 &&
    Number.isFinite(orderNum) &&
    orderNum >= 0

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        // Keep the registry order (dev, uat, prod) in the stored list.
        targetEnvKeys: ENVIRONMENTS.filter((e) => targets.has(e.key)).map((e) => e.key),
        order: orderNum,
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
