import type { WorkingSolution } from '../types/solution'
import { KindBadge } from './KindBadge'

interface Props {
  solution: WorkingSolution
  onConfirm: () => void
  onCancel: () => void
}

/** What exactly a delete will remove, depending on the entry's shape. */
function deletionScope(s: WorkingSolution): string[] {
  const parts: string[] = []
  if (s.recordId) parts.push('the working-solution record')
  if (!s.solutionMissing)
    parts.push(`the solution "${s.uniqueName}" (container only — components stay in the system)`)
  return parts
}

export function ConfirmDeleteDialog({ solution, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Delete this entry?</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="confirm-delete-target">
          <KindBadge kind={solution.kind} /> <strong>{solution.title}</strong>
        </p>

        <p className="confirm-delete-text">This will delete:</p>
        <ul className="confirm-delete-list">
          {deletionScope(solution).map((part) => (
            <li key={part}>{part}</li>
          ))}
        </ul>
        <p className="confirm-delete-text muted">
          You get 5 seconds to undo before the deletion becomes final.
        </p>

        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
