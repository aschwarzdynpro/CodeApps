import { useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import { KindIcon } from './KindBadge'

/**
 * Deployment Kanban — the working solutions bucketed by their
 * `pro_deploymentstatus` into one column per stage. Cards are moved between
 * stages with plain HTML5 drag & drop; a drop writes the new status through
 * `setDeploymentStatus` (via the onMove callback). Alternative view to the
 * workbench list — same data, same filters, no detail panel.
 */

/** Option value used when a record has no deployment status yet. */
const NONE_CODE = 500870000

/**
 * The drag & drop stages, in process order. Codes are the
 * `pro_deploymentstatus` option values — keep in sync with Dataverse.
 */
const STAGES: { code: number; label: string }[] = [
  { code: NONE_CODE, label: 'None' },
  { code: 500870001, label: 'To be deployed' },
  { code: 500870002, label: 'Deployment in progress' },
  { code: 500870003, label: 'Deployment completed' },
]

/**
 * Terminal log states written by the merge workbench — not part of the
 * deployment flow, so their columns are read-only and only appear when
 * populated.
 */
const MERGED_STAGES: { code: number; label: string }[] = [
  { code: 867520001, label: 'Merged into Deployment Solution' },
  { code: 867520002, label: 'Merged into Core Solution' },
]

const STAGE_CODES = new Set([...STAGES, ...MERGED_STAGES].map((s) => s.code))

interface DeploymentBoardProps {
  /** The (already filtered) working solutions to lay out. */
  solutions: WorkingSolution[]
  /** Persist a card's new stage; the caller reloads the list afterwards. */
  onMove: (solution: WorkingSolution, statusCode: number) => Promise<void>
}

export function DeploymentBoard({ solutions, onMove }: DeploymentBoardProps) {
  // recordId of the card currently being dragged / column hovered over.
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCode, setOverCode] = useState<number | null>(null)
  // Card whose move is being written (spinner overlay).
  const [movingId, setMovingId] = useState<string | null>(null)
  // Optimistic stage overrides so a dropped card stays in its new column
  // while the write + reload are in flight. Confirmed entries simply match
  // the refreshed server state; a failed write removes the override again.
  const [overrides, setOverrides] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  )
  const [moveError, setMoveError] = useState<string | null>(null)

  const stageOf = (s: WorkingSolution): number => {
    const override = s.recordId ? overrides.get(s.recordId) : undefined
    const code = override ?? s.deploymentStatusCode ?? NONE_CODE
    return STAGE_CODES.has(code) ? code : NONE_CODE
  }

  const byStage = new Map<number, WorkingSolution[]>()
  for (const s of solutions) {
    const code = stageOf(s)
    const bucket = byStage.get(code)
    if (bucket) bucket.push(s)
    else byStage.set(code, [s])
  }

  // Merged columns are informational — only rendered when something is there.
  const columns = [
    ...STAGES.map((s) => ({ ...s, droppable: true })),
    ...MERGED_STAGES.filter((s) => byStage.get(s.code)?.length).map((s) => ({
      ...s,
      droppable: false,
    })),
  ]

  const handleDrop = async (code: number) => {
    const id = dragId
    setDragId(null)
    setOverCode(null)
    if (!id) return
    const solution = solutions.find((s) => s.recordId === id)
    if (!solution || stageOf(solution) === code) return
    setMovingId(id)
    setMoveError(null)
    setOverrides((prev) => new Map(prev).set(id, code))
    try {
      await onMove(solution, code)
    } catch (err) {
      // Revert the optimistic move — the card snaps back to its old column.
      setOverrides((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      setMoveError(
        `Moving “${solution.title}” failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setMovingId(null)
    }
  }

  return (
    <div className="kanban-wrap">
      {moveError && (
        <div className="state state--error kanban-error">
          <span>{moveError}</span>
          <button
            className="btn btn--small"
            onClick={() => setMoveError(null)}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="kanban" role="list" aria-label="Deployment board">
        {columns.map((col) => {
          const cards = byStage.get(col.code) ?? []
          const isOver = col.droppable && overCode === col.code && !!dragId
          return (
            <section
              key={col.code}
              role="listitem"
              className={`kanban-col ${isOver ? 'kanban-col--over' : ''} ${
                col.droppable ? '' : 'kanban-col--readonly'
              }`}
              onDragOver={
                col.droppable
                  ? (e) => {
                      if (!dragId) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (overCode !== col.code) setOverCode(col.code)
                    }
                  : undefined
              }
              onDragLeave={
                col.droppable
                  ? (e) => {
                      // Ignore moves into the column's own children.
                      if (
                        e.relatedTarget instanceof Node &&
                        e.currentTarget.contains(e.relatedTarget)
                      )
                        return
                      if (overCode === col.code) setOverCode(null)
                    }
                  : undefined
              }
              onDrop={
                col.droppable
                  ? (e) => {
                      e.preventDefault()
                      void handleDrop(col.code)
                    }
                  : undefined
              }
            >
              <header className="kanban-col-head">
                <span className="kanban-col-title">{col.label}</span>
                {!col.droppable && (
                  <span
                    className="kanban-col-lock"
                    title="Set by the merge workbench — read-only."
                  >
                    🔒
                  </span>
                )}
                <span className="kanban-col-count">{cards.length}</span>
              </header>
              <div className="kanban-cards">
                {cards.map((s) => {
                  const draggable =
                    col.droppable && !!s.recordId && !movingId
                  const moving = !!s.recordId && movingId === s.recordId
                  return (
                    <article
                      key={s.recordId ?? s.id}
                      className={`kanban-card ${
                        dragId && s.recordId === dragId
                          ? 'kanban-card--dragging'
                          : ''
                      } ${moving ? 'kanban-card--moving' : ''} ${
                        draggable ? '' : 'kanban-card--static'
                      }`}
                      draggable={draggable}
                      title={
                        s.recordId
                          ? undefined
                          : 'Untracked solution — no working-solution record, so it has no deployment status to move.'
                      }
                      onDragStart={
                        draggable
                          ? (e) => {
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData(
                                'text/plain',
                                s.recordId ?? '',
                              )
                              setDragId(s.recordId ?? null)
                            }
                          : undefined
                      }
                      onDragEnd={
                        draggable
                          ? () => {
                              setDragId(null)
                              setOverCode(null)
                            }
                          : undefined
                      }
                    >
                      <div className="kanban-card-title">
                        <KindIcon kind={s.kind} />
                        <strong>{s.title}</strong>
                        {moving && <span className="kanban-card-spinner" />}
                      </div>
                      <div className="kanban-card-meta">
                        <code>{s.uniqueName}</code>
                        <span className="kanban-card-version">
                          v{s.version}
                        </span>
                      </div>
                      <div className="kanban-card-foot">
                        {s.devOpsId && (
                          <span className="kanban-card-ado">
                            #{s.devOpsId}
                          </span>
                        )}
                        {!s.recordId && (
                          <span className="kanban-card-untracked">
                            untracked
                          </span>
                        )}
                        {s.owner && (
                          <span className="kanban-card-owner">{s.owner}</span>
                        )}
                      </div>
                    </article>
                  )
                })}
                {cards.length === 0 && (
                  <div className="kanban-empty">
                    {col.droppable ? 'Drop cards here' : '—'}
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>
      <p className="kanban-hint muted">
        Drag a card to change its deployment status. Untracked solutions
        (without a working-solution record) can't be moved — track them first.
      </p>
    </div>
  )
}
