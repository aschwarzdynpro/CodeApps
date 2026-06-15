import { useMemo, useRef, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import {
  ALM_KIND_LABELS,
  DEVIATION_LABELS,
  type ComparisonResult,
  type ComparisonRow,
  type DeviationKind,
  type EnvComponentState,
} from '../types/comparison'
import { ENVIRONMENTS } from '../config'
import { comparisonService } from '../services/comparisonService'
import { formatRelative } from '../utils/format'
import { SolutionSelect } from './SolutionSelect'

interface Props {
  solutions: WorkingSolution[]
  /** Solution preselected in the workbench, if any. */
  initialSolutionId: string | null
}

// Rich ALM type names lead the group order.
const RICH_TYPE_ORDER: string[] = [
  ALM_KIND_LABELS.cloudflow,
  ALM_KIND_LABELS.workflow,
  ALM_KIND_LABELS.businessrule,
  ALM_KIND_LABELS.pluginstep,
  ALM_KIND_LABELS.webresource,
]

/** Compare surfaces cross-environment state: missing + status drift. */
const COMPARE_DEVIATIONS: DeviationKind[] = ['missing', 'state']

/** Groups with at most this many rows start expanded. */
const AUTO_EXPAND_LIMIT = 12

/**
 * Cross-environment comparison: pick a release solution, its cloud flows,
 * workflows, business rules, plugin steps and scripts are compared across
 * DEV / UAT / PROD. Compare reports presence (missing) and status drift;
 * unmanaged layers and content diffs live in the Layer Inspector.
 */
export function CompareWorkbench({
  solutions: allSolutions,
  initialSolutionId,
}: Props) {
  // Release solutions only (consistent with the other ALM tabs); several
  // working-solution records pointing at the same solution collapse to one.
  const solutions = allSolutions.filter(
    (s, index) =>
      s.kind === 'deployment' &&
      !s.solutionMissing &&
      allSolutions.findIndex((o) => o.id === s.id) === index,
  )
  // Carry over the workbench selection (release solutions only); the user
  // starts the comparison with the Compare button.
  const [solutionId, setSolutionId] = useState<string>(
    initialSolutionId && solutions.some((s) => s.id === initialSolutionId)
      ? initialSolutionId
      : '',
  )
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deviationFilter, setDeviationFilter] = useState<DeviationKind | null>(
    null,
  )
  const [onlyDeviations, setOnlyDeviations] = useState(false)
  // Per-type-group collapse overrides; reset on every fresh result.
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>(
    {},
  )
  const cache = useRef(new Map<string, ComparisonResult>())
  const request = useRef(0)

  const run = (id: string, force = false) => {
    setSolutionId(id)
    setResult(null)
    setError(null)
    setDeviationFilter(null)
    setGroupOverrides({})
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

  const deviationCounts = useMemo(() => {
    const counts: Record<DeviationKind, number> = {
      missing: 0,
      state: 0,
      unmanaged: 0,
      content: 0,
    }
    for (const row of result?.rows ?? [])
      for (const d of row.deviations) counts[d]++
    return counts
  }, [result])

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
    const groups = new Map<string, ComparisonRow[]>()
    for (const row of visibleRows) {
      const list = groups.get(row.ref.typeName)
      if (list) list.push(row)
      else groups.set(row.ref.typeName, [row])
    }
    const rank = (typeName: string) => {
      const i = RICH_TYPE_ORDER.indexOf(typeName)
      return i === -1 ? RICH_TYPE_ORDER.length : i
    }
    return [...groups.entries()].sort(
      ([a], [b]) => rank(a) - rank(b) || a.localeCompare(b),
    )
  }, [visibleRows])

  const isExpanded = (typeName: string, count: number) =>
    groupOverrides[typeName] ?? count <= AUTO_EXPAND_LIMIT
  const toggleGroup = (typeName: string, count: number) =>
    setGroupOverrides((prev) => ({
      ...prev,
      [typeName]: !isExpanded(typeName, count),
    }))

  const selectedSolution = solutions.find((s) => s.id === solutionId)

  return (
    <div>
      <div className="card compare-controls">
        <div className="compare-picker">
          <span className="form-label">Release solution</span>
          <SolutionSelect
            options={solutions}
            value={solutionId}
            onChange={(id) => {
              setSolutionId(id)
              setResult(null)
              setError(null)
              setDeviationFilter(null)
              setGroupOverrides({})
            }}
            placeholder="Select a release solution"
          />
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
          {selectedSolution &&
            !loading &&
            (result ? (
              <button
                className="btn btn--small"
                onClick={() => run(solutionId, true)}
              >
                Refresh
              </button>
            ) : (
              <button
                className="btn btn--primary"
                onClick={() => run(solutionId)}
              >
                Compare
              </button>
            ))}
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
            {COMPARE_DEVIATIONS.map((kind) => (
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
              rules, plugin steps or scripts. Use the Layer Inspector for the
              other component types.
            </div>
          )}

          {grouped.map(([typeName, rows]) => {
            const expanded = isExpanded(typeName, rows.length)
            return (
              <section key={typeName} className="card compare-group">
                <button
                  className="component-group-toggle"
                  onClick={() => toggleGroup(typeName, rows.length)}
                  aria-expanded={expanded}
                >
                  <span
                    className={`component-group-chevron ${
                      expanded ? 'component-group-chevron--open' : ''
                    }`}
                  >
                    ▸
                  </span>
                  <span className="component-group-title">{typeName}</span>
                  <span className="muted">({rows.length})</span>
                </button>
                {expanded && (
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
                          className={
                            row.deviations.length ? 'compare-row--drift' : ''
                          }
                        >
                          <td className="compare-name" title={row.ref.objectId}>
                            {row.ref.name}
                            {row.deviations.map((d) => (
                              <span
                                key={d}
                                className={`drift-tag drift-tag--${d}`}
                              >
                                {DEVIATION_LABELS[d]}
                              </span>
                            ))}
                          </td>
                          {ENVIRONMENTS.map((env) => (
                            <td key={env.key}>
                              <CompareCell state={row.byEnv[env.key]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )
          })}
        </>
      )}

      {!loading && !result && !error && (
        <div className="state">
          Select a release solution — its cloud flows, workflows, business
          rules, plugin steps and scripts are compared across DEV, UAT and
          PROD for presence (missing) and status drift.
        </div>
      )}
    </div>
  )
}

function CompareCell({ state }: { state: EnvComponentState | null }) {
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
      {state.modifiedOn && (
        <span className="cell-modified muted">
          {formatRelative(state.modifiedOn)}
        </span>
      )}
    </span>
  )
}
