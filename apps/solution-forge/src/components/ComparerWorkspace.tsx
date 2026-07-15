import { useMemo, useRef, useState } from 'react'
import type { UserRef, WorkingSolution } from '../types/solution'
import type {
  ComparerEnvState,
  ComparerResult,
  ComparerRow,
} from '../types/comparer'
import { recomputeDrift, rowHasDrift } from '../types/comparer'
import { ENVIRONMENTS, currentEnvKey } from '../config'
import { SolutionSelect } from './SolutionSelect'
import { ComparerMatrix } from './ComparerMatrix'
import { ConfirmDialog } from './ConfirmDialog'
import { UserPickerDialog } from './UserPickerDialog'

/** One flow's result inside a serial bulk run. */
interface BulkResult {
  id: string
  name: string
  ok: boolean
  error?: string
  /** Skipped because the flow isn't present in the target environment. */
  skipped?: boolean
}
/** A pending bulk action awaiting confirmation. */
type BulkAction =
  | { kind: 'activate' | 'deactivate' }
  | { kind: 'owner'; user: UserRef }

interface Props {
  solutions: WorkingSolution[]
  canManage: boolean
  /** Singular noun for messages, e.g. "flow" / "plugin step". */
  noun: string
  /** Plugin steps show a version; flows show the modified time. */
  showVersion: boolean
  /** When set (e.g. "assembly"), offer a "Group by <label>" toggle that groups
   *  the rows by their subtitle. */
  groupByLabel?: string
  compare: (
    solution: WorkingSolution,
    onProgress?: (message: string) => void,
  ) => Promise<ComparerResult>
  setState: (
    envKey: string,
    id: string,
    on: boolean,
  ) => Promise<ComparerEnvState>
  /** Enable multi-select + a bulk action bar (Flow Comparer). */
  enableBulk?: boolean
  /** Reassign a flow's owner in one env (enables the owner column + bulk owner
   *  change). Requires `listUsers`. */
  setOwner?: (
    envKey: string,
    id: string,
    userId: string,
  ) => Promise<ComparerEnvState>
  /** Search users in one env for the owner picker. */
  listUsers?: (envKey: string, query: string) => Promise<UserRef[]>
}

/**
 * Shared workspace for the Flow / Plugin comparers: pick a release solution →
 * build the per-environment status matrix → turn items on/off per environment
 * (with a confirm, PROD extra-strong). Parameterised by the two services so the
 * two features are one component.
 */
