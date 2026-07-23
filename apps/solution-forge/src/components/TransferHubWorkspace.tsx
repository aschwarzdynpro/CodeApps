import { Fragment, useCallback, useEffect, useState } from 'react'
import type {
  PreviewResult,
  TransferEntry,
  TransferPackage,
  TransferRun,
  TransferRunStatus,
} from '../types/transferHub'
import { transferHubService } from '../services/transferHubService'
import { formattedValue } from '../services/currentEnvQuery'
import { ENVIRONMENTS } from '../config'
import { formatDateTime, formatRelative } from '../utils/format'
import { ConfirmDialog } from './ConfirmDialog'
import { TransferPackageDialog } from './TransferPackageDialog'
import { TransferEntryDialog } from './TransferEntryDialog'

/**
 * Configuration Data Transfer Hub (Manage, gated): author the transfer
 * packages/entries an external pipeline executes. Master-detail — packages on
 * the left, the selected package's entries (ordered, with per-entry query /
 * match / orphan config) on the right. All CRUD is host-native; the entry
 * dialog browses the SOURCE environment through the connector.
 */

type PackageDialogState = { pkg: TransferPackage | null } | null
type EntryDialogState = { entry: TransferEntry | null } | null
type ConfirmState =
  | { kind: 'delete-package'; pkg: TransferPackage }
  | { kind: 'delete-entry'; entry: TransferEntry }
  | null

function envLabel(key: string): string {
  return ENVIRONMENTS.find((e) => e.key === key)?.label ?? key
}

const ORPHAN_LABELS: Record<TransferEntry['orphanHandling'], string> = {
  ignore: 'Ignore',
  deactivate: 'Deactivate',
  delete: 'Delete',
}

/** Per-entry row-count cell: loading spinner, a number, or "not countable". */
type CountState = 'loading' | 'na' | number
/** Per-entry preview cache: loading, an error, or the result. */
type PreviewState = 'loading' | { error: string } | PreviewResult

const ENTRY_COLUMNS = 9
const RUN_COLUMNS = 5

const RUN_STATUS_LABELS: Record<TransferRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  partial: 'Partial',
  cancelled: 'Cancelled',
}

