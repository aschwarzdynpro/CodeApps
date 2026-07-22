import { useMemo, useRef, useState } from 'react'
import type { UserRef, WorkingSolution } from '../types/solution'
import type {
  BulkAction,
  ComparerEnvState,
  ComparerRow,
  ComparerRunApi,
} from '../types/comparer'
import { rowHasDrift } from '../types/comparer'
import { ENVIRONMENTS, currentEnvKey } from '../config'
import { formatRelative } from '../utils/format'
import { SolutionSelect } from './SolutionSelect'
import { ComparerMatrix } from './ComparerMatrix'
import { ConfirmDialog } from './ConfirmDialog'
import { UserPickerDialog } from './UserPickerDialog'
import { GameOverlay } from './GameOverlay'

/** One dimension the rows can be grouped by in the collapsible matrix. */
export interface ComparerGroupBy {
  /** Stable key for the <select> option. */
  key: string
  /** Human label shown in the "Group by" dropdown (e.g. "process type"). */
  label: string
  /** The row's value in this dimension; undefined = not applicable to that row. */
  get: (row: ComparerRow) => string | undefined
  /** Preferred order of the group headers (values); groups outside it sort
   *  after, alphabetically. */
  order?: string[]
}

interface Props {
  solutions: WorkingSolution[]
  canManage: boolean
  /** Singular noun for messages, e.g. "flow" / "process" / "plugin step". */
  noun: string
  /** Plugin steps show a version; flows show the modified time. */
  showVersion: boolean
  /** Dimensions the rows can be grouped by (collapsible). When more than one has
   *  data a dropdown lets the user switch; the first with data is the default,
   *  and "None" turns grouping off. */
  groupBys?: ComparerGroupBy[]
  /** The run backing this workspace — persistent (Flow) or local (Plugin). */
  run: ComparerRunApi
  /** Single per-cell turn on/off (the bulk path lives inside `run`). */
  setState: (
    envKey: string,
    id: string,
    on: boolean,
  ) => Promise<ComparerEnvState>
  /** Enable multi-select + a bulk action bar (Flow Comparer). */
  enableBulk?: boolean
  /** Search users in one env for the owner picker. Its presence also enables the
   *  owner column + the bulk "Change owner" action. */
  listUsers?: (envKey: string, query: string) => Promise<UserRef[]>
}

/**
 * Shared workspace for the Flow / Plugin comparers: pick a release solution →
 * build the per-environment status matrix → turn items on/off per environment
 * (with a confirm, PROD extra-strong). The compare result + any bulk run live in
 * the injected `run` (persistent for the Flow Comparer); view state (filters,
 * selection, confirms, cell flash) is local here.
 */
