import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ColumnMeta,
  EntityMeta,
  EntityRef,
  ODataQuery,
  OdataRow,
} from '../types/odataBrowser'
import { odataBrowserService } from '../services/odataBrowserService'
import { OdataQueryError } from '../utils/odataErrors'
import { dataKeys } from '../utils/odataFormat'
import {
  MAX_TOP,
  PAGE_SIZE_OPTIONS,
  clampTop,
  defaultSelect,
  emptyQuery,
  toQueryPath,
  toWebApiUrl,
} from '../utils/odataQuery'
import { orgUrlForEnvKey } from '../config'
import { OperateEnvPicker } from './OperateEnvPicker'
import { SearchSelect, type SearchSelectOption } from './SearchSelect'
import { OdataResultGrid } from './OdataResultGrid'

/**
 * OData Browser (P1) — browse the Dataverse Web API of any configured
 * environment: pick a table, pick columns, run, read the grid.
 *
 * Everything goes through the Dataverse connector, so **every query runs as
 * the connection's service principal**, not as the signed-in user. That is
 * what the banner says out loud and why the whole menu item is
 * deployment-manager gated — results deliberately ignore the viewer's own
 * row-level and field-level security.
 *
 * What is not here yet, by plan (`docs/odata-browser-plan.md`): the filter
 * builder and the editable raw query line (P2), IntelliSense (P3) and the
 * record view with lookup drill-through (P4). The query preview below is
 * generated and read-only until P2 makes it editable in both directions.
 */
interface Props {
  envKey: string
  onEnvChange: (envKey: string) => void
}

