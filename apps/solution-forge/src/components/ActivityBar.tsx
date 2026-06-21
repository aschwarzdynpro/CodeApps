import type { ReactNode } from 'react'

interface Props {
  /** Drives the colour + leading icon (spinner / ✓ / ✕). */
  state: 'running' | 'done' | 'error'
  /** Jump back to the run that owns this bar. */
  onView: () => void
  /** Dismiss the bar (only offered once the run has finished). */
  onClose?: () => void
  children: ReactNode
}

/**
 * A fixed background-activity bar surfacing a long-running job (an Analyze
 * sweep or a Deployment-Readiness check) that keeps going while the user
 * navigates away. Several can stack inside the `.activity-bars` container.
 */
export function ActivityBar({ state, onView, onClose, children }: Props) {
  return (
    <div className={`analysis-bar analysis-bar--${state}`}>
      {state === 'running' ? (
        <span className="det-spinner" />
      ) : (
        <span className="analysis-bar-icon">{state === 'error' ? '✕' : '✓'}</span>
      )}
      <span className="analysis-bar-text">{children}</span>
      <button className="analysis-bar-view" onClick={onView}>
        View
      </button>
      {onClose && (
        <button
          className="analysis-bar-close"
          aria-label="Dismiss"
          onClick={onClose}
        >
          ✕
        </button>
      )}
    </div>
  )
}
