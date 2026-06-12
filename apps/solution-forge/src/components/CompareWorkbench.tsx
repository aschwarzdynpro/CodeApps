import { useEffect, useMemo, useRef, useState } from 'react'
import { diffLines } from 'diff'
import type { WorkingSolution } from '../types/solution'
import {
  ALM_KIND_LABELS,
  CONTENT_DIFFABLE_KINDS,
  DEVIATION_LABELS,
  type AlmComponentKind,
  type AlmComponentRef,
  type ComparisonResult,
  type ComparisonRow,
  type ContentPair,
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

/** Deviations surfaced by the first (state) pass — content is opt-in. */
const BASE_DEVIATIONS: DeviationKind[] = ['missing', 'state', 'unmanaged']

const presentEnvKeys = (row: ComparisonRow): EnvKey[] =>
  ENVIRONMENTS.filter((e) => row.byEnv[e.key]?.present).map((e) => e.key)

/**
 * Cross-environment ALM comparison: pick a solution, the ALM-relevant
 * components are resolved and their state compared across DEV / UAT / PROD.
 * Deviations (missing, status drift, unmanaged in target) are highlighted
 * and filterable; an opt-in second pass hashes each component's definition
 * to surface content drift with a side-by-side diff.
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
  // Content-drift pass state, keyed implicitly by the loaded solution.
  const [contentChecked, setContentChecked] = useState(false)
  const [contentChecking, setContentChecking] = useState(false)
  const [contentProgress, setContentProgress] = useState<[number, number] | null>(
    null,
  )
  const [diffTarget, setDiffTarget] = useState<{
    ref: AlmComponentRef
    envs: EnvKey[]
  } | null>(null)
  const cache = useRef(new Map<string, ComparisonResult>())
  const contentDone = useRef(new Set<string>())
  const request = useRef(0)

  const run = (id: string, force = false) => {
    setSolutionId(id)
    setResult(null)
    setError(null)
    setDeviationFilter(null)
    setContentChecking(false)
    setContentProgress(null)
    if (!id) return
    if (force) contentDone.current.delete(id)
    setContentChecked(contentDone.current.has(id))
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

  const runContentCheck = () => {
    if (!result || !solutionId) return
    const req = ++request.current
    setContentChecking(true)
    setContentProgress([0, 0])
    comparisonService
      .checkContentDrift(result, (done, total) => {
        if (req === request.current) setContentProgress([done, total])
      })
      .then((res) => {
        if (req !== request.current) return
        cache.current.set(solutionId, res)
        contentDone.current.add(solutionId)
        setResult(res)
        setContentChecked(true)
      })
      .catch((err) => {
        if (req !== request.current) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (req === request.current) {
          setContentChecking(false)
          setContentProgress(null)
        }
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
            {BASE_DEVIATIONS.map((kind) => (
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
            {contentChecked ? (
              <button
                className={`chip chip--deviation-content ${
                  deviationFilter === 'content' ? 'chip--active' : ''
                }`}
                onClick={() =>
                  setDeviationFilter((prev) =>
                    prev === 'content' ? null : 'content',
                  )
                }
              >
                {DEVIATION_LABELS.content}
                <span className="chip-count">{deviationCounts.content}</span>
              </button>
            ) : (
              <button
                className="btn btn--small"
                disabled={contentChecking}
                onClick={runContentCheck}
                title="Hash each flow / workflow / business rule / web resource definition across the environments and flag content differences."
              >
                {contentChecking
                  ? contentProgress
                    ? `Checking content… ${contentProgress[0]}/${contentProgress[1]}`
                    : 'Checking content…'
                  : 'Check content drift'}
              </button>
            )}
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
                  {rows.map((row) => {
                    const diffable =
                      CONTENT_DIFFABLE_KINDS.has(row.ref.kind) &&
                      presentEnvKeys(row).length >= 2
                    return (
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
                          {diffable && (
                            <button
                              className="diff-link"
                              title="Diff this definition across two environments"
                              onClick={() =>
                                setDiffTarget({
                                  ref: row.ref,
                                  envs: presentEnvKeys(row),
                                })
                              }
                            >
                              ⇄ diff
                            </button>
                          )}
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
                    )
                  })}
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

      {diffTarget && (
        <ContentDiffModal
          target={diffTarget}
          onClose={() => setDiffTarget(null)}
        />
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

/** One aligned line of the side-by-side diff. */
interface DiffLine {
  left: string | null
  right: string | null
  kind: 'same' | 'change' | 'add' | 'del'
}

/** Split a jsdiff chunk into lines, dropping the trailing empty element. */
function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Align jsdiff line parts into left/right rows for a side-by-side view. */
function buildSideBySide(a: string, b: string): DiffLine[] {
  const parts = diffLines(a, b)
  const rows: DiffLine[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part.added && !part.removed) {
      for (const line of splitLines(part.value))
        rows.push({ left: line, right: line, kind: 'same' })
    } else if (part.removed && parts[i + 1]?.added) {
      const left = splitLines(part.value)
      const right = splitLines(parts[i + 1].value)
      const n = Math.max(left.length, right.length)
      for (let j = 0; j < n; j++)
        rows.push({
          left: left[j] ?? null,
          right: right[j] ?? null,
          kind: 'change',
        })
      i++ // consume the paired added part
    } else if (part.removed) {
      for (const line of splitLines(part.value))
        rows.push({ left: line, right: null, kind: 'del' })
    } else {
      for (const line of splitLines(part.value))
        rows.push({ left: null, right: line, kind: 'add' })
    }
  }
  return rows
}

