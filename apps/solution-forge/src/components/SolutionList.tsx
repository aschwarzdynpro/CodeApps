import type { WorkingSolution } from '../types/solution'
import { formatRelative } from '../utils/format'
import { KindBadge } from './KindBadge'

interface Props {
  solutions: WorkingSolution[]
  activeId: string | null
  onOpen: (id: string) => void
}

export function SolutionList({ solutions, activeId, onOpen }: Props) {
  if (solutions.length === 0) {
    return (
      <div className="card solution-list solution-list--empty">
        No solutions match the current filter.
      </div>
    )
  }
  return (
    <div className="card solution-list">
      {solutions.map((s) => (
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
          </span>
          <span className="solution-row-when">{formatRelative(s.modifiedOn)}</span>
        </button>
      ))}
    </div>
  )
}
