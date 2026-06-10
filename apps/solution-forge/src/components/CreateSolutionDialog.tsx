import { useState } from 'react'
import type {
  CreateWorkingSolutionInput,
  PublisherInfo,
  WorkingSolution,
} from '../types/solution'
import { buildUniqueName, sanitizeIdPart } from '../utils/naming'

type Kind = CreateWorkingSolutionInput['kind']

const KIND_OPTIONS: { value: Kind; label: string; hint: string }[] = [
  { value: 'feature', label: 'Feature', hint: 'feature_<ADO id>' },
  { value: 'bug', label: 'Bug', hint: 'bug_<ADO id>' },
  { value: 'deployment', label: 'Deployment', hint: 'deploy_<name>' },
]

interface Props {
  publishers: PublisherInfo[]
  existingUniqueNames: string[]
  onCreate: (input: CreateWorkingSolutionInput) => Promise<WorkingSolution>
  onCreated: (solution: WorkingSolution) => void
  onClose: () => void
}

/**
 * Modal form for a new working solution. The Azure DevOps id becomes the
 * unique name (with the kind prefix supplying the mandatory leading letter),
 * the title becomes the display name. Shows a live preview and validates the
 * unique name against the solutions already in the environment.
 */
export function CreateSolutionDialog({
  publishers,
  existingUniqueNames,
  onCreate,
  onCreated,
  onClose,
}: Props) {
  const [kind, setKind] = useState<Kind>('feature')
  const [devOpsId, setDevOpsId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [publisherId, setPublisherId] = useState(publishers[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idPart = sanitizeIdPart(devOpsId)
  const uniqueName = idPart ? buildUniqueName(kind, idPart) : ''
  const duplicate =
    !!uniqueName &&
    existingUniqueNames.some(
      (n) => n.toLowerCase() === uniqueName.toLowerCase(),
    )
  const idInvalid =
    kind !== 'deployment' && idPart !== '' && !/^\d+$/.test(idPart)

  const canSubmit =
    !submitting &&
    title.trim() !== '' &&
    idPart !== '' &&
    !duplicate &&
    !idInvalid &&
    publisherId !== ''

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await onCreate({
        title: title.trim(),
        devOpsId: idPart,
        kind,
        description: description.trim(),
        publisherId,
      })
      onCreated(created)
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
          <h2>New Working Solution</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="form-row">
          <span className="form-label">Type</span>
          <div className="chips">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`chip ${kind === opt.value ? 'chip--active' : ''}`}
                onClick={() => setKind(opt.value)}
                title={opt.hint}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className="form-row">
          <span className="form-label">
            {kind === 'deployment' ? 'Release / sprint name' : 'Azure DevOps ID'}
          </span>
          <input
            value={devOpsId}
            onChange={(e) => setDevOpsId(e.target.value)}
            placeholder={kind === 'deployment' ? 'sprint_12' : '4711'}
            autoFocus
          />
          {idInvalid && (
            <span className="form-error">
              Feature / bug solutions expect the numeric work item id.
            </span>
          )}
        </label>

        <label className="form-row">
          <span className="form-label">Title (solution display name)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Customer onboarding wizard"
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

        <label className="form-row">
          <span className="form-label">Publisher</span>
          <select
            value={publisherId}
            onChange={(e) => setPublisherId(e.target.value)}
          >
            {publishers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.friendlyName} ({p.prefix || p.uniqueName})
              </option>
            ))}
          </select>
        </label>

        <div className={`preview ${duplicate ? 'preview--error' : ''}`}>
          <span className="form-label">Unique name preview</span>
          <code>{uniqueName || '—'}</code>
          {duplicate && (
            <span className="form-error">
              This unique name already exists in the environment.
            </span>
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
            {submitting ? 'Creating…' : 'Create solution'}
          </button>
        </div>
      </div>
    </div>
  )
}