function ContentDiffModal({
  target,
  onClose,
}: {
  target: { ref: AlmComponentRef; envs: EnvKey[] }
  onClose: () => void
}) {
  const { ref, envs } = target
  const [envA, setEnvA] = useState<EnvKey>(envs[0])
  const [envB, setEnvB] = useState<EnvKey>(envs[1] ?? envs[0])
  const [pair, setPair] = useState<ContentPair | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const req = useRef(0)

  useEffect(() => {
    const id = ++req.current
    // Reset to the loading state for the new env pair, then fetch (same
    // data-loading effect pattern as the workbench's initial compare).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    setPair(null)
    comparisonService
      .fetchContentPair(ref, envA, envB)
      .then((p) => {
        if (id === req.current) setPair(p)
      })
      .catch((err) => {
        if (id === req.current)
          setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (id === req.current) setLoading(false)
      })
  }, [ref, envA, envB])

  const rows = useMemo(() => {
    if (!pair || pair.a.text === null || pair.b.text === null) return null
    return buildSideBySide(pair.a.text, pair.b.text)
  }, [pair])

  const labelOf = (key: EnvKey) =>
    ENVIRONMENTS.find((e) => e.key === key)?.label ?? key.toUpperCase()
  const identical = rows?.every((r) => r.kind === 'same') ?? false

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card modal--wide diff-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="diff-title">{ref.name}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="diff-env-row">
          <EnvPicker value={envA} options={envs} onChange={setEnvA} />
          <span className="diff-vs">vs</span>
          <EnvPicker value={envB} options={envs} onChange={setEnvB} />
        </div>

        {loading && <div className="state">Loading definitions…</div>}
        {error && <div className="state state--error">{error}</div>}

        {!loading && !error && pair && (
          <>
            {(pair.a.binary || pair.b.binary) && (
              <div className="state">
                Binary content — showing size only.{' '}
                {labelOf(envA)}: {pair.a.size ?? 0} bytes · {labelOf(envB)}:{' '}
                {pair.b.size ?? 0} bytes ·{' '}
                {pair.a.size === pair.b.size ? 'same size' : 'different size'}.
              </div>
            )}
            {!pair.a.present || !pair.b.present ? (
              <div className="state">
                Present in only one of the two selected environments —
                nothing to diff. Pick two environments that both have it.
              </div>
            ) : rows ? (
              <>
                {identical && (
                  <div className="state state--success">
                    Definitions are identical in {labelOf(envA)} and{' '}
                    {labelOf(envB)}.
                  </div>
                )}
                <div className={`diff-view diff-view--${pair.language}`}>
                  <div className="diff-col-head">{labelOf(envA)}</div>
                  <div className="diff-col-head">{labelOf(envB)}</div>
                  {rows.map((line, i) => (
                    <DiffRow key={i} line={line} />
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function EnvPicker({
  value,
  options,
  onChange,
}: {
  value: EnvKey
  options: EnvKey[]
  onChange: (key: EnvKey) => void
}) {
  return (
    <select
      className="diff-env-select"
      value={value}
      onChange={(e) => onChange(e.target.value as EnvKey)}
    >
      {options.map((key) => (
        <option key={key} value={key}>
          {ENVIRONMENTS.find((e) => e.key === key)?.label ?? key.toUpperCase()}
        </option>
      ))}
    </select>
  )
}

function DiffRow({ line }: { line: DiffLine }) {
  const leftClass =
    line.kind === 'del' || line.kind === 'change' ? 'diff-cell--del' : ''
  const rightClass =
    line.kind === 'add' || line.kind === 'change' ? 'diff-cell--add' : ''
  return (
    <>
      <pre className={`diff-cell ${line.left === null ? 'diff-cell--empty' : leftClass}`}>
        {line.left ?? ''}
      </pre>
      <pre className={`diff-cell ${line.right === null ? 'diff-cell--empty' : rightClass}`}>
        {line.right ?? ''}
      </pre>
    </>
  )
}
