import type { SolutionComponentInfo, WorkingSolution } from '../types/solution'
import { devOpsWorkItemUrl, makerSolutionUrl } from '../config'
import { formatDateTime, groupBy } from '../utils/format'
import { KindBadge } from './KindBadge'

interface Props {
  solution: WorkingSolution
  environmentId: string | null
  components: SolutionComponentInfo[]
  loadingComponents: boolean
  onRefreshComponents: () => void
}

export function SolutionDetail({
  solution,
  environmentId,
  components,
  loadingComponents,
  onRefreshComponents,
}: Props) {
  const adoUrl = devOpsWorkItemUrl(solution.devOpsId)
  const grouped = [...groupBy(components, (c) => c.typeName).entries()].sort(
    (a, b) => a[0].localeCompare(b[0]),
  )

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
        <a
          className="btn btn--primary"
          href={makerSolutionUrl(environmentId, solution.id)}
          target="_blank"
          rel="noreferrer"
        >
          Open in Maker Portal ↗
        </a>
        {solution.devOpsId &&
          (adoUrl ? (
            <a className="btn" href={adoUrl} target="_blank" rel="noreferrer">
              Azure DevOps #{solution.devOpsId} ↗
            </a>
          ) : (
            <span
              className="btn btn--disabled"
              title="Set VITE_ADO_ORG_URL and VITE_ADO_PROJECT in .env.local to enable work item links."
            >
              Azure DevOps #{solution.devOpsId}
            </span>
          ))}
      </div>

      <dl className="detail-meta">
        <div>
          <dt>Version</dt>
          <dd>{solution.version}</dd>
        </div>
        <div>
          <dt>Publisher</dt>
          <dd>{solution.publisher?.friendlyName || '—'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(solution.createdOn)}</dd>
        </div>
        <div>
          <dt>Modified</dt>
          <dd>{formatDateTime(solution.modifiedOn)}</dd>
        </div>
      </dl>

      <div className="detail-components-header">
        <h3 className="card-title">
          Components{!loadingComponents && ` (${components.length})`}
        </h3>
        <button className="btn btn--small" onClick={onRefreshComponents}>
          Refresh
        </button>
      </div>

      {loadingComponents && <div className="state">Loading components…</div>}

      {!loadingComponents && components.length === 0 && (
        <div className="state">
          No components yet — add tables, forms or flows to this solution in
          the maker portal and refresh.
        </div>
      )}

      {!loadingComponents &&
        grouped.map(([typeName, items]) => (
          <section key={typeName} className="component-group">
            <h4 className="component-group-title">
              {typeName} <span className="muted">({items.length})</span>
            </h4>
            <ul className="component-list">
              {items.map((c) => (
                <li key={c.id} title={c.objectId}>
                  {c.displayName}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </aside>
  )
}
