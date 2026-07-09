import { useMemo, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import type {
  ComparerEnvState,
  ComparerResult,
  ComparerRow,
} from '../types/comparer'
import { hasDefinitionMismatch, recomputeDrift } from '../types/comparer'
import { ENVIRONMENTS, currentEnvKey } from '../config'
import { SolutionSelect } from './SolutionSelect'
import { ComparerMatrix } from './ComparerMatrix'
import { ConfirmDialog } from './ConfirmDialog'

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
}: Props) {
  const hostKey = currentEnvKey()
  const envKeys = ENVIRONMENTS.map((e) => e.key)

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
  const [driftOnly, setDriftOnly] = useState(false)
  const [offDefOnly, setOffDefOnly] = useState(false)
  const [grouped, setGrouped] = useState(true)

  const solution = releases.find((s) => s.id === solutionId) ?? null

  const run = async () => {
    if (!solution) return
    setRunning(true)
    setError(null)
    setActionError(null)
    setResult(null)
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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
      setPending(null)
    } finally {
      setConfirming(false)
      setBusyCell(null)
    }
  }

  const driftCount = result?.rows.filter((r) => r.statusDrift).length ?? 0
  const hasDefs = !!result?.rows.some((r) => r.definition !== undefined)
  const offDefCount =
    result?.rows.filter((r) => hasDefinitionMismatch(r, envKeys)).length ?? 0
  const shown = useMemo(() => {
    if (!result) return null
    let rows = result.rows
    if (driftOnly) rows = rows.filter((r) => r.statusDrift)
    if (offDefOnly) rows = rows.filter((r) => hasDefinitionMismatch(r, envKeys))
    return rows === result.rows ? result : { ...result, rows }
  }, [result, driftOnly, offDefOnly, envKeys])

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
        {result && driftCount > 0 && (
          <label className="cmp-driftonly">
            <input
              type="checkbox"
              checked={driftOnly}
              onChange={(e) => setDriftOnly(e.target.checked)}
            />
            Only status drift ({driftCount})
          </label>
        )}
        {result && hasDefs && offDefCount > 0 && (
          <label className="cmp-driftonly">
            <input
              type="checkbox"
              checked={offDefOnly}
              onChange={(e) => setOffDefOnly(e.target.checked)}
            />
            Only off-definition ({offDefCount})
          </label>
        )}
        {result && groupByLabel && (
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

      {!running && result && result.rows.length === 0 && (
        <div className="state">
          No {noun}s found in <strong>{solution?.title}</strong> — the release
          solution contains none, or they couldn’t be read.
        </div>
      )}

      {!running && shown && shown.rows.length > 0 && (
        <section className="card cmp-card">
          <p className="muted cmp-hint">
            {result?.rows.length} {noun}
            {result?.rows.length === 1 ? '' : 's'} · matched across environments
            by their id. Highlighted cells differ in status from{' '}
            <strong>current</strong>.
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
            groupKey={
              groupByLabel && grouped
                ? (r) => r.subtitle || `(no ${groupByLabel})`
                : undefined
            }
            onToggle={requestToggle}
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
    </div>
  )
}
