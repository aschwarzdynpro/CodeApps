import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import {
  ALM_KIND_LABELS,
  CONTENT_DIFFABLE_KINDS,
  DEVIATION_LABELS,
  type AlmComponentRef,
  type ComparisonResult,
  type ComparisonRow,
  type DeviationKind,
  type EnvComponentState,
  type EnvKey,
} from '../types/comparison'
import { ENVIRONMENTS } from '../config'
import { comparisonService } from '../services/comparisonService'
import { formatRelative } from '../utils/format'
import { ContentDiffModal } from './ContentDiffModal'

interface Props {
  /** The release solution chosen in the shared Validate selector. */
  solution: WorkingSolution
  /** Run automatically once on mount (used inside the Analyze tabs). */
  autoRun?: boolean
  /** Analyzed target env — the ⇄ diff defaults to DEV vs this env. */
  targetEnv?: 'uat' | 'prod'
}

// Rich ALM type names lead the group order.
const RICH_TYPE_ORDER: string[] = [
  ALM_KIND_LABELS.cloudflow,
  ALM_KIND_LABELS.workflow,
  ALM_KIND_LABELS.businessrule,
  ALM_KIND_LABELS.pluginstep,
  ALM_KIND_LABELS.webresource,
]

/** Compare surfaces cross-environment state: missing + status drift, plus
 *  content drift once the (heavier) content pass has run. */
const COMPARE_DEVIATIONS: DeviationKind[] = ['missing', 'state']

/** Groups with at most this many rows start expanded. */
const AUTO_EXPAND_LIMIT = 12

/**
 * Cross-environment comparison: pick a release solution, its cloud flows,
 * workflows, business rules, plugin steps and scripts are compared across
 * DEV / UAT / PROD. Compare reports presence (missing) and status drift;
 * unmanaged layers and content diffs live in the Layer Inspector.
 */
export function CompareWorkbench({ solution, autoRun, targetEnv }: Props) {
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deviationFilter, setDeviationFilter] = useState<DeviationKind | null>(
    null,
  )
  const [onlyDeviations, setOnlyDeviations] = useState(false)
  const [driftRunning, setDriftRunning] = useState(false)
  const [diffTarget, setDiffTarget] = useState<{
    ref: AlmComponentRef
    envs: EnvKey[]
  } | null>(null)
  // Per-type-group collapse overrides; reset on every fresh result.
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>(
    {},
  )
  const cache = useRef(new Map<string, ComparisonResult>())
  const request = useRef(0)

  // Second pass: hash each diffable component's definition and flag content
  // drift. Heavier than the base compare, so it runs after it (auto inside
  // the Analyze tabs, on-demand via the button otherwise).
  const runDrift = async (base: ComparisonResult) => {
    if (driftRunning) return
    setDriftRunning(true)
    setError(null)
    try {
      const withDrift = await comparisonService.checkContentDrift(
        base,
        (done, total) => setProgress(`Content drift ${done}/${total}`),
      )
      cache.current.set(solution.id, withDrift)
      setResult(withDrift)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDriftRunning(false)
    }
  }

  const run = (force = false) => {
    setResult(null)
    setError(null)
    setDeviationFilter(null)
    setGroupOverrides({})
    const id = solution.id
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
        // Inside the Analyze tabs, run the content pass too so the tab
        // matches the Summary (which already reports content drift).
        if (autoRun) void runDrift(res)
      })
      .catch((err) => {
        if (req !== request.current) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (req === request.current) setLoading(false)
      })
  }

  // Auto-run once when embedded in the Analyze tabs.
  const didAuto = useRef(false)
  useEffect(() => {
    if (!autoRun || didAuto.current) return
    didAuto.current = true
    void Promise.resolve().then(() => run())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // The content pass has run once any cell carries a content hash. Then the
  // "Content drift" chip joins the filters.
  const driftChecked = useMemo(
    () =>
      (result?.rows ?? []).some((r) =>
        ENVIRONMENTS.some((env) => r.byEnv[env.key]?.contentHash != null),
      ),
    [result],
  )
  const deviationKinds: DeviationKind[] = driftChecked
    ? [...COMPARE_DEVIATIONS, 'content']
    : COMPARE_DEVIATIONS

  // DEV-vs-target diff for a content-drift row (diffable kinds only).
  const canDiff = (row: ComparisonRow) =>
    !!row.ref.kind &&
    CONTENT_DIFFABLE_KINDS.has(row.ref.kind) &&
    row.deviations.includes('content')
  const diffEnvsFor = (row: ComparisonRow): EnvKey[] => {
    const dev = row.byEnv.dev?.contentHash
    const differs = (k: EnvKey) => {
      const h = row.byEnv[k]?.contentHash
      return !!h && !!dev && h !== 'error' && dev !== 'error' && h !== dev
    }
    // Prefer the analyzed target env; otherwise the first env that differs.
    const order: ('uat' | 'prod')[] = targetEnv
      ? [targetEnv, ...(['uat', 'prod'] as const).filter((e) => e !== targetEnv)]
      : ['uat', 'prod']
    const pick = order.find((k) => differs(k))
    return ['dev', pick ?? targetEnv ?? 'uat']
  }

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

  return (
    <div>
      <div className="validate-toolbar">
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
        </div>
        {result && !loading ? (
          <div className="compare-toolbar-actions">
            {!driftChecked && (
              <button
                className="btn btn--small"
                disabled={driftRunning}
                onClick={() => void runDrift(result)}
              >
                {driftRunning ? 'Hashing…' : 'Check content drift'}
              </button>
            )}
            <button
              className="btn btn--small"
              disabled={driftRunning}
              onClick={() => run(true)}
            >
              Refresh
            </button>
          </div>
        ) : (
          <button
            className="btn btn--primary"
            disabled={loading}
            onClick={() => run()}
          >
            Compare
          </button>
        )}
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

          {driftRunning && (
            <div className="state">Hashing definitions… {progress}</div>
          )}

          <div className="compare-summary">
            {deviationKinds.map((kind) => (
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
                            {canDiff(row) && (
                              <button
                                className="compare-diff-link"
                                onClick={() =>
                                  setDiffTarget({
                                    ref: row.ref,
                                    envs: diffEnvsFor(row),
                                  })
                                }
                              >
                                ⇄ diff
                              </button>
                            )}
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
          Click <strong>Compare</strong> — {solution.title}'s cloud flows,
          workflows, business rules, plugin steps and scripts are compared
          across DEV, UAT and PROD for presence (missing) and status drift.
        </div>
      )}

      {diffTarget && (
        <ContentDiffModal
          target={diffTarget}
          onClose={() => setDiffTarget(null)}
        />
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
