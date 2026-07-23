import { useEffect, useMemo, useState } from 'react'
import type {
  ColumnRef,
  OrphanHandling,
  PreviewResult,
  SavedViewRef,
  TableRef,
  TransferEntry,
  TransferEntryInput,
  TransferMatchMode,
  TransferQueryMode,
} from '../types/transferHub'
import { transferHubService } from '../services/transferHubService'
import { ENVIRONMENTS } from '../config'
import {
  MAX_MATCH_COLUMNS,
  describeEntryValidation,
  fetchXmlAttributes,
  formatFetchXml,
  parseFetchXml,
  setAttributes,
} from '../utils/transferConfig'
import { SearchSelect } from './SearchSelect'
import { formattedValue } from '../services/currentEnvQuery'

interface Props {
  packageId: string
  /** Existing entry to edit, or null for a new one. */
  entry: TransferEntry | null
  /** True while a run is queued/running — viewing stays open, saving is blocked. */
  locked?: boolean
  /** Suggested pro_order_int for a new entry (last + 1). */
  defaultOrder: number
  onSave: (input: TransferEntryInput) => Promise<void>
  onClose: () => void
}

const ORPHAN_OPTIONS: { value: OrphanHandling; label: string; hint: string }[] = [
  { value: 'ignore', label: 'Ignore', hint: 'Leave target records untouched' },
  { value: 'deactivate', label: 'Deactivate', hint: 'Set orphaned target records inactive' },
  { value: 'delete', label: 'Delete', hint: 'Remove orphaned target records' },
]

/**
 * Wide modal editing ONE transfer entry: source environment → source table →
 * query (saved view or FetchXML) → preview → match mode → orphan handling.
 * On save in view mode the view's FetchXML is resolved and stored as the
 * executable snapshot (the pipeline never reads savedquery itself).
 * Mount with `key={entry?.id ?? 'new'}` — state seeds once from the entry.
 */