export function OdataBrowserWorkspace({ envKey, onEnvChange }: Props) {
  const [entities, setEntities] = useState<EntityRef[]>([])
  const [entitiesLoading, setEntitiesLoading] = useState(false)
  const [showSystemTables, setShowSystemTables] = useState(false)

  const [table, setTable] = useState('')
  const [meta, setMeta] = useState<EntityMeta | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)

  const [query, setQuery] = useState<ODataQuery>(() => emptyQuery())
  const [rows, setRows] = useState<OdataRow[] | null>(null)
  const [skipToken, setSkipToken] = useState<string | null>(null)
  const [durationMs, setDurationMs] = useState(0)
  const [running, setRunning] = useState(false)
  /**
   * The query the rows on screen actually came from. Editing the column
   * selection afterwards would otherwise silently add empty columns to a stale
   * result — the footer says "re-run" instead of pretending.
   */
  const [ranQuery, setRanQuery] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [formatted, setFormatted] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [copied, setCopied] = useState(false)

  /**
   * Two independent sequence guards, so a late response can never overwrite
   * newer state: `metaSeq` for the table/metadata load, `runSeq` for query
   * execution. They must not share a counter — running a query would then
   * discard the metadata response that is still in flight, leaving the column
   * picker permanently empty.
   */
  const metaSeq = useRef(0)
  const runSeq = useRef(0)

  const fail = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : String(err))
    setHint(err instanceof OdataQueryError ? err.hint : null)
  }, [])

  // --- metadata ------------------------------------------------------------

  const loadEntities = useCallback(async () => {
    setEntitiesLoading(true)
    setError(null)
    setHint(null)
    try {
      setEntities(await odataBrowserService.listEntities(envKey))
    } catch (err) {
      fail(err)
    } finally {
      setEntitiesLoading(false)
    }
  }, [envKey, fail])

  useEffect(() => {
    const t = window.setTimeout(() => void loadEntities(), 30)
    return () => window.clearTimeout(t)
  }, [loadEntities])

  const pickTable = (logicalName: string) => {
    const ref = entities.find((e) => e.logicalName === logicalName)
    if (!ref) return
    const seq = ++metaSeq.current
    // Any in-flight result belongs to the previous table — retire it.
    runSeq.current++
    setTable(logicalName)
    setMeta(null)
    setRows(null)
    setSkipToken(null)
    setError(null)
    setHint(null)
    setQuery(emptyQuery(ref.entitySet))
    setMetaLoading(true)
    odataBrowserService
      .getEntityMeta(envKey, logicalName)
      .then((loaded) => {
        if (seq !== metaSeq.current) return
        setMeta(loaded)
        setQuery((prev) => ({ ...prev, select: defaultSelect(loaded) }))
      })
      .catch((err: unknown) => {
        if (seq === metaSeq.current) fail(err)
      })
      .finally(() => {
        if (seq === metaSeq.current) setMetaLoading(false)
      })
  }

  const reloadMetadata = () => {
    odataBrowserService.refreshMetadata(envKey)
    setEntities([])
    setMeta(null)
    setTable('')
    setRows(null)
    void loadEntities()
  }

  // --- running -------------------------------------------------------------

  /**
   * Execute a query. The query is passed in rather than read from state so
   * that sorting can run the *new* query immediately without waiting for a
   * state round trip (and without a re-run effect, which would fight the
   * react-compiler rules).
   */
  const execute = useCallback(
    async (q: ODataQuery, token: string | null, append: boolean) => {
      if (!q.entitySet) return
      const seq = ++runSeq.current
      setRunning(true)
      setError(null)
      setHint(null)
      try {
        const result = await odataBrowserService.runQuery(envKey, q, token)
        if (seq !== runSeq.current) return
        setRows((prev) =>
          append && prev ? [...prev, ...result.rows] : result.rows,
        )
        setSkipToken(result.skipToken)
        setDurationMs(result.durationMs)
        setRanQuery(toQueryPath(q))
      } catch (err) {
        if (seq === runSeq.current) fail(err)
      } finally {
        if (seq === runSeq.current) setRunning(false)
      }
    },
    [envKey, fail],
  )

  /** Header click cycles asc → desc → unsorted; P1 sorts by one column. */
  const sortBy = (key: string) => {
    const current = query.orderBy.find((o) => o.column === key)
    const orderBy = !current
      ? [{ column: key, desc: false }]
      : !current.desc
        ? [{ column: key, desc: true }]
        : []
    const next = { ...query, orderBy }
    setQuery(next)
    if (rows !== null) void execute(next, null, false)
  }

  // --- derived -------------------------------------------------------------

  const entityOptions: SearchSelectOption[] = useMemo(
    () =>
      entities
        .filter((e) => showSystemTables || !e.isPrivate)
        .map((e) => ({
          id: e.logicalName,
          label: e.displayName,
          sub: e.entitySet,
          hint: e.isCustomEntity ? 'custom' : undefined,
        })),
    [entities, showSystemTables],
  )

  const metaByKey = useMemo(() => {
    const map = new Map<string, ColumnMeta>()
    for (const column of meta?.columns ?? [])
      if (column.selectable) map.set(column.selectName, column)
    return map
  }, [meta])

  const gridKeys = useMemo(() => {
    if (query.select.length > 0) return query.select
    return rows ? dataKeys(rows) : []
  }, [query.select, rows])

  const visibleColumns = useMemo(() => {
    const q = columnSearch.trim().toLowerCase()
    return (meta?.columns ?? []).filter(
      (c) =>
        !q ||
        c.displayName.toLowerCase().includes(q) ||
        c.logicalName.toLowerCase().includes(q),
    )
  }, [meta, columnSearch])

  const queryPath = toQueryPath(query)

  const toggleColumn = (column: ColumnMeta) => {
    if (!column.selectable) return
    setQuery((prev) => ({
      ...prev,
      select: prev.select.includes(column.selectName)
        ? prev.select.filter((s) => s !== column.selectName)
        : [...prev.select, column.selectName],
    }))
  }

  const copyUrl = () => {
    const url = toWebApiUrl(orgUrlForEnvKey(envKey), query)
    if (!url) return
    void navigator.clipboard?.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  // --- render --------------------------------------------------------------

  return (
    <div>
      <OperateEnvPicker envKey={envKey} onChange={onEnvChange} />

      <div className="odb-identity">
        <span className="odb-identity-icon" aria-hidden="true">
          🛡
        </span>
        <span>
          Queries run as the <strong>connector service principal</strong>, not
          as you — results ignore your personal row-level and field-level
          security. Read-only.
        </span>
      </div>

      <div className="card trace-toolbar odb-toolbar">
        <SearchSelect
          options={entityOptions}
          value={table}
          onChange={pickTable}
          placeholder={entitiesLoading ? 'Loading tables…' : 'Select a table…'}
          loading={entitiesLoading}
        />
        <label className="trace-check">
          <input
            type="checkbox"
            checked={showSystemTables}
            onChange={(e) => setShowSystemTables(e.target.checked)}
          />
          system tables
        </label>
        <label title="Optional hard ceiling ($top). Leave empty to page through the whole result with “Load more”.">
          Limit
          <input
            className="odb-top"
            type="number"
            min={1}
            max={MAX_TOP}
            placeholder="all"
            value={query.top ?? ''}
            onChange={(e) =>
              setQuery((prev) => ({
                ...prev,
                top:
                  e.target.value === ''
                    ? null
                    : clampTop(Number(e.target.value)),
              }))
            }
          />
        </label>
        <label title="Rows fetched per request (prefer: odata.maxpagesize).">
          Page
          <select
            value={query.pageSize}
            onChange={(e) =>
              setQuery((prev) => ({ ...prev, pageSize: Number(e.target.value) }))
            }
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span className="trace-toolbar-right">
          <button
            className="btn btn--small"
            onClick={reloadMetadata}
            disabled={entitiesLoading}
            title="Drop the cached metadata of this environment and read it again"
          >
            ⟳ Metadata
          </button>
          <button
            className="btn btn--primary btn--small"
            onClick={() => void execute(query, null, false)}
            disabled={!query.entitySet || running || metaLoading}
          >
            {running ? 'Running…' : '▶ Run'}
          </button>
        </span>
      </div>

      {table && (
        <div className="card odb-builder">
          <div className="odb-builder-row">
            <span className="odb-builder-label">Columns</span>
            <button
              className="btn btn--small"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={metaLoading || !meta}
            >
              {metaLoading
                ? 'Loading columns…'
                : `${query.select.length || 'all'} selected`}{' '}
              ▾
            </button>
            {query.select.length > 0 && (
              <span className="odb-chiplist">
                {query.select.map((name) => (
                  <button
                    key={name}
                    className="chip odb-chip"
                    title="Remove from $select"
                    onClick={() =>
                      setQuery((prev) => ({
                        ...prev,
                        select: prev.select.filter((s) => s !== name),
                      }))
                    }
                  >
                    {name} ✕
                  </button>
                ))}
              </span>
            )}
            {query.select.length === 0 && (
              <span className="muted">
                no <code>$select</code> — the server returns every column it
                wants to
              </span>
            )}
          </div>

          {pickerOpen && meta && (
            <div className="odb-picker">
              <div className="odb-picker-head">
                <input
                  className="search"
                  type="search"
                  autoFocus
                  placeholder="Filter columns…"
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                />
                <button
                  className="btn btn--small"
                  onClick={() =>
                    setQuery((prev) => ({
                      ...prev,
                      select: meta.columns
                        .filter((c) => c.selectable)
                        .map((c) => c.selectName),
                    }))
                  }
                >
                  All
                </button>
                <button
                  className="btn btn--small"
                  onClick={() => setQuery((prev) => ({ ...prev, select: [] }))}
                >
                  None
                </button>
                <button
                  className="btn btn--small"
                  onClick={() =>
                    setQuery((prev) => ({ ...prev, select: defaultSelect(meta) }))
                  }
                >
                  Default
                </button>
              </div>
              <ul className="odb-picker-list">
                {visibleColumns.map((column) => (
                  <li key={column.logicalName}>
                    <label
                      className={`odb-picker-item ${
                        column.selectable ? '' : 'odb-picker-item--off'
                      }`}
                      title={
                        column.unselectableReason ??
                        `${column.logicalName} · ${column.attributeType}`
                      }
                    >
                      <input
                        type="checkbox"
                        disabled={!column.selectable}
                        checked={
                          column.selectable &&
                          query.select.includes(column.selectName)
                        }
                        onChange={() => toggleColumn(column)}
                      />
                      <span className="odb-picker-name">
                        {column.displayName}
                      </span>
                      <code>{column.selectName || column.logicalName}</code>
                      <span className="muted odb-picker-kind">
                        {column.unselectableReason ?? column.kind}
                      </span>
                    </label>
                  </li>
                ))}
                {visibleColumns.length === 0 && (
                  <li className="sselect-empty">No column matches.</li>
                )}
              </ul>
            </div>
          )}

          <div className="odb-query">
            <code className="odb-query-text">{queryPath}</code>
            <span className="odb-query-actions">
              <button className="btn btn--small" onClick={copyUrl}>
                {copied ? '✓ Copied' : 'Copy URL'}
              </button>
            </span>
          </div>
          <div className="muted odb-query-note">
            Generated from the builder — editing it directly (and everything
            <code>$filter</code> needs) lands in the next step.
          </div>
        </div>
      )}

      {error && (
        <div className="state state--error odb-error">
          <div>{error}</div>
          {hint && <div className="odb-error-hint">💡 {hint}</div>}
        </div>
      )}

      {!table && !entitiesLoading && !error && (
        <div className="state">
          Pick a table to start browsing this environment.
        </div>
      )}

      {rows !== null && (
        <div className="card trace-list odb-result">
          <OdataResultGrid
            rows={rows}
            keys={gridKeys}
            metaByKey={metaByKey}
            formatted={formatted}
            orderBy={query.orderBy}
            onSort={sortBy}
          />
          <div className="odb-footer">
            <span className="muted">
              {rows.length} row{rows.length === 1 ? '' : 's'} · {durationMs} ms
              {skipToken ? ' · more available' : ''}
            </span>
            {ranQuery !== null && ranQuery !== queryPath && (
              <span className="odb-stale" title={`Shown: ${ranQuery}`}>
                ⚠ query changed — press Run
              </span>
            )}
            <label className="trace-check">
              <input
                type="checkbox"
                checked={formatted}
                onChange={(e) => setFormatted(e.target.checked)}
              />
              formatted values
            </label>
            <button
              className="btn btn--small"
              onClick={() => void execute(query, skipToken, true)}
              disabled={!skipToken || running}
            >
              {running ? 'Loading…' : 'Load more'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
