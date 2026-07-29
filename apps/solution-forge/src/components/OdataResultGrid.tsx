import { useState } from 'react'
import type { ColumnMeta, OdataRow, OrderBy } from '../types/odataBrowser'
import { cellValue, lookupTarget, rawText } from '../utils/odataFormat'

/**
 * Result grid of the OData Browser.
 *
 * Deliberately dumb: it renders the keys it is handed, prefers the
 * FormattedValue annotation over the raw value (toggleable), and lets a long
 * value be opened in an overlay instead of wrecking the row height. Sorting is
 * delegated upwards — `$orderby` belongs to the query, not to the grid.
 *
 * Lookup cells already carry their target table (from the
 * `lookuplogicalname` annotation) and are rendered as chips; making them
 * clickable is P4 (record view + drill-through).
 */

/** Longer cell values get truncated with an expander. */
const MAX_CELL_CHARS = 140

interface Props {
  rows: OdataRow[]
  /** Column keys in display order. */
  keys: string[]
  /** Column metadata keyed by the name used in `$select`. */
  metaByKey: Map<string, ColumnMeta>
  /** Show FormattedValue annotations instead of raw values. */
  formatted: boolean
  orderBy: OrderBy[]
  onSort: (key: string) => void
}

export function OdataResultGrid({
  rows,
  keys,
  metaByKey,
  formatted,
  orderBy,
  onSort,
}: Props) {
  const [detail, setDetail] = useState<{ title: string; value: string } | null>(
    null,
  )

  if (rows.length === 0)
    return <div className="state">No rows returned for this query.</div>

  const sortOf = (key: string) => orderBy.find((o) => o.column === key)

  return (
    <>
      <div className="odb-grid-scroll">
        <table className="ops-table odb-grid">
          <thead>
            <tr>
              {keys.map((key) => {
                const meta = metaByKey.get(key)
                const sort = sortOf(key)
                return (
                  <th key={key}>
                    <button
                      className="odb-th"
                      onClick={() => onSort(key)}
                      title={`${meta?.displayName ?? key} (${key})${
                        meta ? ` · ${meta.kind}` : ''
                      } — click to sort`}
                    >
                      <span className="odb-th-label">
                        {meta?.displayName ?? key}
                      </span>
                      <span className="odb-th-sort">
                        {sort ? (sort.desc ? '▼' : '▲') : ''}
                      </span>
                    </button>
                    <code className="odb-th-logical">{key}</code>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={rowKey(row, index)}>
                {keys.map((key) => {
                  const cell = cellValue(row, key)
                  const text = formatted ? cell.text : rawText(cell.raw)
                  const target = lookupTarget(row, key)
                  if (cell.empty)
                    return (
                      <td key={key} className="odb-cell odb-cell--empty">
                        —
                      </td>
                    )
                  if (target)
                    return (
                      <td key={key} className="odb-cell">
                        <span
                          className="odb-lookup"
                          title={`${target} · ${rawText(cell.raw)}`}
                        >
                          <span className="odb-lookup-name">{text}</span>
                          <code className="odb-lookup-target">{target}</code>
                        </span>
                      </td>
                    )
                  const long = text.length > MAX_CELL_CHARS
                  return (
                    <td
                      key={key}
                      className={`odb-cell ${cell.formatted && formatted ? '' : 'odb-cell--raw'}`}
                      title={cell.formatted ? rawText(cell.raw) : undefined}
                    >
                      {long ? (
                        <>
                          {text.slice(0, MAX_CELL_CHARS)}…{' '}
                          <button
                            className="odb-more"
                            onClick={() =>
                              setDetail({
                                title: metaByKey.get(key)?.displayName ?? key,
                                value: text,
                              })
                            }
                          >
                            show
                          </button>
                        </>
                      ) : (
                        text
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div
            className="modal card modal--wide odb-value-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>{detail.title}</h2>
              <button
                className="modal-close"
                onClick={() => setDetail(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <pre className="odb-value-pre">{detail.value}</pre>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * A stable React key per row. The primary id is not necessarily selected, so
 * fall back to the etag and finally to the index.
 */
function rowKey(row: OdataRow, index: number): string {
  const etag = row['@odata.etag']
  if (typeof etag === 'string' && etag !== '') return `${etag}#${index}`
  for (const [key, value] of Object.entries(row)) {
    if (key.endsWith('id') && typeof value === 'string' && value.length === 36)
      return value
  }
  return String(index)
}
