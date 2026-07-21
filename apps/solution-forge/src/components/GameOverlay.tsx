import { PenaltyGame } from './PenaltyGame'

interface Props {
  /** Headline, e.g. "Bulk update running…". */
  title: string
  /** The step currently in progress. */
  label: string
  /** Items finished so far. */
  done: number
  /** Total items in the run. */
  total: number
  /** Hide the overlay but keep the underlying run going (inline bar stays). */
  onMinimize: () => void
}

/**
 * A full-screen overlay shown while a long background run (e.g. a Flow Comparer
 * bulk update) is in flight — it surfaces the live progress AND a self-contained
 * penalty-shootout mini-game to bridge the wait. Dismissing it ("continue in the
 * background") only hides the overlay; the run keeps going and the inline
 * progress bar remains. Reuses the `.cmp-progress` bar from the workspace and the
 * shared brand accent so the game fits the console.
 */
export function GameOverlay({ title, label, done, total, onMinimize }: Props) {
  const pct = Math.round((done / Math.max(1, total)) * 100)
  return (
    <div className="modal-backdrop game-overlay-backdrop">
      <div
        className="game-overlay-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="game-overlay-head">
          <div className="game-overlay-progress">
            <div className="game-overlay-title-row">
              <span className="sharing-progress-spinner" />
              <strong className="game-overlay-title">{title}</strong>
              <span className="game-overlay-pct">
                {done}/{total} · {pct}%
              </span>
            </div>
            <div
              className="cmp-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <div className="cmp-progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="game-overlay-label muted">
              {label || 'Working…'}
            </div>
          </div>
          <button
            className="btn btn--small game-overlay-minimize"
            onClick={onMinimize}
            title="Hide this and let the update finish in the background"
          >
            Continue in background ✕
          </button>
        </div>

        <p className="game-overlay-hint muted">
          This runs in the background — pass the time with a penalty shootout.
        </p>

        <PenaltyGame
          accentColor="#5b5bd6"
          busy
          title="Penalty shootout"
          subtitle="A goal a day keeps the boredom away"
        />
      </div>
    </div>
  )
}

export default GameOverlay
