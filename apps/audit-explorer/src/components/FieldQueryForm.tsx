import { useCallback, useEffect, useState } from 'react'
import type { AuditedTable, ColumnAudit, TableAudit } from '../types/audit'
import { auditService } from '../services/auditService'
import { QUERY_RANGES } from '../utils/format'

interface FieldQueryFormProps {
  onSubmit: (
    table: AuditedTable,
    attribute: string | undefined,
    sinceDays: number,
  ) => void
}

/** Window used to populate the pickers — kept small; it is a scan. */
const PICKER_WINDOW_DAYS = 30

/**
 * Field mode's input: table, then column, then window.
 *
 * The column picker comes from **entity metadata**, which knows display names
 * and which columns are audited at all — including ones that simply have not
 * changed yet, and which reading the log could therefore never reveal. Where
 * the runtime withholds metadata it falls back to the columns seen changing.
 *
 * The table list still comes from the log: it names the tables with actual
 * activity, which is the useful shortlist to choose from.
 */
export function FieldQueryForm({ onSubmit }: FieldQueryFormProps) {
  const [tables, setTables] = useState<AuditedTable[]>([])
  const [table, setTable] = useState<string>('')
  const [attributes, setAttributes] = useState<ColumnAudit[]>([])
  const [tableAudit, setTableAudit] = useState<TableAudit | null>(null)
  const [attribute, setAttribute] = useState<string>('')
  const [sinceDays, setSinceDays] = useState<number>(30)
  const [loadingTables, setLoadingTables] = useState(true)
  const [loadingAttrs, setLoadingAttrs] = useState(false)

  const loadTables = useCallback(async () => {
    setLoadingTables(true)
    try {
      setTables(await auditService.listTables(PICKER_WINDOW_DAYS))
    } finally {
      setLoadingTables(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTables()
  }, [loadTables])

  const loadAttributes = useCallback(async () => {
    if (!table) {
      setAttributes([])
      setTableAudit(null)
      return
    }
    setLoadingAttrs(true)
    try {
      // Metadata is the better source: it carries display names and knows
      // which columns are audited at all — including ones that simply have not
      // changed yet, which the log can never reveal.
      const info = await auditService.getTableAudit(table)
      setTableAudit(info)
      if (info) {
        setAttributes(info.columns.filter((c) => c.auditEnabled))
        return
      }
      // No metadata: fall back to the columns seen changing in the log.
      const seen = await auditService.listAttributes(table, PICKER_WINDOW_DAYS)
      setAttributes(
        seen.map((logicalName) => ({
          logicalName,
          displayName: logicalName,
          auditEnabled: true,
        })),
      )
    } finally {
      setLoadingAttrs(false)
    }
  }, [table])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAttributes()
  }, [loadAttributes])

  const selectedTable = tables.find((t) => t.logicalName === table)

  return (
    <form
      className="query-bar"
      onSubmit={(e) => {
        e.preventDefault()
        if (selectedTable) {
          onSubmit(selectedTable, attribute || undefined, sinceDays)
        }
      }}
    >
      <label className="query-field">
        <span className="query-label">Table</span>
        <select
          className="query-input"
          value={table}
          onChange={(e) => {
            setTable(e.target.value)
            setAttribute('')
          }}
        >
          <option value="">
            {loadingTables ? 'Loading…' : 'Select a table'}
          </option>
          {tables.map((t) => (
            <option key={t.logicalName} value={t.logicalName}>
              {t.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="query-field">
        <span className="query-label">Column</span>
        {attributes.length > 0 || loadingAttrs ? (
          <select
            className="query-input"
            value={attribute}
            onChange={(e) => setAttribute(e.target.value)}
            disabled={!table || loadingAttrs}
          >
            <option value="">
              {loadingAttrs ? 'Loading…' : 'Any column'}
            </option>
            {attributes.map((a) => (
              <option key={a.logicalName} value={a.logicalName}>
                {a.displayName}
              </option>
            ))}
          </select>
        ) : (
          // No inline change payload available: fall back to free text so the
          // mode stays usable rather than silently offering nothing.
          <input
            className="query-input"
            value={attribute}
            onChange={(e) => setAttribute(e.target.value)}
            placeholder="Column logical name (optional)"
            disabled={!table}
            spellCheck={false}
          />
        )}
      </label>

      <div className="query-field">
        <span className="query-label">Window</span>
        <div className="chips">
          {QUERY_RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              className={`chip ${sinceDays === r.days ? 'chip--active' : ''}`}
              onClick={() => setSinceDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <button className="query-submit" type="submit" disabled={!selectedTable}>
        Search
      </button>
      {!loadingTables && tables.length === 0 && (
        <span className="query-hint">
          No audited activity in the last {PICKER_WINDOW_DAYS} days.
        </span>
      )}
      {tableAudit && !tableAudit.auditEnabled && (
        <span className="query-hint">
          Auditing is switched off for {tableAudit.displayName} — this table
          cannot return any changes.
        </span>
      )}
      {tableAudit?.auditEnabled && attributes.length === 0 && !loadingAttrs && (
        <span className="query-hint">
          {tableAudit.displayName} is audited, but no individual column is —
          only record-level events are recorded.
        </span>
      )}
    </form>
  )
}
