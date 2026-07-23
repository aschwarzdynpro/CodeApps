import { useCallback, useEffect, useState } from 'react'
import type { TransferEntry, TransferPackage } from '../types/transferHub'
import { transferHubService } from '../services/transferHubService'
import { ENVIRONMENTS } from '../config'
import { formatRelative } from '../utils/format'
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch; all setState happens after await
    void loadPackages()
  }, [loadPackages])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch; all setState happens after await
    if (selectedId) void loadEntries(selectedId)
  }, [selectedId, loadEntries])

  /** Change selection + clear the stale entry table (event-driven reset). */
  const selectPackage = (id: string) => {
    setSelectedId(id)
    setEntries(null)
    setEntriesError(null)
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
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.length === 0 && (
                        <tr>
                          <td colSpan={8} className="muted">
                            No entries yet — add the first table to this package.
                          </td>
                        </tr>
                      )}
                      {entries.map((entry, idx) => (
                        <tr key={entry.id} className={entry.active ? '' : 'thub-row--inactive'}>
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
                          <td className="nowrap thub-entry-actions">
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
                      ))}
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
            } else {
              await transferHubService.createEntry(input)
            }
            await loadEntries(selected.id)
            await loadPackages()
          }}
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
