import type { UserRef, WorkingSolution } from '../types/solution'
import { AssignOwnerPanel } from './SolutionDetail'

interface Props {
  solution: WorkingSolution
  onAssignToMe: (solution: WorkingSolution) => Promise<void>
  onAssign: (solution: WorkingSolution, userId: string) => Promise<void>
  onSearchUsers: (query: string) => Promise<UserRef[]>
  onClose: () => void
}

/**
 * Modal owner-reassignment, opened from a working-solution row's quick actions.
 * Reuses {@link AssignOwnerPanel}; closes itself once the assign succeeds.
 */
export function AssignDialog({
  solution,
  onAssignToMe,
  onAssign,
  onSearchUsers,
  onClose,
}: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{solution.title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <AssignOwnerPanel
          solution={solution}
          onAssignToMe={async (s) => {
            await onAssignToMe(s)
            onClose()
          }}
          onAssign={async (s, userId) => {
            await onAssign(s, userId)
            onClose()
          }}
          onSearchUsers={onSearchUsers}
        />
      </div>
    </div>
  )
}
