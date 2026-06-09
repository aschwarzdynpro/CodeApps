import { useMemo } from 'react'
import type { AuditedTable } from '../types/audit'

interface AuditedTablesListProps {
  tables: AuditedTable[]
  /** Event counts per table logical name (within the current date/op/search filters). */
  counts: Record<string, number>
  /** Logical name of the table the dashboard is filtered to, if any. */
  activeTable: string | null
  onSelect: (logicalName: string) => void
  onClear: () => void
}

export function AuditedTablesList({
  tables,
  counts,
  activeTable,
  onSelect,
  onClear,
}: AuditedTablesListProps) {
  const sorted = useMemo(
    () =>
      [...tables].sort(
        (a, b) =>
          (counts[b.logicalName] ?? 0) - (counts[a.logicalName] ?? 0) ||
          a.displayName.localeCompare(b.displayName),
      ),
    [tables, counts],
  )

  return (
    <aside className="card audited">
      <div className="audited-head">
        <h3 className="card-title">Audited tables</h3>
        {activeTable && (
          <button className="audited-clear" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <p className="audited-hint">
        Auditing enabled · click to filter the dashboard
      </p>
      <ul className="audited-list">
        {sorted.map((t) => {
          const count = counts[t.logicalName] ?? 0
          const active = activeTable === t.logicalName
          return (
            <li key={t.logicalName}>
              <button
                className={`audited-item ${active ? 'audited-item--active' : ''}`}
                onClick={() => onSelect(t.logicalName)}
                aria-pressed={active}
              >
                <span className="audited-dot" />
                <span className="audited-name">{t.displayName}</span>
                <span className={`audited-count ${count === 0 ? 'audited-count--zero' : ''}`}>
                  {count}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