export function TransferEntryDialog({
  packageId,
  entry,
  locked = false,
  defaultOrder,
  onSave,
  onClose,
}: Props) {
  const [order, setOrder] = useState(String(entry?.order ?? defaultOrder))
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [envKey, setEnvKey] = useState(entry?.sourceEnvKey ?? '')
  const [table, setTable] = useState(entry?.tableLogicalName ?? '')
  const [queryMode, setQueryMode] = useState<TransferQueryMode>(entry?.queryMode ?? 'view')
  const [viewId, setViewId] = useState(entry?.viewId ?? '')
  // Stored snapshots are one-liners — pretty-print for the editing surface.
  const [fetchXml, setFetchXml] = useState(() =>
    entry?.fetchXml ? formatFetchXml(entry.fetchXml) : '',
  )
  const [matchMode, setMatchMode] = useState<TransferMatchMode>(entry?.matchMode ?? 'guid')
  const [matchColumns, setMatchColumns] = useState<Set<string>>(
    () => new Set(entry?.matchColumns ?? []),
  )
  const [orphan, setOrphan] = useState<OrphanHandling>(entry?.orphanHandling ?? 'ignore')

  // Source-environment lookups.
  const [tables, setTables] = useState<TableRef[] | null>(null)
  const [views, setViews] = useState<SavedViewRef[] | null>(null)
  const [columns, setColumns] = useState<ColumnRef[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // FetchXML tooling.
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [pickedColumns, setPickedColumns] = useState<Set<string>>(new Set())
  const [columnSearch, setColumnSearch] = useState('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Table list per chosen source environment. No synchronous setState in the
  // effects — the pick handlers do the resets (React-Compiler rule); state
  // starts at null on mount, so the initial load needs none.
  useEffect(() => {
    if (!envKey) return
    let alive = true
    transferHubService
      .listTables(envKey)
      .then((t) => {
        if (alive) setTables(t)
      })
      .catch((err) => {
        if (alive) {
          setTables([])
          setLoadError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      alive = false
    }
  }, [envKey])

  // Views + columns per chosen table.
  useEffect(() => {
    if (!envKey || !table) return
    let alive = true
    transferHubService
      .listViews(envKey, table)
      .then((v) => {
        if (alive) setViews(v)
      })
      .catch((err) => {
        if (alive) {
          setViews([])
          setLoadError(err instanceof Error ? err.message : String(err))
        }
      })
    transferHubService
      .listColumns(envKey, table)
      .then((c) => {
        if (alive) setColumns(c)
      })
      .catch(() => {
        if (alive) setColumns([])
      })
    return () => {
      alive = false
    }
  }, [envKey, table])

  const tableRef = useMemo(
    () => tables?.find((t) => t.logicalName === table) ?? null,
    [tables, table],
  )
  // When editing, the snapshots on the entry stand in until the list loads.
  const tableDisplayName = tableRef?.displayName ?? entry?.tableDisplayName ?? table
  const entitySet = tableRef?.entitySet ?? entry?.entitySet ?? ''
  const primaryIdAttribute = tableRef?.primaryIdAttribute ?? entry?.primaryIdAttribute ?? ''

  const pickEnv = (key: string) => {
    if (key === envKey) return
    setEnvKey(key)
    setTable('')
    setViewId('')
    setTables(null)
    setViews(null)
    setColumns(null)
    setPreview(null)
    setPreviewError(null)
    setLoadError(null)
  }

  const pickTable = (logicalName: string) => {
    if (logicalName === table) return
    setTable(logicalName)
    setViewId('')
    setViews(null)
    setColumns(null)
    setPreview(null)
    setPreviewError(null)
    setLoadError(null)
  }

  /**
   * Mode toggle. Switching to FetchXML with a view picked and an empty
   * textarea seeds the textarea with that view's FetchXML — a convenient
   * starting point for hand-tuning. Hand-written XML is never overwritten
   * (functional set guards against the async race).
   */
  const switchMode = (mode: TransferQueryMode) => {
    setQueryMode(mode)
    if (mode === 'fetchxml' && viewId && !fetchXml.trim()) {
      transferHubService
        .getViewFetchXml(envKey, viewId)
        .then((view) =>
          setFetchXml((prev) => (prev.trim() ? prev : formatFetchXml(view.fetchXml))),
        )
        .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
    }
  }

  const parsed = useMemo(() => parseFetchXml(fetchXml), [fetchXml])

  const draft = {
    sourceEnvKey: envKey,
    tableLogicalName: table,
    queryMode,
    viewId,
    fetchXml,
    matchMode,
    matchColumns: [...matchColumns],
  }
  const blockers = describeEntryValidation(draft)
  const orderNum = Number(order)
  const canSubmit =
    !submitting && !locked && blockers.length === 0 && Number.isFinite(orderNum) && orderNum >= 0

  const toggleMatchColumn = (col: string) => {
    setMatchColumns((prev) => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col)
      else next.add(col)
      return next
    })
  }

  const openColumnPicker = () => {
    setPickedColumns(new Set(fetchXmlAttributes(fetchXml)))
    setColumnSearch('')
    setShowColumnPicker(true)
  }
  const applyColumnPicker = () => {
    setFetchXml(formatFetchXml(setAttributes(fetchXml, [...pickedColumns])))
    setShowColumnPicker(false)
  }
  /** Picker list: alphabetical by display name, narrowed by the search box. */
  const visibleColumns = useMemo(() => {
    const sorted = [...(columns ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName))
    const q = columnSearch.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) || c.logicalName.toLowerCase().includes(q),
    )
  }, [columns, columnSearch])

  const runPreview = async () => {
    setPreviewBusy(true)
    setPreview(null)
    setPreviewError(null)
    try {
      // View mode previews the view's CURRENT FetchXML (what save would snapshot).
      const xml =
        queryMode === 'view'
          ? (await transferHubService.getViewFetchXml(envKey, viewId)).fetchXml
          : fetchXml
      setPreview(await transferHubService.preview(envKey, table, xml))
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err))
    } finally {
      setPreviewBusy(false)
    }
  }
  const canPreview =
    !previewBusy &&
    !!envKey &&
    !!table &&
    (queryMode === 'view' ? !!viewId : parsed.ok)

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      let xml = fetchXml
      let viewName = ''
      let snapshotAt = entry?.viewSnapshotAt ?? ''
      if (queryMode === 'view') {
        // Snapshot + reference: resolve the view NOW so the stored config is
        // self-contained for the pipeline.
        const view = await transferHubService.getViewFetchXml(envKey, viewId)
        xml = view.fetchXml
        viewName = view.name
        snapshotAt = new Date().toISOString()
      }
      await onSave({
        packageId,
        // The entry has no user-facing name — the table identifies it.
        name: tableDisplayName || table,
        sourceEnvKey: envKey,
        tableLogicalName: table,
        tableDisplayName,
        entitySet,
        primaryIdAttribute,
        queryMode,
        viewId: queryMode === 'view' ? viewId : '',
        viewName: queryMode === 'view' ? viewName : '',
        viewSnapshotAt: queryMode === 'view' ? snapshotAt : '',
        fetchXml: xml,
        matchMode,
        matchColumns: matchMode === 'columns' ? [...matchColumns] : [],
        orphanHandling: orphan,
        order: orderNum,
        notes: notes.trim(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  // Column options for match mode: metadata list, else the parsed attributes.
  const matchColumnOptions = useMemo(() => {
    const fromMeta = (columns ?? []).map((c) => c.logicalName)
    const fromXml = parsed.ok ? parsed.attributes : []
    const all = [...new Set([...fromMeta, ...fromXml])].sort()
    return all
  }, [columns, parsed])

  const columnLabel = (logicalName: string) =>
    columns?.find((c) => c.logicalName === logicalName)?.displayName ?? logicalName

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card modal--wide thub-entry-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{entry ? 'Edit Transfer Entry' : 'New Transfer Entry'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <label className="form-row thub-order">
          <span className="form-label">Order (in package)</span>
          <input
            type="number"
            min={0}
            max={10000}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            title="Entries run in ascending order — parents before children resolves lookups."
          />
        </label>

        <div className="form-row">
          <span className="form-label">Source environment</span>
          <div className="chips">
            {ENVIRONMENTS.map((env) => (
              <button
                key={env.key}
                className={`chip ${envKey === env.key ? 'chip--active' : ''}`}
                title={env.url}
                onClick={() => pickEnv(env.key)}
              >
                {env.label}
                {env.isCurrent ? ' · host' : ''}
              </button>
            ))}
          </div>
        </div>

        {envKey && (
          <div className="form-row">
            <span className="form-label">Source table</span>
            <SearchSelect
              options={(tables ?? []).map((t) => ({
                id: t.logicalName,
                label: t.displayName,
                sub: t.logicalName,
              }))}
              value={table}
              onChange={pickTable}
              placeholder="Select the source table…"
              loading={tables === null}
            />
          </div>
        )}

        {loadError && <div className="state state--error">{loadError}</div>}

        {table && (
          <>
            <div className="form-row">
              <span className="form-label">Filter &amp; columns</span>
              <div className="subtabs thub-mode">
                <button
                  className={`subtab ${queryMode === 'view' ? 'subtab--active' : ''}`}
                  onClick={() => switchMode('view')}
                >
                  Saved view
                </button>
                <button
                  className={`subtab ${queryMode === 'fetchxml' ? 'subtab--active' : ''}`}
                  onClick={() => switchMode('fetchxml')}
                  title={
                    viewId
                      ? "Starts from the selected view's FetchXML when the field is empty."
                      : undefined
                  }
                >
                  FetchXML
                </button>
              </div>
            </div>

            {queryMode === 'view' && (
              <div className="form-row">
                <SearchSelect
                  options={(views ?? []).map((v) => ({
                    id: v.id,
                    label: v.name,
                    sub: v.description || undefined,
                    hint: v.isDefault ? 'default' : undefined,
                  }))}
                  value={viewId}
                  onChange={setViewId}
                  placeholder="Select a system view…"
                  loading={views === null}
                />
                <span className="muted thub-hint">
                  System views only. The view's FetchXML is stored as a snapshot on
                  save — refresh it from the entry list when the view changes.
                  {entry?.viewSnapshotAt && entry.viewId === viewId && (
                    <> Last snapshot: {new Date(entry.viewSnapshotAt).toLocaleString()}.</>
                  )}
                </span>
              </div>
            )}

            {queryMode === 'fetchxml' && (
              <div className="form-row">
                <textarea
                  className="thub-xml"
                  value={fetchXml}
                  onChange={(e) => setFetchXml(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  placeholder={`<fetch><entity name="${table}">\n  <attribute name="…"/>\n  <filter>…</filter>\n</entity></fetch>`}
                />
                <div className="thub-xml-tools">
                  {parsed.ok ? (
                    <span className="thub-xml-ok">
                      ✓ {parsed.entity} ·{' '}
                      {parsed.allAttributes
                        ? 'all columns'
                        : `${parsed.attributes.length} column${parsed.attributes.length === 1 ? '' : 's'}`}
                    </span>
                  ) : (
                    fetchXml.trim() !== '' && (
                      <span className="form-error">{parsed.error}</span>
                    )
                  )}
                  <button
                    className="btn btn--small"
                    onClick={openColumnPicker}
                    disabled={!parsed.ok || !columns?.length}
                    title="Replace the query's <attribute> list from the table's columns"
                  >
                    Columns…
                  </button>
                </div>
                {parsed.ok &&
                  parsed.warnings.map((w) => (
                    <span key={w} className="muted thub-hint">
                      ⚠ {w}
                    </span>
                  ))}
              </div>
            )}

            {showColumnPicker && (
              <div className="form-row thub-col-picker">
                <span className="form-label">Columns for the query</span>
                <input
                  type="search"
                  className="thub-col-search"
                  placeholder="Search columns…"
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                />
                <div className="thub-col-list">
                  {visibleColumns.map((c) => (
                    <label key={c.logicalName} className="thub-col-option">
                      <input
                        type="checkbox"
                        checked={pickedColumns.has(c.logicalName)}
                        onChange={() =>
                          setPickedColumns((prev) => {
                            const next = new Set(prev)
                            if (next.has(c.logicalName)) next.delete(c.logicalName)
                            else next.add(c.logicalName)
                            return next
                          })
                        }
                      />
                      <span className="thub-col-name">{c.displayName}</span>
                      <code>{c.logicalName}</code>
                    </label>
                  ))}
                  {visibleColumns.length === 0 && (
                    <div className="muted">No columns match “{columnSearch}”.</div>
                  )}
                </div>
                <div className="thub-xml-tools">
                  <span className="muted">{pickedColumns.size} selected</span>
                  <button className="btn btn--small" onClick={() => setShowColumnPicker(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn--small btn--primary"
                    onClick={applyColumnPicker}
                    disabled={pickedColumns.size === 0}
                  >
                    Apply columns
                  </button>
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="thub-xml-tools">
                <button
                  className="btn btn--small"
                  onClick={() => void runPreview()}
                  disabled={!canPreview}
                >
                  {previewBusy ? 'Loading preview…' : 'Preview data'}
                </button>
                {preview?.totalCount !== undefined && (
                  <span className="muted">≈ {preview.totalCount} rows total</span>
                )}
              </div>
              {previewError && <div className="state state--error">{previewError}</div>}
              {preview && (
                <div className="thub-preview">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        {preview.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.length === 0 && (
                        <tr>
                          <td colSpan={Math.max(1, preview.columns.length)} className="muted">
                            The query returned no rows.
                          </td>
                        </tr>
                      )}
                      {preview.rows.map((row, i) => (
                        <tr key={i}>
                          {preview.columns.map((c) => (
                            <td key={c}>
                              {formattedValue(row, c) ?? String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="form-row">
              <span className="form-label">Record matching in the target</span>
              <div className="chips">
                <button
                  className={`chip ${matchMode === 'guid' ? 'chip--active' : ''}`}
                  title="Upsert with the source record's GUID — ids stay identical across environments."
                  onClick={() => setMatchMode('guid')}
                >
                  GUID upsert
                </button>
                <button
                  className={`chip ${matchMode === 'columns' ? 'chip--active' : ''}`}
                  title="Find the target record by business columns — ids may differ."
                  onClick={() => setMatchMode('columns')}
                >
                  Match by columns
                </button>
              </div>
            </div>

            {matchMode === 'columns' && (
              <div className="form-row">
                <span className="form-label">
                  Match columns{' '}
                  <span className="muted">
                    ({matchColumns.size}/{MAX_MATCH_COLUMNS})
                  </span>
                </span>
                <div className="thub-col-list">
                  {matchColumnOptions.map((col) => {
                    const picked = matchColumns.has(col)
                    // The executor builds composite keys from a fixed 5 slots.
                    const capped = !picked && matchColumns.size >= MAX_MATCH_COLUMNS
                    return (
                      <label
                        key={col}
                        className={`thub-col-option ${capped ? 'thub-col-option--off' : ''}`}
                        title={
                          capped
                            ? `At most ${MAX_MATCH_COLUMNS} match columns are supported.`
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          checked={picked}
                          disabled={capped}
                          onChange={() => toggleMatchColumn(col)}
                        />
                        <span className="thub-col-name">{columnLabel(col)}</span>
                        <code>{col}</code>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <label className="form-row">
              <span className="form-label">
                Records present in the target but missing from the source
              </span>
              <select
                value={orphan}
                onChange={(e) => setOrphan(e.target.value as OrphanHandling)}
              >
                {ORPHAN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} — {o.hint}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-row">
              <span className="form-label">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Anything the pipeline operator should know."
              />
            </label>
          </>
        )}

        {error && <div className="state state--error">{error}</div>}
        {blockers.length > 0 && envKey !== '' && (
          <div className="muted thub-blockers">{blockers.join(' ')}</div>
        )}

        <div className="modal-footer">
          {locked && (
            <span className="muted">
              🔒 A run is queued or running — saving is locked until it finishes.
            </span>
          )}
          <button className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={() => void submit()}
            disabled={!canSubmit}
            title={
              locked
                ? 'Locked while a run is queued or running.'
                : blockers.join('\n') || undefined
            }
          >
            {submitting
              ? 'Saving…'
              : entry
                ? 'Save entry'
                : 'Add entry'}
          </button>
        </div>
      </div>
    </div>
  )
}
