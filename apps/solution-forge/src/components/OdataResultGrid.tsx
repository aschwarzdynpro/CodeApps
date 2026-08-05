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
 * Lookup cells carry their target table (from the `lookuplogicalname`
 * annotation) and are clickable chips that open that record; clicking anywhere
 * else on a row opens the row's own record. The chip stops propagation so the
 * two never fire together.
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
  /** `additive` (shift-click) appends to `$orderby` instead of replacing it. */
  onSort: (key: string, additive: boolean) => void
  /** Primary id column of the table — needed to address a row. */
  primaryIdAttribute: string
  /** Open the row's own record. */
  onOpenRecord: (recordId: string) => void
  /** Follow a lookup cell into the record it points at. */
  onOpenLookup: (targetLogicalName: string, recordId: string) => void
  /**
   * Columns that may be dropped from `$select` straight from their header.
   * Absent or empty when that would be a lie: a query without `$select` lets
   * the server choose the columns (removing one would have to invent a
   * `$select` covering all the others), and dropping the last remaining column
   * would empty `$select` — which means "every column", the opposite of what
   * the click asked for.
   */
  removableKeys?: ReadonlySet<string>
  onRemoveColumn?: (key: string) => void
}

export function OdataResultGrid({
  rows,
  keys,
  metaByKey,
  formatted,
  orderBy,
  onSort,
  primaryIdAttribute,
  onOpenRecord,
  onOpenLookup,
  removableKeys,
  onRemoveColumn,
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
                      onClick={(e) => onSort(key, e.shiftKey)}
                      title={`${meta?.displayName ?? key} (${key})${
                        meta ? ` · ${meta.kind}` : ''
                      } — click to sort, shift-click to add to the sort`}
                    >
                      <span className="odb-th-label">
                        {meta?.displayName ?? key}
                      </span>
                      <span className="odb-th-sort">
                        {sort
                          ? `${sort.desc ? '▼' : '▲'}${
                              orderBy.length > 1
                                ? String(orderBy.indexOf(sort) + 1)
                                : ''
                            }`
                          : ''}
                      </span>
                    </button>
                    {onRemoveColumn && removableKeys?.has(key) && (
                      <button
                        className="odb-th-drop"
                        // Sits beside the sort button rather than inside it —
                        // a nested button would be invalid markup and the
                        // click would sort on its way out.
                        onClick={() => onRemoveColumn(key)}
                        title={`Remove ${meta?.displayName ?? key} from $select`}
                        aria-label={`Remove column ${meta?.displayName ?? key} from the query`}
                      >
                        ✕
                      </button>
                    )}
                    <code className="odb-th-logical">{key}</code>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const id = row[primaryIdAttribute]
              const openable = typeof id === 'string' && id !== ''
              return (
              <tr
                key={rowKey(row, index)}
                className={openable ? 'odb-row' : undefined}
                onClick={openable ? () => onOpenRecord(id) : undefined}
                title={openable ? 'Open this record' : undefined}
              >
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
                  if (target) {
                    const targetId = rawText(cell.raw)
                    return (
                      <td key={key} className="odb-cell">
                        <button
                          className="odb-lookup odb-lookup--link"
                          title={`Open this ${target} record`}
                          // The row itself opens the *row's* record — a lookup
                          // cell must not trigger both.
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenLookup(target, targetId)
                          }}
                        >
                          <span className="odb-lookup-name">{text}</span>
                          <code className="odb-lookup-target">{target}</code>
                        </button>
                      </td>
                    )
                  }
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
              )
            })}
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
