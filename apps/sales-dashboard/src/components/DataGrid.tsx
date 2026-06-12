import { useMemo, useState } from 'react'
import type { ColumnDef } from '../dashboard/types'
import { fmtDate, fmtEur, fmtNumber } from '../utils/format'

/**
 * Sortierbares, kompaktes Daten-Grid — ersetzt die Listenansicht der
 * Legacy-Dashboard-Komponenten. Spaltenköpfe sortieren (Klick), die
 * Standardsortierung kommt aus der gewählten Ansicht.
 */

interface DataGridProps<T> {
  columns: ColumnDef<T>[]
  rows: T[]
  rowId: (row: T) => string
  emptyText: string
}

interface SortState {
  key: string
  dir: 1 | -1
}

function compareValues(
  a: string | number | undefined,
  b: string | number | undefined,
): number {
  if (a === undefined && b === undefined) return 0
  if (a === undefined) return 1
  if (b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'de')
}

export function DataGrid<T>({ columns, rows, rowId, emptyText }: DataGridProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    return [...rows].sort((a, b) => sort.dir * compareValues(col.value(a), col.value(b)))
  }, [rows, columns, sort])

  const toggleSort = (key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === 1
          ? { key, dir: -1 }
          : null
        : { key, dir: 1 },
    )
  }

  if (rows.length === 0) {
    return <p className="grid-empty">{emptyText}</p>
  }

  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={col.kind === 'currency' || col.kind === 'number' ? 'is-num' : undefined}
              >
                <button type="button" onClick={() => toggleSort(col.key)}>
                  {col.label}
                  {sort?.key === col.key && (
                    <span className="grid__sort">{sort.dir === 1 ? '▲' : '▼'}</span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowId(row)}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={col.kind === 'currency' || col.kind === 'number' ? 'is-num' : undefined}
                >
                  <GridCell column={col} row={row} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GridCell<T>({ column, row }: { column: ColumnDef<T>; row: T }) {
  const value = column.value(row)
  switch (column.kind) {
    case 'currency':
      return <>{typeof value === 'number' ? fmtEur(value) : '–'}</>
    case 'number':
      return <>{typeof value === 'number' ? fmtNumber(value) : (value ?? '–')}</>
    case 'date':
      return <>{fmtDate(typeof value === 'string' ? value : undefined)}</>
    case 'badge': {
      if (value === undefined || value === '') return <>–</>
      const toneName = column.tone?.(row) ?? 'gray'
      return <span className={`badge badge--${toneName}`}>{value}</span>
    }
    default:
      return <>{value === undefined || value === '' ? '–' : value}</>
  }
}
