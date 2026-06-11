import { useState } from 'react'
import type {
  ComponentCollision,
  SolutionComponentInfo,
  WorkItemInfo,
  WorkingSolution,
} from '../types/solution'
import {
  DEVOPS_PANEL_ENABLED,
  devOpsWorkItemUrl,
  makerSolutionUrl,
} from '../config'
import { formatDateTime, groupBy } from '../utils/format'
import { KindBadge } from './KindBadge'

interface Props {
  solution: WorkingSolution
  environmentId: string | null
  components: SolutionComponentInfo[]
  loadingComponents: boolean
  onRefreshComponents: () => void
  /** Resolved work item for solution.devOpsId, or null when unavailable. */
  workItem: WorkItemInfo | null
  workItemLoading: boolean
  /** Collision-radar findings for this solution (null = not scanned). */
  collisions?: ComponentCollision[] | null
}

/** Groups with at most this many components start expanded. */
const AUTO_EXPAND_LIMIT = 8

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

export function SolutionDetail({
  solution,
  environmentId,
  components,
  loadingComponents,
  onRefreshComponents,
  workItem,
  workItemLoading,
  collisions,
}: Props) {
  const adoUrl = workItem?.url ?? devOpsWorkItemUrl(solution.devOpsId)
  const grouped = [...groupBy(components, (c) => c.typeName).entries()].sort(
    (a, b) => a[0].localeCompare(b[0]),
  )

  // User toggles per type group; groups without an override fall back to the
  // size-based default. The parent remounts this component per solution
  // (key={solution.id}), so state resets when another solution is opened.
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>({})
  const isExpanded = (typeName: string, count: number) =>
    groupOverrides[typeName] ?? count <= AUTO_EXPAND_LIMIT
  const toggleGroup = (typeName: string, count: number) =>
    setGroupOverrides((prev) => ({
      ...prev,
      [typeName]: !isExpanded(typeName, count),
    }))

  return (
    <aside className="card detail">
      <div className="detail-header">
        <div>
          <KindBadge kind={solution.kind} />
          <h2 className="detail-title">{solution.title}</h2>
          <code className="detail-uniquename">{solution.uniqueName}</code>
        </div>
      </div>

      {solution.description && (
        <p className="detail-description">{solution.description}</p>
      )}

      <div className="detail-actions">
        {solution.solutionMissing ? (
          <span
            className="btn btn--primary btn--disabled"
            title="No Dataverse solution matches this record's unique solution name."
          >
            Open in Maker Portal
          </span>
        ) : (
          <a
            className="btn btn--primary"
            href={makerSolutionUrl(environmentId, solution.id)}
            target="_blank"
            rel="noreferrer"
          >
            Open in Maker Portal ↗
          </a>
        )}
      </div>

      {solution.solutionMissing && (
        <div className="state state--error">
          The linked solution (<code>{solution.uniqueName || '—'}</code>) was
          not found in this environment — it may have been deleted or renamed.
        </div>
      )}

      {DEVOPS_PANEL_ENABLED && solution.devOpsId && (
        <div className="devops-card">
          <div className="devops-card-header">
            <span className="devops-card-title">
              Azure DevOps #{solution.devOpsId}
            </span>
            {adoUrl ? (
              <a
                className="btn btn--small"
                href={adoUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open ↗
              </a>
            ) : (
              <span
                className="btn btn--small btn--disabled"
                title="Set VITE_ADO_ORG_URL and VITE_ADO_PROJECT in .env.local to enable work item links."
              >
                Open
              </span>
            )}
          </div>
          {workItemLoading && (
            <div className="devops-card-body muted">Loading work item…</div>
          )}
          {!workItemLoading && workItem && (
            <div className="devops-card-body">
              <span className={`wi-state wi-state--${stateBucket(workItem.state)}`}>
                {workItem.state}
              </span>
              <span className="wi-title" title={workItem.title}>
                <span className="wi-type muted">{workItem.type}</span>{' '}
                {workItem.title}
              </span>
              <span className="wi-assignee">
                {workItem.assignedTo ?? 'Unassigned'}
              </span>
            </div>
          )}
          {!workItemLoading && !workItem && (
            <div className="devops-card-body muted">
              Work item details unavailable — connect Azure DevOps (see
              README) or check the number.
            </div>
          )}
        </div>
      )}

      <dl className="detail-meta">
        <div>
          <dt>Version</dt>
          <dd>{solution.version || '—'}</dd>
        </div>
        <div>
          <dt>Publisher</dt>
          <dd>{solution.publisher?.friendlyName || '—'}</dd>
        </div>
        {solution.owner && (
          <div>
            <dt>Owner</dt>
            <dd>{solution.owner}</dd>
          </div>
        )}
        {solution.deploymentStatus && (
          <div>
            <dt>Deployment status</dt>
            <dd>{solution.deploymentStatus}</dd>
          </div>
        )}
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(solution.createdOn)}</dd>
        </div>
        <div>
          <dt>Modified</dt>
          <dd>{formatDateTime(solution.modifiedOn)}</dd>
        </div>
      </dl>

      {!!collisions?.length && (
        <section className="collision-card">
          <h3 className="collision-card-title">
            ⚠ Shared with other working solutions ({collisions.length})
          </h3>
          <ul className="collision-list">
            {collisions.map((c) => (
              <li key={c.component.objectId} title={c.component.objectId}>
                <span className="collision-component">
                  <span className="merge-plan-type">{c.component.typeName}</span>{' '}
                  {c.component.displayName}
                </span>
                <span className="collision-others muted">
                  also in: {c.otherSolutions.map((o) => o.title).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!solution.solutionMissing && (
        <div className="detail-components-header">
          <h3 className="card-title">
            Components{!loadingComponents && ` (${components.length})`}
          </h3>
          <button className="btn btn--small" onClick={onRefreshComponents}>
            Refresh
          </button>
        </div>
      )}

      {!solution.solutionMissing && loadingComponents && (
        <div className="state">Loading components…</div>
      )}

      {!solution.solutionMissing &&
        !loadingComponents &&
        components.length === 0 && (
          <div className="state">
            No components yet — add tables, forms or flows to this solution in
            the maker portal and refresh.
          </div>
        )}

      {!solution.solutionMissing &&
        !loadingComponents &&
        grouped.map(([typeName, items]) => {
          const expanded = isExpanded(typeName, items.length)
          return (
            <section key={typeName} className="component-group">
              <button
                className="component-group-toggle"
                onClick={() => toggleGroup(typeName, items.length)}
                aria-expanded={expanded}
              >
                <span
                  className={`component-group-chevron ${
                    expanded ? 'component-group-chevron--open' : ''
                  }`}
                >
                  ▸
                </span>
                <span className="component-group-title">{typeName}</span>
                <span className="muted">({items.length})</span>
              </button>
              {expanded && (
                <ul className="component-list">
                  {items.map((c) => (
                    <li key={c.id} title={c.schemaName ?? c.objectId}>
                      <span className="component-name">{c.displayName}</span>
                      {c.parentTable && (
                        <span className="component-parent muted">
                          {c.parentTable}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
    </aside>
  )
}
