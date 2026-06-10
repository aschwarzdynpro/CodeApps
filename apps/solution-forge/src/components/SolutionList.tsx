import type { SolutionComponentInfo, WorkingSolution } from '../types/solution'
import { formatRelative } from '../utils/format'
import { KindBadge } from './KindBadge'

interface Props {
  solutions: WorkingSolution[]
  activeId: string | null
  onOpen: (id: string) => void
  /** Components that matched the active search, keyed by solution id. */
  componentMatches?: Map<string, SolutionComponentInfo[]>
}

const MAX_SHOWN_MATCHES = 2

export function SolutionList({
  solutions,
  activeId,
  onOpen,
  componentMatches,
}: Props) {
  if (solutions.length === 0) {
    return (
      <div className="card solution-list solution-list--empty">
        No solutions match the current filter.
      </div>
    )
  }
  return (
    <div className="card solution-list">
      {solutions.map((s) => {
        const hits = componentMatches?.get(s.id) ?? []
        return (
          <button
            key={s.id}
            className={`solution-row ${s.id === activeId ? 'solution-row--active' : ''}`}
            onClick={() => onOpen(s.id)}
          >
            <KindBadge kind={s.kind} />
            <span className="solution-row-main">
              <span className="solution-row-title">{s.title}</span>
              <span className="solution-row-meta">
                <code>{s.uniqueName}</code>
                {s.devOpsId && <span className="ado-chip">#{s.devOpsId}</span>}
                <span>v{s.version}</span>
              </span>
              {hits.length > 0 && (
                <span className="solution-row-hits">
                  {hits.slice(0, MAX_SHOWN_MATCHES).map((c) => (
                    <span key={c.id} className="hit-chip" title={c.typeName}>
                      {c.displayName}
                    </span>
                  ))}
                  {hits.length > MAX_SHOWN_MATCHES && (
                    <span className="hit-more">
                      +{hits.length - MAX_SHOWN_MATCHES} more
                    </span>
                  )}
                </span>
              )}
            </span>
            <span className="solution-row-when">{formatRelative(s.modifiedOn)}</span>
          </button>
        )
      })}
    </div>
  )
}