export function TransferHubWorkspace() {
  const [packages, setPackages] = useState<TransferPackage[] | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [entries, setEntries] = useState<TransferEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [entriesError, setEntriesError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState('')
  const [loadedAt, setLoadedAt] = useState('')

  const [packageDialog, setPackageDialog] = useState<PackageDialogState>(null)
  const [entryDialog, setEntryDialog] = useState<EntryDialogState>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  // Run queue of the selected package.
  const [runs, setRuns] = useState<TransferRun[] | null>(null)
  const [runsError, setRunsError] = useState<string | null>(null)
  const [runConfirm, setRunConfirm] = useState<TransferPackage | null>(null)
  const [runBusy, setRunBusy] = useState(false)
  const [expandedRunId, setExpandedRunId] = useState('')

  // On-demand data insights per entry id — kept across reloads (reorder,
  // toggles); invalidated when the entry's query may have changed (edit) or
  // via the toolbar Refresh.
  const [counts, setCounts] = useState<Record<string, CountState>>({})
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({})
  const [expandedId, setExpandedId] = useState('')

  const clearInsights = (entryId?: string) => {
    if (entryId === undefined) {
      setCounts({})
      setPreviews({})
      setExpandedId('')
      return
    }
    setCounts((prev) => {
      const next = { ...prev }
      delete next[entryId]
      return next
    })
    setPreviews((prev) => {
      const next = { ...prev }
      delete next[entryId]
      return next
    })
  }

  const refreshCount = async (entry: TransferEntry) => {
    setCounts((prev) => ({ ...prev, [entry.id]: 'loading' }))
    const value = await transferHubService
      .countRows(entry.sourceEnvKey, entry.tableLogicalName, entry.fetchXml)
      .catch(() => undefined)
    setCounts((prev) => ({ ...prev, [entry.id]: value ?? 'na' }))
  }

  const refreshAllCounts = async () => {
    if (!entries) return
    // Serial — a handful of aggregate queries, keeps the source env polite.
    for (const entry of entries) await refreshCount(entry)
  }

  const loadPreview = async (entry: TransferEntry) => {
    setPreviews((prev) => ({ ...prev, [entry.id]: 'loading' }))
    try {
      const result = await transferHubService.preview(
        entry.sourceEnvKey,
        entry.tableLogicalName,
        entry.fetchXml,
      )
      setPreviews((prev) => ({ ...prev, [entry.id]: result }))
      if (result.totalCount !== undefined)
        setCounts((prev) => ({ ...prev, [entry.id]: result.totalCount as number }))
    } catch (err) {
      setPreviews((prev) => ({
        ...prev,
        [entry.id]: { error: err instanceof Error ? err.message : String(err) },
      }))
    }
  }

  const togglePreview = (entry: TransferEntry) => {
    if (expandedId === entry.id) {
      setExpandedId('')
      return
    }
    setExpandedId(entry.id)
    if (!previews[entry.id]) void loadPreview(entry)
  }

  // No synchronous setState here — resets happen in the event handlers
  // (selectPackage), so the effects below only fetch (React-Compiler rule).
  const loadPackages = useCallback(async () => {
    try {
      const list = await transferHubService.listPackages()
      setPackages(list)
      setLoadError(null)
      setLoadedAt(new Date().toISOString())
      return list
    } catch (err) {
      setPackages([])
      setLoadError(err instanceof Error ? err.message : String(err))
      return []
    }
  }, [])

  const loadEntries = useCallback(async (packageId: string) => {
    try {
      const list = await transferHubService.listEntries(packageId)
      setEntries(list)
      setEntriesError(null)
    } catch (err) {
      setEntries([])
      setEntriesError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const loadRuns = useCallback(async (packageId: string) => {
    try {
      const list = await transferHubService.listRuns(packageId)
      setRuns(list)
      setRunsError(null)
    } catch (err) {
      setRuns([])
      setRunsError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void loadPackages()
  }, [loadPackages])

  useEffect(() => {
    if (selectedId) {
      void loadEntries(selectedId)
      void loadRuns(selectedId)
    }
  }, [selectedId, loadEntries, loadRuns])

  // While a run is queued/running, poll its status — the external executor
  // writes progress into pro_transferrun.
  useEffect(() => {
    if (!selectedId) return
    if (!runs?.some((r) => r.status === 'queued' || r.status === 'running')) return
    const timer = setInterval(() => {
      void loadRuns(selectedId)
    }, 10000)
    return () => clearInterval(timer)
  }, [runs, selectedId, loadRuns])

  /** Change selection + clear the stale entry table (event-driven reset). */
  const selectPackage = (id: string) => {
    setSelectedId(id)
    setEntries(null)
    setEntriesError(null)
    setRuns(null)
    setRunsError(null)
    setExpandedRunId('')
  }

  const queueRun = async (pkg: TransferPackage) => {
    setRunBusy(true)
    setActionError(null)
    try {
      await transferHubService.createRun(pkg)
      setRunConfirm(null)
      await loadRuns(pkg.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
      setRunConfirm(null)
    } finally {
      setRunBusy(false)
    }
  }

  const selected = packages?.find((p) => p.id === selectedId) ?? null

  const runAction = async (id: string, action: () => Promise<void>) => {
    setBusyId(id)
    setActionError(null)
    try {
      await action()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId('')
    }
  }

  const moveEntry = (entry: TransferEntry, delta: -1 | 1) => {
    if (!entries) return
    const idx = entries.findIndex((e) => e.id === entry.id)
    const target = idx + delta
    if (idx < 0 || target < 0 || target >= entries.length) return
    const reordered = [...entries]
    reordered.splice(idx, 1)
    reordered.splice(target, 0, entry)
    // Optimistic order update, persisted serially.
    setEntries(reordered.map((e, i) => ({ ...e, order: i + 1 })))
    void runAction(entry.id, async () => {
      await transferHubService.reorderEntries(reordered.map((e) => e.id))
    })
  }

  const confirmAction = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    setActionError(null)
    try {
      if (confirm.kind === 'delete-package') {
        await transferHubService.deletePackage(confirm.pkg.id)
        if (selectedId === confirm.pkg.id) selectPackage('')
        await loadPackages()
      } else {
        await transferHubService.deleteEntry(confirm.entry.id)
        await loadEntries(selectedId)
        await loadPackages()
      }
      setConfirm(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
      setConfirm(null)
    } finally {
      setConfirmBusy(false)
    }
  }

  const nextOrder = entries && entries.length > 0 ? Math.max(...entries.map((e) => e.order)) + 1 : 1

  return (
    <div className="thub">
      <div className="card compare-controls thub-toolbar">
        <button className="btn btn--primary" onClick={() => setPackageDialog({ pkg: null })}>
          + New package
        </button>
        <span className="muted">
          Packages an external pipeline reads and executes — the hub only authors
          the configuration.
        </span>
        <span className="cmp-sync">
          {loadedAt && <span className="cmp-sync-time">Last sync {formatRelative(loadedAt)}</span>}
          <button
            className="btn btn--small"
            onClick={() => {
              clearInsights()
              void loadPackages()
              if (selectedId) void loadEntries(selectedId)
            }}
          >
            ⟳ Refresh
          </button>
        </span>
      </div>

      {loadError && <div className="state state--error">{loadError}</div>}
      {actionError && <div className="state state--error">{actionError}</div>}

      <div className="thub-layout">
        <div className="thub-pkg-list">
          {packages === null && <div className="card muted">Loading packages…</div>}
          {packages !== null && packages.length === 0 && !loadError && (
            <div className="card muted">
              No transfer packages yet — create the first one to define which
              configuration data moves between environments.
            </div>
          )}
          {packages?.map((pkg) => (
            <button
              key={pkg.id}
              className={`card thub-pkg ${pkg.id === selectedId ? 'thub-pkg--active' : ''} ${
                pkg.active ? '' : 'thub-pkg--inactive'
              }`}
              onClick={() => selectPackage(pkg.id)}
            >
              <span className="thub-pkg-head">
                <span className="thub-pkg-name">{pkg.name}</span>
                {!pkg.active && <span className="thub-badge thub-badge--off">Inactive</span>}
              </span>
              <span className="thub-pkg-meta">
                <span className="chips">
                  {pkg.targetEnvKeys.map((k) => (
                    <span key={k} className="chip thub-chip-static">
                      → {envLabel(k)}
                    </span>
                  ))}
                </span>
                <span className="muted">
                  {pkg.entryCount ?? '–'} entr{(pkg.entryCount ?? 0) === 1 ? 'y' : 'ies'} · order{' '}
                  {pkg.order}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="thub-detail">
          {!selected && (
            <div className="card muted thub-empty">
              Select a package to see and edit its entries.
            </div>
          )}
          {selected && (
            <div className="card">
              <div className="thub-detail-head">
                <div>
                  <h2 className="thub-detail-title">{selected.name}</h2>
                  {selected.description && <p className="muted">{selected.description}</p>}
                </div>
                <span className="trace-level-control">
                  <button
                    className="btn btn--small btn--primary"
                    title={
                      selected.targetEnvKeys.length === 0
                        ? 'No target environments configured.'
                        : `Queue a run for ${selected.targetEnvKeys.map(envLabel).join(', ')}`
                    }
                    disabled={selected.targetEnvKeys.length === 0 || !selected.active}
                    onClick={() => setRunConfirm(selected)}
                  >
                    ▶ Run
                  </button>
                  <button
                    className="btn btn--small"
                    onClick={() => setPackageDialog({ pkg: selected })}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn--small"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      void runAction(selected.id, async () => {
                        await transferHubService.setPackageActive(selected.id, !selected.active)
                        await loadPackages()
                      })
                    }
                  >
                    {selected.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    className="btn btn--small btn--danger"
                    onClick={() => setConfirm({ kind: 'delete-package', pkg: selected })}
                  >
                    Delete
                  </button>
                </span>
              </div>

              {entriesError && <div className="state state--error">{entriesError}</div>}
              {entries === null && !entriesError && <div className="muted">Loading entries…</div>}

              {entries !== null && (
                <>
                  <table className="ops-table thub-entries">
                    <thead>
                      <tr>
                        <th className="num">#</th>
                        <th>Entry</th>
                        <th>Source</th>
                        <th>Table</th>
                        <th>Query</th>
                        <th>Match</th>
                        <th>Orphans</th>
                        <th className="num">
                          Rows{' '}
                          <button
                            className="thub-count-refresh"
                            title="Count the source rows of every entry"
                            onClick={() => void refreshAllCounts()}
                          >
                            ⟳
                          </button>
                        </th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.length === 0 && (
                        <tr>
                          <td colSpan={ENTRY_COLUMNS} className="muted">
                            No entries yet — add the first table to this package.
                          </td>
                        </tr>
                      )}
                      {entries.map((entry, idx) => {
                        const count = counts[entry.id]
                        const preview = previews[entry.id]
                        const expanded = expandedId === entry.id
                        return (
                        <Fragment key={entry.id}>
                        <tr className={entry.active ? '' : 'thub-row--inactive'}>
                          <td className="num">{entry.order}</td>
                          <td>
                            <span className="thub-entry-name">{entry.name}</span>
                            {!entry.active && (
                              <span className="thub-badge thub-badge--off">Inactive</span>
                            )}
                            {entry.notes && (
                              <span className="muted thub-entry-notes">{entry.notes}</span>
                            )}
                          </td>
                          <td className="nowrap">{envLabel(entry.sourceEnvKey)}</td>
                          <td>
                            {entry.tableDisplayName}
                            <br />
                            <code>{entry.tableLogicalName}</code>
                          </td>
                          <td className="nowrap">
                            {entry.queryMode === 'view' ? (
                              <span title={`Snapshot of "${entry.viewName}"`}>
                                📄 {entry.viewName || 'Saved view'}
                              </span>
                            ) : (
                              <span>✏️ FetchXML</span>
                            )}
                          </td>
                          <td className="nowrap">
                            {entry.matchMode === 'guid' ? 'GUID' : entry.matchColumns.join(', ')}
                          </td>
                          <td className="nowrap">{ORPHAN_LABELS[entry.orphanHandling]}</td>
                          <td className="num nowrap thub-count-cell">
                            {count === 'loading' ? (
                              <span className="muted">…</span>
                            ) : count === 'na' ? (
                              <span
                                className="muted"
                                title="Not countable (aggregate query, >50k rows, or the count failed)."
                              >
                                n/a
                              </span>
                            ) : count !== undefined ? (
                              count.toLocaleString()
                            ) : (
                              <span className="muted">–</span>
                            )}{' '}
                            <button
                              className="thub-count-refresh"
                              title="Count the source rows of this entry"
                              disabled={count === 'loading'}
                              onClick={() => void refreshCount(entry)}
                            >
                              ⟳
                            </button>
                          </td>
                          <td className="nowrap thub-entry-actions">
                            <button
                              className="btn btn--small"
                              title={expanded ? 'Hide the data preview' : 'Preview the source data'}
                              onClick={() => togglePreview(entry)}
                            >
                              {expanded ? '▾' : '▸'} Preview
                            </button>
                            <button
                              className="btn btn--small"
                              title="Move up"
                              disabled={idx === 0 || busyId !== ''}
                              onClick={() => moveEntry(entry, -1)}
                            >
                              ↑
                            </button>
                            <button
                              className="btn btn--small"
                              title="Move down"
                              disabled={idx === entries.length - 1 || busyId !== ''}
                              onClick={() => moveEntry(entry, 1)}
                            >
                              ↓
                            </button>
                            <button
                              className="btn btn--small"
                              onClick={() => setEntryDialog({ entry })}
                            >
                              Edit
                            </button>
                            {entry.queryMode === 'view' && (
                              <button
                                className="btn btn--small"
                                title={
                                  entry.viewSnapshotAt
                                    ? `Re-read the view's FetchXML (snapshot from ${new Date(entry.viewSnapshotAt).toLocaleString()})`
                                    : "Re-read the view's FetchXML"
                                }
                                disabled={busyId === entry.id}
                                onClick={() =>
                                  void runAction(entry.id, async () => {
                                    await transferHubService.refreshViewSnapshot(entry.id)
                                    await loadEntries(selectedId)
                                  })
                                }
                              >
                                {busyId === entry.id ? '…' : '⟳ View'}
                              </button>
                            )}
                            <button
                              className="btn btn--small"
                              disabled={busyId === entry.id}
                              onClick={() =>
                                void runAction(entry.id, async () => {
                                  await transferHubService.setEntryActive(entry.id, !entry.active)
                                  await loadEntries(selectedId)
                                })
                              }
                            >
                              {entry.active ? 'Off' : 'On'}
                            </button>
                            <button
                              className="btn btn--small btn--danger"
                              onClick={() => setConfirm({ kind: 'delete-entry', entry })}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="thub-preview-tr">
                            <td colSpan={ENTRY_COLUMNS}>
                              {preview === 'loading' || preview === undefined ? (
                                <div className="muted">Loading preview…</div>
                              ) : 'error' in preview ? (
                                <div className="state state--error">{preview.error}</div>
                              ) : (
                                <>
                                  <div className="thub-preview-meta">
                                    <span className="muted">
                                      {preview.rows.length} row
                                      {preview.rows.length === 1 ? '' : 's'} shown
                                      {preview.totalCount !== undefined &&
                                        ` of ≈ ${preview.totalCount.toLocaleString()} total`}
                                      {' · '}limit {preview.limit}
                                    </span>
                                    <button
                                      className="btn btn--small"
                                      onClick={() => void loadPreview(entry)}
                                    >
                                      ⟳ Reload
                                    </button>
                                  </div>
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
                                            <td
                                              colSpan={Math.max(1, preview.columns.length)}
                                              className="muted"
                                            >
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
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                        </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="thub-add-entry">
                    <button
                      className="btn btn--primary btn--small"
                      onClick={() => setEntryDialog({ entry: null })}
                    >
                      + Add entry
                    </button>
                    <span className="muted">
                      Entries run in ascending order — put lookup parents before
                      their children.
                    </span>
                  </div>

                  <div className="thub-runs-head">
                    <h3 className="thub-runs-title">Runs</h3>
                    <button
                      className="thub-count-refresh"
                      title="Reload the run list"
                      onClick={() => void loadRuns(selected.id)}
                    >
                      ⟳
                    </button>
                  </div>
                  {runsError && <div className="state state--error">{runsError}</div>}
                  {runs === null && !runsError && <div className="muted">Loading runs…</div>}
                  {runs !== null && (
                    <table className="ops-table thub-runs">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Requested</th>
                          <th>Targets</th>
                          <th>Finished</th>
                          <th>Summary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.length === 0 && (
                          <tr>
                            <td colSpan={RUN_COLUMNS} className="muted">
                              No runs yet — ▶ Run queues one for the external
                              executor.
                            </td>
                          </tr>
                        )}
                        {runs.map((run) => (
                          <Fragment key={run.id}>
                            <tr
                              className={run.log ? 'thub-run-row--clickable' : ''}
                              title={run.log ? 'Show the run log' : undefined}
                              onClick={() =>
                                run.log &&
                                setExpandedRunId(expandedRunId === run.id ? '' : run.id)
                              }
                            >
                              <td className="nowrap">
                                <span className={`thub-run-chip thub-run-chip--${run.status}`}>
                                  {RUN_STATUS_LABELS[run.status]}
                                </span>
                              </td>
                              <td className="nowrap" title={formatDateTime(run.requestedOn)}>
                                {formatRelative(run.requestedOn)}
                                {run.requestedBy && (
                                  <span className="muted"> · {run.requestedBy}</span>
                                )}
                              </td>
                              <td className="nowrap">
                                {run.targetEnvKeys.map(envLabel).join(', ')}
                              </td>
                              <td className="nowrap" title={run.finishedOn ? formatDateTime(run.finishedOn) : undefined}>
                                {run.finishedOn ? formatRelative(run.finishedOn) : '–'}
                              </td>
                              <td>{run.summary || <span className="muted">–</span>}</td>
                            </tr>
                            {expandedRunId === run.id && run.log && (
                              <tr className="thub-preview-tr">
                                <td colSpan={RUN_COLUMNS}>
                                  <pre className="thub-run-log">{run.log}</pre>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {packageDialog && (
        <TransferPackageDialog
          key={packageDialog.pkg?.id ?? 'new'}
          pkg={packageDialog.pkg}
          onClose={() => setPackageDialog(null)}
          onSave={async (input) => {
            if (packageDialog.pkg) {
              await transferHubService.updatePackage(packageDialog.pkg.id, input)
            } else {
              const created = await transferHubService.createPackage(input)
              setSelectedId(created.id)
            }
            await loadPackages()
          }}
        />
      )}

      {entryDialog && selected && (
        <TransferEntryDialog
          key={entryDialog.entry?.id ?? 'new'}
          packageId={selected.id}
          entry={entryDialog.entry}
          defaultOrder={nextOrder}
          onClose={() => setEntryDialog(null)}
          onSave={async (input) => {
            if (entryDialog.entry) {
              await transferHubService.updateEntry(entryDialog.entry.id, input)
              // The query may have changed — drop the cached count/preview.
              clearInsights(entryDialog.entry.id)
            } else {
              await transferHubService.createEntry(input)
            }
            await loadEntries(selected.id)
            await loadPackages()
          }}
        />
      )}

      {runConfirm && (
        <ConfirmDialog
          title={`Queue a run for "${runConfirm.name}"?`}
          message={
            <>
              The external executor will transport{' '}
              <strong>
                {runConfirm.entryCount ?? '?'} entr
                {(runConfirm.entryCount ?? 0) === 1 ? 'y' : 'ies'}
              </strong>{' '}
              into{' '}
              <strong>{runConfirm.targetEnvKeys.map(envLabel).join(', ')}</strong>.
              The target list is snapshotted onto the run.
            </>
          }
          confirmLabel="Queue run"
          danger={runConfirm.targetEnvKeys.includes('prod')}
          busy={runBusy}
          onCancel={() => setRunConfirm(null)}
          onConfirm={() => void queueRun(runConfirm)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === 'delete-package'
              ? `Delete package "${confirm.pkg.name}"?`
              : `Delete entry "${confirm.entry.name}"?`
          }
          message={
            confirm.kind === 'delete-package' ? (
              <>
                The package and its{' '}
                <strong>{confirm.pkg.entryCount ?? 0} entr{(confirm.pkg.entryCount ?? 0) === 1 ? 'y' : 'ies'}</strong>{' '}
                are removed (cascade). The pipeline will no longer transport this
                data. This cannot be undone.
              </>
            ) : (
              <>The entry is removed from the package. This cannot be undone.</>
            )
          }
          confirmLabel="Delete"
          danger
          busy={confirmBusy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void confirmAction()}
        />
      )}
    </div>
  )
}