export function ComparerWorkspace({
  solutions,
  canManage,
  noun,
  showVersion,
  groupByLabel,
  compare,
  setState,
  enableBulk,
  setOwner,
  listUsers,
}: Props) {
  const hostKey = currentEnvKey()
  const envKeys = ENVIRONMENTS.map((e) => e.key)
  // Owner column + owner reassignment require both hooks.
  const ownerSupport = !!setOwner && !!listUsers

  const releases = useMemo(
    () =>
      solutions.filter(
        (s) => s.kind === 'deployment' && !!s.recordId && !s.solutionMissing,
      ),
    [solutions],
  )

  const [solutionId, setSolutionId] = useState('')
  const [result, setResult] = useState<ComparerResult | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
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
  const [grouped, setGrouped] = useState(true)
  const [search, setSearch] = useState('')

  // Multi-select bulk state.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkEnv, setBulkEnv] = useState<string>(hostKey)
  const [bulkPending, setBulkPending] = useState<BulkAction | null>(null)
  const [pickingOwner, setPickingOwner] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<[number, number] | null>(null)
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null)

  const solution = releases.find((s) => s.id === solutionId) ?? null

  const run = async () => {
    if (!solution) return
    setRunning(true)
    setError(null)
    setActionError(null)
    setResult(null)
    setSelected(new Set())
    setBulkResults(null)
    try {
      const res = await compare(solution, setProgress)
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
      setProgress('')
    }
  }

  /** Replace one env cell and recompute the row's drift. */
  const applyCell = (rowId: string, envKey: string, cell: ComparerEnvState) =>
    setResult((prev) => {
      if (!prev) return prev
      const rows = prev.rows.map((r) => {
        if (r.id !== rowId) return r
        const updated: ComparerRow = {
          ...r,
          byEnv: { ...r.byEnv, [envKey]: cell },
        }
        updated.statusDrift = recomputeDrift(updated, hostKey, envKeys)
        return updated
      })
      return { ...prev, rows }
    })

  // A toggle opens the confirm dialog; the write runs on confirm.
  const requestToggle = (
    env: { key: string; label: string },
    row: ComparerRow,
    desiredOn: boolean,
  ) => setPending({ env, row, desiredOn })

  const confirmToggle = async () => {
    if (!pending) return
    const { env, row, desiredOn } = pending
    setConfirming(true)
    setActionError(null)
    setBusyCell(`${env.key}:${row.id}`)
    try {
      const cell = await setState(env.key, row.id, desiredOn)
      applyCell(row.id, env.key, cell)
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

  // Grouping is offered only when there's a dimension to group by AND at least
  // one row carries it (plugin: assembly is always there; flow: only when the
  // area column is configured and matched), so the toggle never shows an empty
  // "(no area)" group.
  const canGroup = !!groupByLabel && !!result?.rows.some((r) => r.subtitle)

  // Multi-select works against the currently-shown rows, so selection always
  // matches what's visible (hidden-but-selected rows are ignored).
  const selectable = !!enableBulk && canManage
  const selectedShown = useMemo(
    () => (shown ? shown.rows.filter((r) => selected.has(r.id)) : []),
    [shown, selected],
  )
  const bulkBusy = bulkProgress !== null
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

  // Run the confirmed bulk action serially over the selected shown flows,
  // against the chosen target environment; skip flows not present there.
  const runBulk = async (action: BulkAction) => {
    const rows = selectedShown
    setActionError(null)
    setBulkResults(null)
    setBulkProgress([0, rows.length])
    const results: BulkResult[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const cell = row.byEnv[bulkEnv]
      if (!cell || !cell.present) {
        results.push({ id: row.id, name: row.name, ok: false, skipped: true })
      } else {
        try {
          const nc =
            action.kind === 'owner'
              ? await setOwner!(bulkEnv, row.id, action.user.id)
              : await setState(bulkEnv, row.id, action.kind === 'activate')
          applyCell(row.id, bulkEnv, nc)
          results.push({ id: row.id, name: row.name, ok: true })
        } catch (err) {
          results.push({
            id: row.id,
            name: row.name,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      setBulkProgress([i + 1, rows.length])
    }
    setBulkResults(results)
    setBulkProgress(null)
    setBulkPending(null)
    setSelected(new Set())
  }

  return (
    <div>
      <div className="validate-toolbar">
        <SolutionSelect
          options={releases}
          value={solutionId}
          onChange={(id) => {
            setSolutionId(id)
            setResult(null)
            setError(null)
            setSelected(new Set())
            setBulkResults(null)
          }}
          placeholder="Select a release solution…"
        />
        <button
          className="btn btn--primary"
          disabled={!solution || running}
          onClick={() => void run()}
        >
          {running ? `Comparing… ${progress}` : 'Compare'}
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
        {canGroup && (
          <label className="cmp-driftonly">
            <input
              type="checkbox"
              checked={grouped}
              onChange={(e) => setGrouped(e.target.checked)}
            />
            Group by {groupByLabel}
          </label>
        )}
      </div>

      {error && <div className="state state--error">{error}</div>}
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
      {bulkProgress && (
        <div className="state cmp-bulk-progress" aria-live="polite">
          <div className="cmp-bulk-progress-head">
            <span className="sharing-progress-spinner" />
            Processing {noun}s… {bulkProgress[0]}/{bulkProgress[1]}
            <span className="cmp-bulk-progress-pct">
              {Math.round(
                (bulkProgress[0] / Math.max(1, bulkProgress[1])) * 100,
              )}
              %
            </span>
          </div>
          <div
            className="cmp-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={bulkProgress[1]}
            aria-valuenow={bulkProgress[0]}
          >
            <div
              className="cmp-progress-bar"
              style={{
                width: `${(bulkProgress[0] / Math.max(1, bulkProgress[1])) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
      {bulkResults && (
        <div
          className={`state ${
            bulkResults.some((r) => !r.ok && !r.skipped)
              ? 'state--error'
              : 'state--success'
          }`}
        >
          {(() => {
            const ok = bulkResults.filter((r) => r.ok).length
            const failed = bulkResults.filter((r) => !r.ok && !r.skipped)
            const skipped = bulkResults.filter((r) => r.skipped).length
            return (
              <>
                {ok} succeeded
                {failed.length ? `, ${failed.length} failed` : ''}
                {skipped
                  ? `, ${skipped} skipped (not in ${bulkEnvLabel})`
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

      {!running && result && result.rows.length === 0 && (
        <div className="state">
          No {noun}s found in <strong>{solution?.title}</strong> — the release
          solution contains none, or they couldn’t be read.
        </div>
      )}

      {!running &&
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

      {!running && shown && shown.rows.length > 0 && (
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
              canGroup && grouped
                ? (r) => r.subtitle || `(no ${groupByLabel})`
                : undefined
            }
            onToggle={requestToggle}
            showOwner={ownerSupport}
            selectable={selectable}
            selected={selected}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
          />
        </section>
      )}

      {!running && !result && !error && (
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
            setBulkPending(null)
            void runBulk(action)
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
    </div>
  )
}
