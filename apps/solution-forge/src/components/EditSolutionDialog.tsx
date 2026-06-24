import { useState } from 'react'
import type { CreateWorkingSolutionInput, WorkingSolution } from '../types/solution'
import { DEPLOYMENT_MANAGER_ROLE } from '../config'

type Kind = CreateWorkingSolutionInput['kind']

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'feature', label: 'Feature' },
  { value: 'bug', label: 'Bug' },
  { value: 'deployment', label: 'Release' },
]

interface Props {
  solution: WorkingSolution
  /** Setting the Release type is restricted to deployment managers. */
  canSetRelease: boolean
  onSave: (changes: {
    kind: Kind
    title: string
    description: string
  }) => Promise<void>
  onClose: () => void
}

/**
 * Overlay editor for an existing working solution — change its type, display
 * name and description (the unique name and DevOps id stay fixed). Mirrors the
 * create dialog's fields.
 */
export function EditSolutionDialog({
  solution,
  canSetRelease,
  onSave,
  onClose,
}: Props) {
  const [kind, setKind] = useState<Kind>(
    solution.kind === 'other' ? 'feature' : solution.kind,
  )
  const [title, setTitle] = useState(solution.title)
  const [description, setDescription] = useState(solution.description)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A non-manager may keep an existing Release but not switch one in.
  const releaseLocked = !canSetRelease && solution.kind !== 'deployment'
  const canSubmit =
    !submitting &&
    title.trim() !== '' &&
    (kind !== 'deployment' || !releaseLocked)

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await onSave({ kind, title: title.trim(), description: description.trim() })
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
          <h2>Edit working solution</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="form-row">
          <span className="form-label">Type</span>
          <div className="chips">
            {KIND_OPTIONS.map((opt) => {
              const locked = opt.value === 'deployment' && releaseLocked
              return (
                <button
                  key={opt.value}
                  className={`chip ${kind === opt.value ? 'chip--active' : ''} ${
                    locked ? 'chip--disabled' : ''
                  }`}
                  disabled={locked}
                  onClick={() => !locked && setKind(opt.value)}
                  title={
                    locked
                      ? `Setting Release requires the security role “${DEPLOYMENT_MANAGER_ROLE}”.`
                      : undefined
                  }
                >
                  {opt.label}
                  {locked && <span className="chip-lock"> ⓘ</span>}
                </button>
              )
            })}
          </div>
        </div>

        <label className="form-row">
          <span className="form-label">Title (solution display name)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Customer onboarding wizard"
            autoFocus
          />
        </label>

        <label className="form-row">
          <span className="form-label">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What is being built or fixed in this solution?"
          />
        </label>

        <div className="preview">
          <span className="form-label">Unique name</span>
          <code>{solution.uniqueName}</code>
          <span className="muted"> · stays unchanged</span>
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
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
