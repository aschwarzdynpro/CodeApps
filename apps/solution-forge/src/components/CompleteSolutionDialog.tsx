import { useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import { KindBadge } from './KindBadge'

interface Props {
  solution: WorkingSolution
  /** Confirmed — `deleteUnderlying` says whether to also drop the solution. */
  onConfirm: (deleteUnderlying: boolean) => void
  onCancel: () => void
}

/**
 * Marks an open working solution as completed, optionally deleting its
 * underlying unmanaged solution. When the solution is deleted the deletion is
 * deferred behind a 3-second undo (handled by the caller); undoing also
 * reopens the working solution.
 */
export function CompleteSolutionDialog({
  solution,
  onConfirm,
  onCancel,
}: Props) {
  // Default to deleting the solution when there is one to delete.
  const canDelete = !solution.solutionMissing
  const [deleteUnderlying, setDeleteUnderlying] = useState(canDelete)

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Mark as completed?</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="confirm-delete-target">
          <KindBadge kind={solution.kind} /> <strong>{solution.title}</strong>
        </p>

        <p className="confirm-delete-text">
          This sets the working solution's deployment status to{' '}
          <strong>Deployment completed</strong>, so it drops out of the Open
          list.
        </p>

        {canDelete && (
          <label className="complete-delete-option">
            <input
              type="checkbox"
              checked={deleteUnderlying}
              onChange={(e) => setDeleteUnderlying(e.target.checked)}
            />
            <span>
              Also delete the underlying solution{' '}
              <code>{solution.uniqueName}</code> (container only — components
              stay in the system)
            </span>
          </label>
        )}

        {canDelete && deleteUnderlying && (
          <p className="confirm-delete-text muted">
            You get 3 seconds to undo before the solution is deleted — undoing
            also reopens this working solution.
          </p>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={() => onConfirm(canDelete && deleteUnderlying)}
          >
            {canDelete && deleteUnderlying
              ? 'Complete & delete solution'
              : 'Mark completed'}
          </button>
        </div>
      </div>
    </div>
  )
}
