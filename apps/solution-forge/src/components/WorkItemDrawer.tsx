import { useEffect } from 'react'
import type { WorkItemInfo } from '../types/solution'
import { renderWorkItemDescription } from '../utils/richText'

/** Visual bucket for a work item state across common process templates. */
function stateBucket(state: string): string {
  const s = state.toLowerCase()
  if (['new', 'to do', 'proposed', 'approved'].includes(s)) return 'new'
  if (['active', 'in progress', 'doing', 'committed'].includes(s)) return 'active'
  if (['resolved'].includes(s)) return 'resolved'
  if (['closed', 'done', 'completed'].includes(s)) return 'closed'
  if (['removed'].includes(s)) return 'removed'
  return 'other'
}

interface Props {
  /** The Azure DevOps work item number this drawer is showing. */
  devOpsId: string
  /** Resolved work item, or null when it couldn't be read / doesn't exist. */
  workItem: WorkItemInfo | null
  loading: boolean
  /** Browser link into Azure DevOps, or null when org/project aren't configured. */
  url: string | null
  onClose: () => void
}

/**
 * Right slide-in drawer with the full Azure DevOps work item for one working
 * solution — opened from the row's DevOps cell, independent of the solution
 * detail pane (no need to expand the components). Shows type/title, state,
 * owner and the sanitized rich-text/Markdown description, plus a link into
 * Azure DevOps. Reuses the `.drawer*` styles from the "My work items" drawer.
 */
export function WorkItemDrawer({
  devOpsId,
  workItem,
  loading,
  url,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const descHtml = workItem
    ? renderWorkItemDescription(workItem.description)
    : ''

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Azure DevOps work item ${devOpsId}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2>Azure DevOps</h2>
            <p className="drawer-subtitle muted">#{devOpsId}</p>
          </div>
          <div className="drawer-header-actions">
            {url && (
              <a
                className="btn btn--small"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                Open ↗
              </a>
            )}
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="drawer-body wi-drawer-body">
          {loading && <div className="muted">Loading work item…</div>}
          {!loading && !workItem && (
            <div className="muted">
              No details for work item #{devOpsId} — it may not exist in the
              configured project, or the connection can’t read it.
            </div>
          )}
          {!loading && workItem && (
            <>
              <div className="wi-drawer-title">
                <span className="wi-type muted">{workItem.type}</span>
                <span className="wi-drawer-name" title={workItem.title}>
                  {workItem.title}
                </span>
              </div>
              <dl className="wi-fields">
                <dt>Status</dt>
                <dd>
                  <span
                    className={`wi-state wi-state--${stateBucket(workItem.state)}`}
                  >
                    {workItem.state}
                  </span>
                </dd>
                <dt>Owner</dt>
                <dd>{workItem.assignedTo ?? 'Unassigned'}</dd>
                <dt>Description</dt>
                {descHtml ? (
                  <dd
                    className="wi-description wi-description--drawer"
                    // Sanitized DevOps rich text/Markdown (utils/richText).
                    dangerouslySetInnerHTML={{ __html: descHtml }}
                  />
                ) : (
                  <dd className="wi-description muted">—</dd>
                )}
              </dl>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
