import { Fragment, useCallback, useEffect, useState } from 'react'
import type {
  TransferEntry,
  TransferPackage,
  TransferRun,
  TransferRunStatus,
} from '../types/transferHub'
import { transferHubService } from '../services/transferHubService'
import { formatDuration, formatFetchXml, parseRunLog } from '../utils/transferConfig'
import { ENVIRONMENTS } from '../config'
import { formatDateTime, formatRelative } from '../utils/format'
import { ConfirmDialog } from './ConfirmDialog'
import { TransferPackageDialog } from './TransferPackageDialog'
import { TransferEntryDialog } from './TransferEntryDialog'
import { TransferRunDialog } from './TransferRunDialog'

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

const ENTRY_COLUMNS = 8
const RUN_COLUMNS = 8

const RUN_STATUS_LABELS: Record<TransferRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  partial: 'Partial',
  cancelled: 'Cancelled',
  scheduled: 'Scheduled',
}

export function TransferHubWorkspace() {
  const [packages, setPackages] = useState<TransferPackage[] | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [entries, setEntries] = useState<TransferEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [entriesError, setEntriesError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState('')

  const [packageDialog, setPackageDialog] = useState<PackageDialogState>(null)
  const [entryDialog, setEntryDialog] = useState<EntryDialogState>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  // Run queue of the selected package.
  const [runs, setRuns] = useState<TransferRun[] | null>(null)
  const [runsError, setRunsError] = useState<string | null>(null)
  const [runConfirm, setRunConfirm] = useState<TransferPackage | null>(null)
  const [expandedRunId, setExpandedRunId] = useState('')
  const [showAllRuns, setShowAllRuns] = useState(false)

  // On-demand row counts per entry id — kept across reloads (reorder,
  // toggles); invalidated when the entry's query may have changed (edit) or
  // via the toolbar Refresh. Data preview lives in the entry dialog.
  const [counts, setCounts] = useState<Record<string, CountState>>({})

  const clearInsights = (entryId?: string) => {
    if (entryId === undefined) {
      setCounts({})
      return
    }
    setCounts((prev) => {
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

  // No synchronous setState here — resets happen in the event handlers
  // (selectPackage), so the effects below only fetch (React-Compiler rule).
  const loadPackages = useCallback(async () => {
    try {
      const list = await transferHubService.listPackages()
      setPackages(list)
      setLoadError(null)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch; all setState happens after await
    void loadPackages()
  }, [loadPackages])

  useEffect(() => {
    if (selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch; all setState happens after await
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

  // 1s ticker drives the live Duration column while a run is executing.
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (!runs?.some((r) => r.status === 'running')) return
    const timer = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [runs])

  /** Elapsed (running, vs. now) or final (finished) duration — null when n/a. */
  const runDuration = (run: TransferRun): string | null => {
    if (!run.startedOn) return null
    const start = new Date(run.startedOn).getTime()
    if (Number.isNaN(start)) return null
    if (run.finishedOn) {
      const end = new Date(run.finishedOn).getTime()
      return Number.isNaN(end) ? null : formatDuration(end - start)
    }
    if (run.status === 'running') return formatDuration(nowTick - start)
    return null
  }

  /** Change selection + clear the stale entry table (event-driven reset). */
  const selectPackage = (id: string) => {
    // Re-clicking the selected package must be a no-op: the load effect keys
    // on selectedId and would not re-fire, leaving the cleared lists stuck
    // on "Loading…" forever.
    if (id === selectedId) return
    setSelectedId(id)
    setEntries(null)
    setEntriesError(null)
    setRuns(null)
    setRunsError(null)
    setExpandedRunId('')
    setShowAllRuns(false)
  }

  const queueRun = async (pkg: TransferPackage, scheduledFor?: string) => {
    await transferHubService.createRun(pkg, scheduledFor)
    await loadRuns(pkg.id)
  }

  const cancelRun = async (runId: string) => {
    setActionError(null)
    try {
      await transferHubService.cancelRun(runId)
      if (selectedId) await loadRuns(selectedId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const selected = packages?.find((p) => p.id === selectedId) ?? null
  /**
   * A queued/running run reads the entries live — lock every entry mutation
   * while it is active to avoid mid-run inconsistencies. Scheduled runs do
   * NOT lock (they read the config only when they fire). The 10s run polling
   * releases the lock automatically.
   */
  const runActive = (runs ?? []).some((r) => r.status === 'queued' || r.status === 'running')
  const lockHint = 'Locked while a run is queued or running.'

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
      {loadError && <div className="state state--error">{loadError}</div>}
      {actionError && <div className="state state--error">{actionError}</div>}

      {packages === null && <div className="card muted">Loading packages…</div>}
      {packages !== null && (
        <div className="thub-pkg-strip">
          <button
            className="card thub-pkg thub-pkg--new"
            title="Create a new transfer package"
            onClick={() => setPackageDialog({ pkg: null })}
          >
            <span className="thub-pkg-new-plus">+</span>
            <span>New package</span>
          </button>
          {packages.map((pkg) => (
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
      )}

      {packages !== null && packages.length > 0 && !selected && (
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
                  {runActive && (
                    <span className="thub-badge" title={lockHint}>
                      🔒 Run active
                    </span>
                  )}
                  <button
                    className="btn btn--small"
                    onClick={() => setPackageDialog({ pkg: selected })}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn--small"
                    disabled={busyId === selected.id || runActive}
                    title={runActive ? lockHint : undefined}
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
                    disabled={runActive}
                    title={runActive ? lockHint : undefined}
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
                  <div className="thub-table-wrap">
                  <table className="ops-table thub-entries">
                    <thead>
                      <tr>
                        <th className="num">#</th>
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
                        return (
                        <Fragment key={entry.id}>
                        <tr
                          className={`thub-row--click ${entry.active ? '' : 'thub-row--inactive'}`}
                          onClick={(e) => {
                            // Row opens the editor — except when the click hit
                            // one of the inline buttons (count refresh, actions).
                            if ((e.target as HTMLElement).closest('button')) return
                            setEntryDialog({ entry })
                          }}
                        >
                          <td className="num">{entry.order}</td>
                          <td className="nowrap">{envLabel(entry.sourceEnvKey)}</td>
                          <td>
                            <span
                              className="thub-cell-clip"
                              title={`${entry.tableDisplayName} (${entry.tableLogicalName})${entry.notes ? ` — ${entry.notes}` : ''}`}
                            >
                              {entry.tableDisplayName} <code>{entry.tableLogicalName}</code>
                            </span>
                            {!entry.active && (
                              <span className="thub-badge thub-badge--off">Inactive</span>
                            )}
                          </td>
                          <td className="nowrap">
                            {entry.queryMode === 'view' ? (
                              <span
                                className="thub-cell-clip"
                                title={`Snapshot of "${entry.viewName}"\n\n${formatFetchXml(entry.fetchXml)}`}
                              >
                                📄 {entry.viewName || 'Saved view'}
                              </span>
                            ) : (
                              <span title={formatFetchXml(entry.fetchXml)}>✏️ FetchXML</span>
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
                              className="thub-icon-btn"
                              title={runActive ? lockHint : 'Move up'}
                              disabled={idx === 0 || busyId !== '' || runActive}
                              onClick={() => moveEntry(entry, -1)}
                            >
                              ↑
                            </button>
                            <button
                              className="thub-icon-btn"
                              title={runActive ? lockHint : 'Move down'}
                              disabled={idx === entries.length - 1 || busyId !== '' || runActive}
                              onClick={() => moveEntry(entry, 1)}
                            >
                              ↓
                            </button>
                            {entry.queryMode === 'view' && (
                              <button
                                className="thub-icon-btn"
                                title={
                                  runActive
                                    ? lockHint
                                    : entry.viewSnapshotAt
                                      ? `Refresh the view snapshot (last: ${new Date(entry.viewSnapshotAt).toLocaleString()})`
                                      : 'Refresh the view snapshot'
                                }
                                disabled={busyId === entry.id || runActive}
                                onClick={() =>
                                  void runAction(entry.id, async () => {
                                    await transferHubService.refreshViewSnapshot(entry.id)
                                    await loadEntries(selectedId)
                                  })
                                }
                              >
                                {busyId === entry.id ? '…' : '⟳'}
                              </button>
                            )}
                            <button
                              className={`thub-icon-btn ${entry.active ? '' : 'thub-icon-btn--off'}`}
                              title={
                                runActive
                                  ? lockHint
                                  : entry.active
                                    ? 'Deactivate entry'
                                    : 'Activate entry'
                              }
                              disabled={busyId === entry.id || runActive}
                              onClick={() =>
                                void runAction(entry.id, async () => {
                                  await transferHubService.setEntryActive(entry.id, !entry.active)
                                  await loadEntries(selectedId)
                                })
                              }
                            >
                              ⏻
                            </button>
                            <button
                              className="thub-icon-btn thub-icon-btn--danger"
                              title={runActive ? lockHint : 'Delete entry'}
                              disabled={runActive}
                              onClick={() => setConfirm({ kind: 'delete-entry', entry })}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                        </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                  <div className="thub-add-entry">
                    <button
                      className="btn btn--primary btn--small"
                      disabled={runActive}
                      title={runActive ? lockHint : undefined}
                      onClick={() => setEntryDialog({ entry: null })}
                    >
                      + Add entry
                    </button>
                    <span className="muted">
                      {runActive
                        ? 'A run is queued or running — editing is locked until it finishes.'
                        : 'Entries run in ascending order — put lookup parents before their children.'}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

      {selected && (
            <div className="card thub-runs-card">
              <div className="thub-detail-head">
                <div>
                  <h2 className="thub-detail-title">Runs</h2>
                  <p className="muted">
                    Executed by the external pipeline — queue immediately or
                    schedule for later.
                  </p>
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
                    title="Reload the run list"
                    onClick={() => void loadRuns(selected.id)}
                  >
                    ⟳
                  </button>
                </span>
              </div>
              {runsError && <div className="state state--error">{runsError}</div>}
              {runs === null && !runsError && <div className="muted">Loading runs…</div>}
              {runs !== null && (
                <>
                  <div className="thub-table-wrap">
                    <table className="ops-table thub-runs">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Requested</th>
                          <th>Scheduled for</th>
                          <th>Targets</th>
                          <th>Finished</th>
                          <th>Duration</th>
                          <th>Summary</th>
                          <th></th>
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
                        {(showAllRuns ? runs : runs.slice(0, 5)).map((run) => (
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
                                {run.scheduledFor ? (
                                  <span title={formatDateTime(run.scheduledFor)}>
                                    ⏰ {formatDateTime(run.scheduledFor)}
                                  </span>
                                ) : (
                                  <span className="muted">–</span>
                                )}
                              </td>
                              <td className="nowrap">
                                {run.targetEnvKeys.map(envLabel).join(', ')}
                              </td>
                              <td className="nowrap" title={run.finishedOn ? formatDateTime(run.finishedOn) : undefined}>
                                {run.finishedOn ? formatRelative(run.finishedOn) : '–'}
                              </td>
                              <td
                                className="nowrap"
                                title={run.startedOn ? `Started ${formatDateTime(run.startedOn)}` : undefined}
                              >
                                {runDuration(run) ?? <span className="muted">–</span>}
                              </td>
                              <td>{run.summary || <span className="muted">–</span>}</td>
                              <td className="nowrap">
                                {(run.status === 'scheduled' || run.status === 'queued') && (
                                  <button
                                    className="thub-icon-btn thub-icon-btn--danger"
                                    title="Cancel this run before it starts"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void cancelRun(run.id)
                                    }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </td>
                            </tr>
                            {expandedRunId === run.id && run.log && (
                              <tr className="thub-preview-tr">
                                <td colSpan={RUN_COLUMNS}>
                                  {(() => {
                                    const logRows = parseRunLog(run.log)
                                    if (!logRows)
                                      return <pre className="thub-run-log">{run.log}</pre>
                                    return (
                                      <div className="thub-table-wrap">
                                        <table className="ops-table thub-run-details">
                                          <thead>
                                            <tr>
                                              <th>Entry</th>
                                              <th>Target</th>
                                              <th className="num">Created</th>
                                              <th className="num">Updated</th>
                                              <th className="num">Deactivated</th>
                                              <th className="num">Deleted</th>
                                              <th>Errors</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {logRows.map((row, i) => (
                                              <tr key={i}>
                                                <td>{row.entry || '–'}</td>
                                                <td className="nowrap">
                                                  {row.target ? envLabel(row.target) : '–'}
                                                </td>
                                                {row.error ? (
                                                  <td colSpan={5}>
                                                    <span className="thub-log-error">{row.error}</span>
                                                  </td>
                                                ) : (
                                                  <>
                                                    <td className="num">{row.created}</td>
                                                    <td className="num">{row.updated}</td>
                                                    <td className="num">{row.deactivated}</td>
                                                    <td className="num">{row.deleted}</td>
                                                    <td>
                                                      {row.errors.length === 0 ? (
                                                        <span className="muted">–</span>
                                                      ) : (
                                                        <ul className="thub-log-errlist">
                                                          {row.errors.map((e, j) => (
                                                            <li key={j} className="thub-log-error">
                                                              {e}
                                                            </li>
                                                          ))}
                                                        </ul>
                                                      )}
                                                    </td>
                                                  </>
                                                )}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )
                                  })()}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {runs.length > 5 && (
                    <button
                      className="thub-runs-more"
                      onClick={() => setShowAllRuns((v) => !v)}
                    >
                      {showAllRuns ? 'Show fewer runs' : `Show all ${runs.length} runs`}
                    </button>
                  )}
                </>
              )}
            </div>
      )}

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
          locked={runActive}
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
        <TransferRunDialog
          pkg={runConfirm}
          onClose={() => setRunConfirm(null)}
          onQueue={(scheduledFor) => queueRun(runConfirm, scheduledFor)}
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
