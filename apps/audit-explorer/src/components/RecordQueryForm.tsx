import { useCallback, useEffect, useState } from 'react'
import type { AuditedTable, RecordHit } from '../types/audit'
import { auditService } from '../services/auditService'
import { formatDateTime } from '../utils/format'
import { parseRecordRef, type RecordRef } from '../utils/recordRef'

interface RecordQueryFormProps {
  onSubmit: (ref: RecordRef) => void
  /** Fills the box when arriving from a deep link or another mode. */
  preset?: string
}

type Method = 'paste' | 'browse'

/** Window scanned by the quick-search. It is a scan, so keep it modest. */
const SEARCH_WINDOW_DAYS = 30

/**
 * Record mode's input, with two ways in.
 *
 * *Paste* is the fast path for support: the form URL is already on screen and
 * carries both id and table (see {@link parseRecordRef}).
 *
 * *Browse* is for everyone who does not have the record open — pick a table,
 * then search by name. It searches the audit log, not the table, because the
 * app only has data sources for `audit` and `systemuser`; a record with no
 * audit history would have nothing to show anyway.
 */
export function RecordQueryForm({ onSubmit, preset }: RecordQueryFormProps) {
  const [method, setMethod] = useState<Method>('paste')
  const [text, setText] = useState(preset ?? '')
  const parsed = parseRecordRef(text)
  const showHint = text.trim().length > 0 && !parsed

  const [tables, setTables] = useState<AuditedTable[]>([])
  const [table, setTable] = useState('')
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<RecordHit[]>([])
  const [loadingTables, setLoadingTables] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const loadTables = useCallback(async () => {
    if (method !== 'browse' || tables.length > 0) return
    setLoadingTables(true)
    try {
      setTables(await auditService.listTables(SEARCH_WINDOW_DAYS))
    } finally {
      setLoadingTables(false)
    }
  }, [method, tables.length])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTables()
  }, [loadTables])

  const runSearch = async () => {
    if (!table) return
    setSearching(true)
    setSearched(true)
    try {
      setHits(await auditService.findRecords(table, term, SEARCH_WINDOW_DAYS))
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="query-bar query-bar--stacked">
      <div className="method-switch">
        <button
          type="button"
          className={`method ${method === 'paste' ? 'method--active' : ''}`}
          onClick={() => setMethod('paste')}
        >
          Paste URL or GUID
        </button>
        <button
          type="button"
          className={`method ${method === 'browse' ? 'method--active' : ''}`}
          onClick={() => setMethod('browse')}
        >
          Search by table
        </button>
      </div>

      {method === 'paste' ? (
        <form
          className="query-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (parsed) onSubmit(parsed)
          }}
        >
          <label className="query-field query-field--wide">
            <span className="query-label">Record</span>
            <input
              className="query-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the form URL, or a record GUID"
              spellCheck={false}
            />
          </label>
          <button className="query-submit" type="submit" disabled={!parsed}>
            Search
          </button>
          {showHint && (
            <span className="query-hint">
              No record id found in that text — paste the address bar of the
              record form, or the GUID itself.
            </span>
          )}
          {parsed?.table && (
            <span className="query-note">Table: {parsed.table}</span>
          )}
        </form>
      ) : (
        <>
          <form
            className="query-row"
            onSubmit={(e) => {
              e.preventDefault()
              void runSearch()
            }}
          >
            <label className="query-field">
              <span className="query-label">Table</span>
              <select
                className="query-input"
                value={table}
                onChange={(e) => {
                  setTable(e.target.value)
                  setHits([])
                  setSearched(false)
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
            <label className="query-field query-field--wide">
              <span className="query-label">Name contains</span>
              <input
                className="query-input"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Leave empty to list recently changed records"
                spellCheck={false}
                disabled={!table}
              />
            </label>
            <button className="query-submit" type="submit" disabled={!table}>
              Find
            </button>
          </form>

          {searching && <div className="query-note">Searching…</div>}

          {!searching && searched && hits.length === 0 && (
            <div className="query-hint">
              No audited records of this table match — only records with audit
              history in the last {SEARCH_WINDOW_DAYS} days can be found here.
            </div>
          )}

          {!searching && hits.length > 0 && (
            <ul className="hit-list">
              {hits.map((hit) => (
                <li key={hit.recordId}>
                  <button
                    type="button"
                    onClick={() =>
                      onSubmit({ recordId: hit.recordId, table: hit.table })
                    }
                  >
                    <span className="hit-name">{hit.recordName}</span>
                    <span className="hit-meta">
                      {hit.count} change{hit.count === 1 ? '' : 's'} · last{' '}
                      {formatDateTime(hit.lastChange)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
