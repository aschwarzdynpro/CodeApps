import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import {
  ALM_KIND_LABELS,
  DEVIATION_LABELS,
  type AlmComponentKind,
  type ComparisonResult,
  type ComparisonRow,
  type DeviationKind,
  type EnvComponentState,
  type EnvKey,
} from '../types/comparison'
import { ENVIRONMENTS } from '../config'
import { comparisonService } from '../services/comparisonService'
import { formatRelative } from '../utils/format'

interface Props {
  solutions: WorkingSolution[]
  /** Solution preselected in the workbench, if any. */
  initialSolutionId: string | null
}

const KIND_ORDER: AlmComponentKind[] = [
  'cloudflow',
  'workflow',
  'businessrule',
  'pluginstep',
  'webresource',
]

/**
 * Cross-environment ALM comparison: pick a solution, the ALM-relevant
 * components are resolved and their state compared across DEV / UAT / PROD.
 * Deviations (missing, status drift, unmanaged in target) are highlighted
 * and filterable.
 */
export function CompareWorkbench({
  solutions: allSolutions,
  initialSolutionId,
}: Props) {
  // Rows without a resolvable real solution have no components to compare,
  // and several working-solution records pointing at the same solution
  // collapse to one entry — the comparison works on the solution itself.
  const solutions = allSolutions.filter(
    (s, index) =>
      !s.solutionMissing &&
      allSolutions.findIndex((o) => o.id === s.id) === index,
  )
  const [solutionId, setSolutionId] = useState<string>(initialSolutionId ?? '')
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deviationFilter, setDeviationFilter] = useState<DeviationKind | null>(
    null,
  )
  const [onlyDeviations, setOnlyDeviations] = useState(false)
  const cache = useRef(new Map<string, ComparisonResult>())
  const request = useRef(0)

  const run = (id: string, force = false) => {
    setSolutionId(id)
    setResult(null)
    setError(null)
    setDeviationFilter(null)
    if (!id) return
    if (!force) {
      const cached = cache.current.get(id)
      if (cached) {
        setResult(cached)
        return
      }
    }
    const req = ++request.current
    setLoading(true)
    setProgress('Starting…')
    comparisonService
      .compareSolution(id, (msg) => {
        if (req === request.current) setProgress(msg)
      })
      .then((res) => {
        if (req !== request.current) return
        cache.current.set(id, res)
        setResult(res)
      })
      .catch((err) => {
        if (req !== request.current) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (req === request.current) setLoading(false)
      })
  }

  // Kick off the comparison for the solution carried over from the
  // workbench when the tab opens. Mount-only by design — later switches go
  // through the picker.
  useEffect(() => {
    // Async kick-off drives loading/result state as it resolves (same
    // pattern as useSolutions' initial load).
    if (!initialSolutionId || !solutions.some((s) => s.id === initialSolutionId))
      return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run(initialSolutionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const deviationCounts = useMemo(() => {
    const counts: Record<DeviationKind, number> = {
      missing: 0,
      state: 0,
      unmanaged: 0,
    }
    for (const row of result?.rows ?? [])
      for (const d of row.deviations) counts[d]++
    return counts
  }, [result])

  // "In sync" requires a verdict from every environment — rows with
  // unknown cells (failed queries) don't count.
  const inSyncCount = useMemo(
    () =>
      (result?.rows ?? []).filter(
        (r) =>
          r.deviations.length === 0 &&
          ENVIRONMENTS.every((env) => r.byEnv[env.key] !== null),
      ).length,
    [result],
  )

  const visibleRows = useMemo(() => {
    let rows = result?.rows ?? []
    if (deviationFilter)
      rows = rows.filter((r) => r.deviations.includes(deviationFilter))
    else if (onlyDeviations) rows = rows.filter((r) => r.deviations.length > 0)
    return rows
  }, [result, deviationFilter, onlyDeviations])

  const grouped = useMemo(() => {
    const groups = new Map<AlmComponentKind, ComparisonRow[]>()
    for (const kind of KIND_ORDER) groups.set(kind, [])
    for (const row of visibleRows) groups.get(row.ref.kind)?.push(row)
    return [...groups.entries()].filter(([, rows]) => rows.length > 0)
  }, [visibleRows])

  const selectedSolution = solutions.find((s) => s.id === solutionId)

  return (
    <div>
      <div className="card compare-controls">
        <div className="compare-picker">
          <span className="form-label">Solution</span>
          <select
            value={solutionId}
            onChange={(e) => run(e.target.value)}
          >
            <option value="">Select a solution to compare…</option>
            {solutions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.uniqueName})
              </option>
            ))}
          </select>
        </div>
        <div className="compare-envs">
          {ENVIRONMENTS.map((env) => (
            <span
              key={env.key}
              className={`env-chip ${result?.envErrors[env.key] ? 'env-chip--error' : ''}`}
              title={`${env.url}${result?.envErrors[env.key] ? ` — ${result.envErrors[env.key]}` : ''}`}
            >
              {env.label}
            </span>
          ))}
          {selectedSolution && !loading && (
            <button
              className="btn btn--small"
              onClick={() => run(solutionId, true)}
            >
              Refresh
            </button>
          )}
        </div>
      </div>

      {loading && <div className="state">Comparing… {progress}</div>}
      {error && <div className="state state--error">{error}</div>}

      {!loading && result && (
        <>
          {Object.entries(result.envErrors).map(([key, message]) => (
            <div key={key} className="state state--error">
              {ENVIRONMENTS.find((e) => e.key === key)?.label}: {message} —
              affected cells show “?”.
            </div>
          ))}

          <div className="compare-summary">
            {(Object.keys(DEVIATION_LABELS) as DeviationKind[]).map((kind) => (
              <button
                key={kind}
                className={`chip chip--deviation-${kind} ${
                  deviationFilter === kind ? 'chip--active' : ''
                }`}
                onClick={() =>
                  setDeviationFilter((prev) => (prev === kind ? null : kind))
                }
              >
                {DEVIATION_LABELS[kind]}
                <span className="chip-count">{deviationCounts[kind]}</span>
              </button>
            ))}
            <span className="chip chip--static">
              In sync<span className="chip-count">{inSyncCount}</span>
            </span>
            <label className="search-scope">
              <input
                type="checkbox"
                checked={onlyDeviations}
                onChange={(e) => {
                  setOnlyDeviations(e.target.checked)
                  setDeviationFilter(null)
                }}
              />
              only deviations
            </label>
          </div>

          {result.rows.length === 0 && (
            <div className="state">
              This solution contains no cloud flows, workflows, business
              rules, plugin steps or scripts.
            </div>
          )}

          {grouped.map(([kind, rows]) => (
            <section key={kind} className="card compare-group">
              <h3 className="card-title">
                {ALM_KIND_LABELS[kind]}{' '}
                <span className="muted">({rows.length})</span>
              </h3>
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    {ENVIRONMENTS.map((env) => (
                      <th key={env.key}>{env.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.ref.objectId}
                      className={row.deviations.length ? 'compare-row--drift' : ''}
                    >
                      <td className="compare-name" title={row.ref.objectId}>
                        {row.ref.name}
                        {row.deviations.map((d) => (
                          <span key={d} className={`drift-tag drift-tag--${d}`}>
                            {DEVIATION_LABELS[d]}
                          </span>
                        ))}
                      </td>
                      {ENVIRONMENTS.map((env) => (
                        <td key={env.key}>
                          <CompareCell
                            state={row.byEnv[env.key]}
                            envKey={env.key}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}

      {!loading && !result && !error && (
        <div className="state">
          Select a solution — its cloud flows, workflows, business rules,
          plugin steps and scripts are compared across DEV, UAT and PROD.
        </div>
      )}
    </div>
  )
}

function CompareCell({
  state,
  envKey,
}: {
  state: EnvComponentState | null
  envKey: EnvKey
}) {
  if (!state) return <span className="cell-unknown">?</span>
  if (!state.present) return <span className="cell-missing">Missing</span>
  return (
    <span className="cell-state">
      {state.stateLabel ? (
        <span
          className={`state-pill ${
            state.active ? 'state-pill--on' : 'state-pill--off'
          }`}
        >
          {state.stateLabel}
        </span>
      ) : (
        <span className="state-pill state-pill--neutral">Present</span>
      )}
      {envKey !== 'dev' && state.isManaged === false && (
        <span className="state-pill state-pill--unmanaged">unmanaged</span>
      )}
      {state.modifiedOn && (
        <span className="cell-modified muted">
          {formatRelative(state.modifiedOn)}
        </span>
      )}
    </span>
  )
}
