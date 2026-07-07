import type { WorkItemPick } from '../utils/workItem'

interface Props {
  items: WorkItemPick[]
  loading: boolean
  /** devOpsId → title of a working solution that already tracks it. Such items
   *  are flagged and not selectable (no duplicate). */
  existingByDevOpsId: Map<string, string>
  /** Create a working solution pre-filled from this work item. */
  onPick: (item: WorkItemPick) => void
  onRefresh: () => void
  onClose: () => void
}

/**
 * Right slide-in drawer listing the signed-in user's open Azure DevOps work
 * items (from {@link import('../services/devOpsService').DevOpsService.myWorkItems}).
 * Each item can be turned into a pre-filled New Working Solution in one click.
 * Only mounted when the connector-backed DevOps integration is on — without it
 * the launcher button is hidden and everything else keeps working.
 */
export function MyWorkItemsDrawer({
  items,
  loading,
  existingByDevOpsId,
  onPick,
  onRefresh,
  onClose,
}: Props) {
  const openCount = items.filter((it) => !existingByDevOpsId.has(it.id)).length
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="My work items"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2>My work items</h2>
            {!loading && items.length > 0 && (
              <p className="drawer-subtitle muted">
                {openCount} without a solution · {items.length - openCount}{' '}
                already tracked
              </p>
            )}
          </div>
          <div className="drawer-header-actions">
            <button
              className="btn btn--small"
              onClick={onRefresh}
              disabled={loading}
              title="Reload"
            >
              ⟳
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {loading && (
          <div className="drawer-body muted">Loading your work items…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="drawer-body muted">
            No open work items assigned to you in this project.
          </div>
        )}
        {!loading && items.length > 0 && (
          <ul className="drawer-list">
            {items.map((it) => {
              const tracked = existingByDevOpsId.get(it.id)
              return (
                <li
                  key={it.id}
                  className={`mywi ${tracked ? 'mywi--tracked' : ''}`}
                >
                  <div className="mywi-main">
                    <span className="mywi-id">#{it.id}</span>
                    <span className="mywi-title" title={it.title}>
                      {it.title}
                    </span>
                  </div>
                  <div className="mywi-meta muted">
                    {it.type} · {it.state}
                  </div>
                  {tracked ? (
                    <span
                      className="mywi-tracked"
                      title={`Already tracked by “${tracked}”`}
                    >
                      ✓ Has solution
                    </span>
                  ) : (
                    <button
                      className="btn btn--small btn--primary"
                      onClick={() => onPick(it)}
                    >
                      + Solution
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </aside>
    </div>
  )
}
