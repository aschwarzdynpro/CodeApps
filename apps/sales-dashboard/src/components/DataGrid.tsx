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
  /** Deep-Link in den Datensatz (neuer Tab); undefined → keine Icon-Spalte. */
  recordHref?: (row: T) => string | undefined
  /** Klick auf eine Zeile (öffnet das Detail-Modal); undefined → nicht klickbar. */
  onRowClick?: (row: T) => void
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

export function DataGrid<T>({
  columns,
  rows,
  rowId,
  recordHref,
  onRowClick,
  emptyText,
}: DataGridProps<T>) {
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
            {recordHref && <th className="grid__open-th" aria-label="Datensatz öffnen" />}
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
            <tr
              key={rowId(row)}
              className={onRowClick ? 'is-clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
            >
              {recordHref && (
                <td
                  className="grid__open-td"
                  onClick={(e) => e.stopPropagation()}
                >
                  <OpenRecordLink href={recordHref(row)} />
                </td>
              )}
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

function OpenRecordLink({ href }: { href: string | undefined }) {
  if (!href) return null
  return (
    <a
      className="grid__open"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title="Datensatz in neuem Tab öffnen"
      aria-label="Datensatz in neuem Tab öffnen"
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
      </svg>
    </a>
  )
}

export function GridCell<T>({ column, row }: { column: ColumnDef<T>; row: T }) {
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