export function ComparerWorkspace({
  solutions,
  canManage,
  noun,
  showVersion,
  groupBys,
  run,
  setState,
  enableBulk,
  listUsers,
}: Props) {
  const hostKey = currentEnvKey()
  const envKeys = ENVIRONMENTS.map((e) => e.key)
  // The owner column + owner reassignment need a user search.
  const ownerSupport = !!listUsers

  const releases = useMemo(
    () =>
      solutions.filter(
        (s) => s.kind === 'deployment' && !!s.recordId && !s.solutionMissing,
      ),
    [solutions],
  )

  const { result, comparing } = run

  // Local view state (not persisted).
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyCell, setBusyCell] = useState<string | null>(null)
  const [pending, setPending] = useState<{
    env: { key: string; label: string }
    row: ComparerRow
    desiredOn: boolean
  } | null>(null)
  const [confirming, setConfirming] = useState(false)
  // The cell that just changed — flashes green then fades to its resting colour.
  const [flashCell, setFlashCell] = useState<string | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  const [driftOnly, setDriftOnly] = useState(false)
  const [definitionMode, setDefinitionMode] = useState(true)
  // Filter by the flow's DEFINED status (only used in definition mode).
  const [defStatus, setDefStatus] = useState<'all' | 'on' | 'off'>('all')
  // Group-by choice: null = use the default (first available dimension),
  // '' = explicitly no grouping, otherwise a dimension key.
  const [groupChoice, setGroupChoice] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Multi-select bulk state (selection is local; the run itself is in `run`).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkEnv, setBulkEnv] = useState<string>(hostKey)
  const [bulkPending, setBulkPending] = useState<BulkAction | null>(null)
  const [pickingOwner, setPickingOwner] = useState(false)
  // The penalty-game overlay shown over a running bulk update — opened when a
  // bulk run starts, dismissible ("continue in background") while it runs on.
  const [showGame, setShowGame] = useState(false)

  const solution = releases.find((s) => s.id === run.solutionId) ?? null

  const startCompare = () => {
    if (!solution) return
    setActionError(null)
    setSelected(new Set())
    run.startCompare(solution)
  }

  const confirmToggle = async () => {
    if (!pending) return
    const { env, row, desiredOn } = pending
    setConfirming(true)
    setActionError(null)
    setBusyCell(`${env.key}:${row.id}`)
    try {
      const cell = await setState(env.key, row.id, desiredOn)
      run.applyCell(row.id, env.key, cell)
      setPending(null)
      // Flash the changed cell green, hold it, then fade to its resting colour.
      // Keep this in sync with the `cmp-cell--flash` animation length (3s).
      const key = `${env.key}:${row.id}`
      window.clearTimeout(flashTimer.current)
      setFlashCell(key)
      flashTimer.current = window.setTimeout(() => setFlashCell(null), 3100)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
      setPending(null)
    } finally {
      setConfirming(false)
      setBusyCell(null)
    }
  }

  const hasDefs = !!result?.rows.some((r) => r.definition !== undefined)
  // Drift is measured against the definition when the toggle is on and there is
  // definition data; otherwise against the current environment.
  const driftMode = definitionMode && hasDefs ? 'definition' : 'current'
  const driftCount =
    result?.rows.filter((r) => rowHasDrift(r, hostKey, envKeys, driftMode))
      .length ?? 0
  const q = search.trim().toLowerCase()
  const shown = useMemo(() => {
    if (!result) return null
    let rows = result.rows
    // Two independent filters. Definition-status (definition mode only) narrows
    // to flows with that defined state; drift-only (both modes) narrows to the
    // flows that break with the reference (their definition, or current env).
    if (driftMode === 'definition' && defStatus !== 'all')
      rows = rows.filter((r) =>
        defStatus === 'on'
          ? r.definitionActive === true
          : r.definitionActive === false,
      )
    if (driftOnly)
      rows = rows.filter((r) => rowHasDrift(r, hostKey, envKeys, driftMode))
    if (q)
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.subtitle ?? '').toLowerCase().includes(q),
      )
    return rows === result.rows ? result : { ...result, rows }
  }, [result, driftOnly, defStatus, driftMode, hostKey, envKeys, q])

  // Grouping is offered per dimension only when at least one row carries it
  // (flow: process type is always present; area only when configured + matched;
  // plugin: assembly is always there), so the dropdown never offers a dimension
  // that would yield a single empty "(no …)" group.
  const availableGroupBys = useMemo(
    () => (groupBys ?? []).filter((g) => result?.rows.some((r) => g.get(r))),
    [groupBys, result],
  )
  // Effective grouping dimension: the user's explicit choice when still
  // available, an explicit "None" ('') stays off, otherwise the first available.
  const activeGroup = useMemo(() => {
    if (availableGroupBys.length === 0) return null
    if (groupChoice === '') return null
    if (groupChoice) {
      const chosen = availableGroupBys.find((g) => g.key === groupChoice)
      if (chosen) return chosen
    }
    return availableGroupBys[0]
  }, [availableGroupBys, groupChoice])

  // Multi-select works against the currently-shown rows, so selection always
  // matches what's visible (hidden-but-selected rows are ignored).
  const selectable = !!enableBulk && canManage
  const selectedShown = useMemo(
    () => (shown ? shown.rows.filter((r) => selected.has(r.id)) : []),
    [shown, selected],
  )
  const bulk = run.bulk
  const bulkBusy = !!bulk?.running
  const bulkEnvLabel =
    ENVIRONMENTS.find((e) => e.key === bulkEnv)?.label ?? bulkEnv

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = (checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of shown?.rows ?? [])
        if (checked) next.add(r.id)
        else next.delete(r.id)
      return next
    })

  return (
    <div>
      <div className="validate-toolbar">
        <SolutionSelect
          options={releases}
          value={run.solutionId}
          onChange={(id) => {
            run.setSolutionId(id)
            setSelected(new Set())
            setActionError(null)
          }}
          placeholder="Select a release solution…"
        />
        <button
          className="btn btn--primary"
          disabled={!solution || comparing}
          onClick={startCompare}
        >
          {comparing ? `Comparing… ${run.compareProgress}` : 'Compare'}
        </button>
        {result && result.rows.length > 0 && (
          <input
            className="search"
            type="search"
            placeholder={`Search ${noun}s by name…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        {result && hasDefs && (
          <label
            className="cmp-switch"
            title="On: show the Definition column and measure drift against the defined state. Off: measure drift against the current environment."
          >
            <input
              type="checkbox"
              checked={definitionMode}
              onChange={(e) => setDefinitionMode(e.target.checked)}
            />
            Definition
          </label>
        )}
        {/* Definition-status filter — narrows to a defined state; only shown
            when Definition is on. Independent of the off-definition filter. */}
        {result && driftMode === 'definition' && (
          <label className="cmp-defstatus">
            Definition status
            <select
              value={defStatus}
              onChange={(e) =>
                setDefStatus(e.target.value as 'all' | 'on' | 'off')
              }
            >
              <option value="all">All</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
        )}
        {/* Drift-only filter — shows only the flows that break with the
            reference (their definition in definition mode, else current). */}
        {result && driftCount > 0 && (
          <label className="cmp-driftonly">
            <input
              type="checkbox"
              checked={driftOnly}
              onChange={(e) => setDriftOnly(e.target.checked)}
            />
            {driftMode === 'definition'
              ? `Only off-definition (${driftCount})`
              : `Only status drift (${driftCount})`}
          </label>
        )}
        {availableGroupBys.length > 0 && (
          <label className="cmp-groupby">
            Group by
            <select
              value={activeGroup ? activeGroup.key : ''}
              onChange={(e) => setGroupChoice(e.target.value)}
            >
              {availableGroupBys.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
              <option value="">None</option>
            </select>
          </label>
        )}
        {/* Sync status — last refresh + a manual re-read, shown once loaded. */}
        {result && (
          <span className="cmp-sync">
            <span className="cmp-sync-time muted">
              Last sync:{' '}
              {run.loadedAt ? formatRelative(run.loadedAt.toISOString()) : '—'}
            </span>
            <button
              className="btn btn--small"
              disabled={!solution || comparing}
              onClick={startCompare}
              title="Re-read all environments for this release"
            >
              {comparing ? 'Syncing…' : '⟳ Refresh'}
            </button>
          </span>
        )}
      </div>

      {run.error && <div className="state state--error">{run.error}</div>}
      {actionError && <div className="state state--error">{actionError}</div>}
      {result?.definitionNote && (
        <div className="state">ℹ {result.definitionNote}</div>
      )}

      {result && Object.keys(result.envErrors).length > 0 && (
        <div className="state state--error">
          Some environments could not be read (their cells show “?”):
          <ul className="merge-errors">
            {Object.entries(result.envErrors).map(([key, msg]) => (
              <li key={key}>
                {ENVIRONMENTS.find((e) => e.key === key)?.label ?? key}: {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectable && selectedShown.length > 0 && (
        <div className="cmp-bulkbar">
          <span className="cmp-bulkbar-count">
            {selectedShown.length} selected
          </span>
          <label className="cmp-bulk-target">
            Target
            <select
              value={bulkEnv}
              onChange={(e) => setBulkEnv(e.target.value)}
              disabled={bulkBusy}
            >
              {ENVIRONMENTS.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <div className="cmp-bulk-actions">
            <button
              className="btn btn--small"
              disabled={bulkBusy}
              onClick={() => setBulkPending({ kind: 'activate' })}
            >
              Activate
            </button>
            <button
              className="btn btn--small"
              disabled={bulkBusy}
              onClick={() => setBulkPending({ kind: 'deactivate' })}
            >
              Deactivate
            </button>
            {ownerSupport && (
              <button
                className="btn btn--small"
                disabled={bulkBusy}
                onClick={() => setPickingOwner(true)}
              >
                Change owner…
              </button>
            )}
            <button
              className="cmp-bulk-clear"
              disabled={bulkBusy}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </div>
        </div>
      )}
      {bulk?.running && (
        <div className="state cmp-bulk-progress" aria-live="polite">
          <div className="cmp-bulk-progress-head">
            <span className="sharing-progress-spinner" />
            <span className="cmp-bulk-progress-label">
              {bulk.label || `Processing ${noun}s…`}
            </span>
            <span className="cmp-bulk-progress-pct">
              {bulk.done}/{bulk.total} ·{' '}
              {Math.round((bulk.done / Math.max(1, bulk.total)) * 100)}%
            </span>
          </div>
          <div
            className="cmp-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={bulk.total}
            aria-valuenow={bulk.done}
          >
            <div
              className="cmp-progress-bar"
              style={{
                width: `${(bulk.done / Math.max(1, bulk.total)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
      {bulk && !bulk.running && bulk.results && (
        <div
          className={`state cmp-bulk-result ${
            bulk.results.some((r) => !r.ok && !r.skipped)
              ? 'state--error'
              : 'state--success'
          }`}
        >
          <button
            className="cmp-bulk-result-close"
            aria-label="Dismiss"
            onClick={() => run.dismissBulk()}
          >
            ✕
          </button>
          {(() => {
            const results = bulk.results
            const ok = results.filter((r) => r.ok).length
            const failed = results.filter((r) => !r.ok && !r.skipped)
            const skipped = results.filter((r) => r.skipped).length
            return (
              <>
                {ok} succeeded
                {failed.length ? `, ${failed.length} failed` : ''}
                {skipped
                  ? `, ${skipped} skipped (not in ${bulk.targetEnvLabel})`
                  : ''}
                .
                {failed.length > 0 && (
                  <ul className="merge-errors">
                    {failed.map((r) => (
                      <li key={r.id}>
                        {r.name}: {r.error}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )
          })()}
        </div>
      )}

      {!comparing && result && result.rows.length === 0 && (
        <div className="state">
          No {noun}s found in <strong>{solution?.title}</strong> — the release
          solution contains none, or they couldn’t be read.
        </div>
      )}

      {!comparing &&
        result &&
        result.rows.length > 0 &&
        shown &&
        shown.rows.length === 0 && (
          <div className="state">
            No {noun}s match{' '}
            {q ? (
              <>
                “<strong>{search.trim()}</strong>”
              </>
            ) : (
              'the current filter'
            )}
            .
          </div>
        )}

      {shown && shown.rows.length > 0 && (
        <section className="card cmp-card">
          <p className="muted cmp-hint">
            {result?.rows.length} {noun}
            {result?.rows.length === 1 ? '' : 's'} · matched across environments
            by their id. Highlighted cells differ from{' '}
            <strong>
              {driftMode === 'definition' ? 'the defined state' : 'current'}
            </strong>
            .
            {canManage
              ? ' Turn on/off writes to the selected environment (confirm first).'
              : ' Turning items on/off needs the deployment-manager role.'}
          </p>
          <ComparerMatrix
            result={shown}
            hostKey={hostKey}
            showVersion={showVersion}
            canManage={canManage}
            busyCell={busyCell}
            flashCell={flashCell}
            driftMode={driftMode}
            showDefinition={definitionMode}
            groupKey={
              activeGroup
                ? (r) => activeGroup.get(r) || `(no ${activeGroup.label})`
                : undefined
            }
            groupOrder={activeGroup?.order}
            onToggle={(env, row, desiredOn) => setPending({ env, row, desiredOn })}
            showOwner={ownerSupport}
            selectable={selectable}
            selected={selected}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
          />
        </section>
      )}

      {!comparing && !result && !run.error && (
        <div className="state">
          Pick a <strong>release solution</strong> and hit{' '}
          <strong>Compare</strong> — its {noun}s are read from the current
          environment and looked up in {ENVIRONMENTS.length - 1} target
          environment
          {ENVIRONMENTS.length - 1 === 1 ? '' : 's'}.
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={`${pending.desiredOn ? 'Turn on' : 'Turn off'} ${noun}`}
          confirmLabel={pending.desiredOn ? 'Turn on' : 'Turn off'}
          danger={pending.env.key === 'prod'}
          busy={confirming}
          onConfirm={() => void confirmToggle()}
          onCancel={() => setPending(null)}
          message={
            <>
              <p className="confirm-item">{pending.row.name}</p>
              <p>
                {pending.desiredOn ? 'Activate' : 'Deactivate'} this {noun} in{' '}
                <strong>{pending.env.label}</strong>.
              </p>
              {pending.env.key === 'prod' && (
                <p className="confirm-warn">
                  This is <strong>production</strong> — the change takes effect
                  immediately.
                </p>
              )}
            </>
          }
        />
      )}

      {pickingOwner && listUsers && (
        <UserPickerDialog
          title="Change owner"
          hint={
            <>
              New owner for {selectedShown.length} {noun}
              {selectedShown.length === 1 ? '' : 's'} in{' '}
              <strong>{bulkEnvLabel}</strong>
            </>
          }
          search={(query) => listUsers(bulkEnv, query)}
          onPick={(user) => {
            setPickingOwner(false)
            setBulkPending({ kind: 'owner', user })
          }}
          onClose={() => setPickingOwner(false)}
        />
      )}

      {bulkPending && (
        <ConfirmDialog
          title={
            bulkPending.kind === 'owner'
              ? 'Change owner'
              : bulkPending.kind === 'activate'
                ? `Activate ${noun}s`
                : `Deactivate ${noun}s`
          }
          confirmLabel={
            bulkPending.kind === 'owner'
              ? 'Change owner'
              : bulkPending.kind === 'activate'
                ? 'Activate'
                : 'Deactivate'
          }
          danger={bulkEnv === 'prod'}
          onConfirm={() => {
            // Close the dialog immediately; the progress bar is the indicator.
            const action = bulkPending
            const rows = selectedShown
            setBulkPending(null)
            setSelected(new Set())
            setShowGame(true)
            run.startBulk({
              action,
              rows,
              targetEnvKey: bulkEnv,
              targetEnvLabel: bulkEnvLabel,
            })
          }}
          onCancel={() => setBulkPending(null)}
          message={
            <>
              <p>
                {bulkPending.kind === 'owner' ? (
                  <>
                    Reassign <strong>{selectedShown.length}</strong> {noun}
                    {selectedShown.length === 1 ? '' : 's'} in{' '}
                    <strong>{bulkEnvLabel}</strong> to{' '}
                    <strong>{bulkPending.user.name}</strong>.
                  </>
                ) : (
                  <>
                    {bulkPending.kind === 'activate'
                      ? 'Activate'
                      : 'Deactivate'}{' '}
                    <strong>{selectedShown.length}</strong> {noun}
                    {selectedShown.length === 1 ? '' : 's'} in{' '}
                    <strong>{bulkEnvLabel}</strong>.
                  </>
                )}
              </p>
              <p className="muted">
                Runs one after another; {noun}s not present in {bulkEnvLabel}{' '}
                are skipped.
              </p>
              {bulkEnv === 'prod' && (
                <p className="confirm-warn">
                  This is <strong>production</strong> — changes take effect
                  immediately.
                </p>
              )}
            </>
          }
        />
      )}

      {enableBulk && bulk?.running && showGame && (
        <GameOverlay
          title={`Bulk update in ${bulk.targetEnvLabel}`}
          label={bulk.label}
          done={bulk.done}
          total={bulk.total}
          onMinimize={() => setShowGame(false)}
        />
      )}
    </div>
  )
}
