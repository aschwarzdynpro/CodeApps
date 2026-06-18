import { useMemo, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import type { EnvKey } from '../types/comparison'
import {
  PHASE_HINTS,
  PHASE_LABELS,
  PHASE_ORDER,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  type DetectivePhaseKey,
  type DetectiveResult,
  type Finding,
  type PhaseState,
  type Severity,
} from '../types/detective'
import { ENVIRONMENTS } from '../config'
import { runInvestigation, severityCounts } from '../services/detectiveService'
import { SolutionSelect } from './SolutionSelect'

interface Props {
  solutions: WorkingSolution[]
}

const TARGET_ENVS = ENVIRONMENTS.filter((e) => e.key === 'uat' || e.key === 'prod')

/**
 * ALM Detective: a phased pre-deployment investigation. Runs the selected
 * ALM checks against a release solution, lighting up a phase stepper as it
 * goes, then compiles the findings into a single report ranked by
 * criticality.
 */
export function AlmDetective({ solutions }: Props) {
  // Release solutions only — the Detective is a pre-deployment audit.
  const candidates = solutions.filter(
    (s, index) =>
      s.kind === 'deployment' &&
      !s.solutionMissing &&
      solutions.findIndex((o) => o.id === s.id) === index,
  )

  const [solutionId, setSolutionId] = useState('')
  const [targetEnv, setTargetEnv] = useState<'uat' | 'prod'>('prod')
  const [phases, setPhases] = useState<Set<DetectivePhaseKey>>(
    new Set(PHASE_ORDER),
  )
  const [running, setRunning] = useState(false)
  const [phaseStates, setPhaseStates] = useState<Record<
    string,
    PhaseState
  > | null>(null)
  const [result, setResult] = useState<DetectiveResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<Severity | null>(null)

  const solution = candidates.find((s) => s.id === solutionId) ?? null
  const selectedPhases = PHASE_ORDER.filter((p) => phases.has(p))

  const togglePhase = (key: DetectivePhaseKey) =>
    setPhases((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const run = async () => {
    if (!solution || selectedPhases.length === 0) return
    setRunning(true)
    setResult(null)
    setError(null)
    setSeverityFilter(null)
    const init: Record<string, PhaseState> = {}
    for (const key of selectedPhases) init[key] = { key, status: 'pending' }
    setPhaseStates(init)
    try {
      const res = await runInvestigation({
        solution,
        targetEnv,
        phases: selectedPhases,
        onPhase: (state) =>
          setPhaseStates((prev) => ({ ...(prev ?? {}), [state.key]: state })),
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const counts = useMemo(
    () => (result ? severityCounts(result.findings) : null),
    [result],
  )

  const visibleFindings = useMemo(() => {
    const list = result?.findings ?? []
    return severityFilter
      ? list.filter((f) => f.severity === severityFilter)
      : list
  }, [result, severityFilter])

  const grouped = useMemo(() => {
    const groups = new Map<Severity, Finding[]>()
    for (const sev of SEVERITY_ORDER) groups.set(sev, [])
    for (const f of visibleFindings) groups.get(f.severity)?.push(f)
    return [...groups.entries()].filter(([, list]) => list.length > 0)
  }, [visibleFindings])

  const envLabel = (key?: EnvKey) =>
    key ? (ENVIRONMENTS.find((e) => e.key === key)?.label ?? key.toUpperCase()) : ''

  const verdict = useMemo(() => {
    if (!counts) return null
    if (counts.critical > 0)
      return {
        tone: 'error' as const,
        text: `Not deployment-ready — ${counts.critical} critical issue${
          counts.critical === 1 ? '' : 's'
        } would block or break the deployment.`,
      }
    if (counts.high > 0)
      return {
        tone: 'error' as const,
        text: `Review needed — ${counts.high} high-severity finding${
          counts.high === 1 ? '' : 's'
        } before deploying.`,
      }
    if ((result?.findings.length ?? 0) > 0)
      return {
        tone: 'plain' as const,
        text: 'Only minor findings — review and proceed.',
      }
    return {
      tone: 'success' as const,
      text: 'Clean — no findings across the selected checks.',
    }
  }, [counts, result])

  return (
    <div>
      <div className="card detective-config">
        <div className="compare-picker">
          <span className="form-label">Release solution</span>
          <SolutionSelect
            options={candidates}
            value={solutionId}
            onChange={(id) => {
              setSolutionId(id)
              setResult(null)
              setError(null)
              setPhaseStates(null)
            }}
            placeholder="Select a release solution…"
          />
        </div>

        <div className="detective-options">
          <div className="detective-target">
            <span className="form-label">Deployment target</span>
            <div className="chips">
              {TARGET_ENVS.map((env) => (
                <button
                  key={env.key}
                  className={`chip ${targetEnv === env.key ? 'chip--active' : ''}`}
                  onClick={() => setTargetEnv(env.key as 'uat' | 'prod')}
                >
                  {env.label}
                </button>
              ))}
            </div>
            <span className="detective-target-hint muted">
              every check audits the release against this environment
            </span>
          </div>

          <div className="phase-checks">
            <span className="form-label">Checks</span>
            {PHASE_ORDER.map((key) => (
              <label key={key} className="phase-check">
                <input
                  type="checkbox"
                  checked={phases.has(key)}
                  onChange={() => togglePhase(key)}
                />
                <span className="phase-check-body">
                  <span className="phase-check-name">{PHASE_LABELS[key]}</span>
                  <span className="phase-check-hint muted">
                    {PHASE_HINTS[key]}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <button
            className="btn btn--primary detective-run"
            disabled={!solution || selectedPhases.length === 0 || running}
            onClick={() => void run()}
          >
            {running ? 'Investigating…' : '🔍 Run Investigation'}
          </button>
        </div>
      </div>

      {error && <div className="state state--error">{error}</div>}

      {phaseStates && (
        <ol className="detective-stepper">
          {selectedPhases.map((key, i) => {
            const state = phaseStates[key] ?? { key, status: 'pending' }
            return (
              <li
                key={key}
                className={`det-step det-step--${state.status}`}
              >
                <span className="det-step-icon">
                  {state.status === 'running' ? (
                    <span className="det-spinner" />
                  ) : state.status === 'done' ? (
                    '✓'
                  ) : state.status === 'failed' ? (
                    '✕'
                  ) : state.status === 'skipped' ? (
                    '–'
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="det-step-body">
                  <span className="det-step-name">{PHASE_LABELS[key]}</span>
                  <span className="det-step-status muted">
                    {state.status === 'running' &&
                      (state.message || 'Running…')}
                    {state.status === 'done' &&
                      `${state.findings ?? 0} finding${
                        (state.findings ?? 0) === 1 ? '' : 's'
                      }`}
                    {state.status === 'skipped' && (state.note || 'Skipped')}
                    {state.status === 'failed' && (state.note || 'Failed')}
                    {state.status === 'pending' && 'Queued'}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {!running && result && counts && verdict && (
        <>
          <div
            className={`state detective-verdict ${
              verdict.tone === 'error'
                ? 'state--error'
                : verdict.tone === 'success'
                  ? 'state--success'
                  : ''
            }`}
          >
            {verdict.text}
          </div>

          {result.findings.length > 0 && (
            <>
              <div className="compare-summary detective-summary">
                {SEVERITY_ORDER.map((sev) => (
                  <button
                    key={sev}
                    className={`chip sev-chip sev-chip--${sev} ${
                      severityFilter === sev ? 'chip--active' : ''
                    }`}
                    disabled={counts[sev] === 0}
                    onClick={() =>
                      setSeverityFilter((prev) => (prev === sev ? null : sev))
                    }
                  >
                    {SEVERITY_LABELS[sev]}
                    <span className="chip-count">{counts[sev]}</span>
                  </button>
                ))}
              </div>

              {grouped.map(([sev, list]) => (
                <section key={sev} className="card detective-group">
                  <h3 className="card-title">
                    <span className={`sev-dot sev-dot--${sev}`} />
                    {SEVERITY_LABELS[sev]}{' '}
                    <span className="muted">({list.length})</span>
                  </h3>
                  <ul className="finding-list">
                    {list.map((f, i) => (
                      <li key={`${sev}-${i}`} className="finding-row">
                        <span className={`sev-pill sev-pill--${sev}`}>
                          {f.category}
                        </span>
                        <span className="finding-main">
                          <span className="finding-subject">{f.subject}</span>
                          {f.detail && (
                            <span className="finding-detail muted">
                              {f.detail}
                            </span>
                          )}
                        </span>
                        {f.link && (
                          <a
                            className="finding-link"
                            href={f.link.href}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Open the app in the maker portal to share it"
                          >
                            {f.link.label}
                          </a>
                        )}
                        {f.env && (
                          <span className="finding-env">{envLabel(f.env)}</span>
                        )}
                        <span className="finding-phase muted">
                          {PHASE_LABELS[f.phase]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </>
      )}

      {!running && !result && !error && !phaseStates && (
        <div className="state">
          Pick a release solution, choose the deployment target and the checks
          to run, then start the investigation. Each check runs as a phase;
          the findings are compiled into one report ranked by criticality.
        </div>
      )}
    </div>
  )
}
