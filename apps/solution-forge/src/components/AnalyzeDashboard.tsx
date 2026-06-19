import { useMemo, useState } from 'react'
import type { WorkingSolution, SolutionComponentInfo } from '../types/solution'
import {
  PHASE_LABELS,
  PHASE_ORDER,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  type DetectiveResult,
  type Finding,
  type PhaseState,
} from '../types/detective'
import { ENVIRONMENTS } from '../config'
import { runInvestigation, severityCounts } from '../services/detectiveService'
import { solutionService } from '../services/solutionService'
import {
  buildReadiness,
  buildRecommendations,
  computeRiskScore,
  summarizeComponents,
} from '../services/analysisModel'
import { formatDateTime } from '../utils/format'

interface Props {
  /** Release solution + target env from the shared Validate selector. */
  solution: WorkingSolution
  envKey: 'uat' | 'prod'
  onEnvChange: (envKey: 'uat' | 'prod') => void
}

const targetEnvs = ENVIRONMENTS.filter(
  (e) => e.key === 'uat' || e.key === 'prod',
)

/** Highest-severity findings shown in the Key Issues table. */
const KEY_ISSUE_LIMIT = 8

/** Circumference helper for the SVG gauge (r = 54). */
const GAUGE_R = 54
const GAUGE_C = 2 * Math.PI * GAUGE_R

/**
 * Analyze dashboard — a single-screen "Solution Analysis" overview for a
 * release solution. It runs the full ALM Detective sweep (Dependencies,
 * Compare incl. content drift, Layers, App Sharing) against the selected
 * target environment and compiles the findings into a deployment risk score,
 * a severity breakdown, the key issues, a component summary, derived
 * recommendations and an environment-readiness matrix — the at-a-glance
 * companion to the focused Compare / Dependencies / Layers / Sharing tabs.
 */
export function AnalyzeDashboard({ solution, envKey, onEnvChange }: Props) {
  const [running, setRunning] = useState(false)
  const [phaseStates, setPhaseStates] = useState<Record<
    string,
    PhaseState
  > | null>(null)
  const [result, setResult] = useState<DetectiveResult | null>(null)
  const [components, setComponents] = useState<SolutionComponentInfo[] | null>(
    null,
  )
  const [analyzedAt, setAnalyzedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const envLabel =
    ENVIRONMENTS.find((e) => e.key === envKey)?.label ?? envKey.toUpperCase()

  const run = async () => {
    setRunning(true)
    setResult(null)
    setComponents(null)
    setError(null)
    const init: Record<string, PhaseState> = {}
    for (const key of PHASE_ORDER) init[key] = { key, status: 'pending' }
    setPhaseStates(init)
    try {
      // The component summary is independent of the phases — fetch it in
      // parallel with the investigation so the dashboard fills in one pass.
      const [res, comps] = await Promise.all([
        runInvestigation({
          solution,
          targetEnv: envKey,
          phases: PHASE_ORDER,
          onPhase: (state) =>
            setPhaseStates((prev) => ({ ...(prev ?? {}), [state.key]: state })),
        }),
        solutionService.listComponents(solution.id).catch(() => [] as SolutionComponentInfo[]),
      ])
      setResult(res)
      setComponents(comps)
      setAnalyzedAt(new Date())
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
  const risk = useMemo(
    () => (result ? computeRiskScore(result.findings) : null),
    [result],
  )
  const recommendations = useMemo(
    () => (result ? buildRecommendations(result.findings, envLabel) : []),
    [result, envLabel],
  )
  const readiness = useMemo(
    () => (result && phaseStates ? buildReadiness(result.findings, phaseStates) : []),
    [result, phaseStates],
  )
  const componentSummary = useMemo(
    () => (components ? summarizeComponents(components) : null),
    [components],
  )
  const keyIssues = useMemo(
    () => result?.findings.slice(0, KEY_ISSUE_LIMIT) ?? [],
    [result],
  )

  const renderKeyIssue = (f: Finding, i: number) => (
    <tr key={`${f.phase}-${f.category}-${i}`}>
      <td>
        <span className={`sev-pill sev-pill--${f.severity}`}>
          {SEVERITY_LABELS[f.severity]}
        </span>
      </td>
      <td className="analyze-issue-category">{f.category}</td>
      <td>
        <span className="analyze-issue-subject">{f.subject}</span>
        {f.detail && (
          <span className="analyze-issue-detail muted">{f.detail}</span>
        )}
      </td>
      <td className="analyze-issue-phase muted">{PHASE_LABELS[f.phase]}</td>
      <td className="analyze-issue-action">
        {f.link ? (
          <a href={f.link.href} target="_blank" rel="noreferrer">
            {f.link.label}
          </a>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  )

  return (
    <div className="analyze">
      {/* Report header — solution metadata, target env, run command. */}
      <div className="card analyze-header">
        <div className="analyze-meta">
          <h2 className="analyze-title">{solution.title}</h2>
          <dl className="analyze-meta-grid">
            <div>
              <dt>Unique name</dt>
              <dd>
                <code>{solution.uniqueName}</code>
              </dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{solution.isManaged ? 'Managed' : 'Unmanaged'}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{solution.version || '—'}</dd>
            </div>
            <div>
              <dt>Publisher</dt>
              <dd>{solution.publisher?.friendlyName ?? '—'}</dd>
            </div>
            <div>
              <dt>Analyzed</dt>
              <dd>{analyzedAt ? formatDateTime(analyzedAt.toISOString()) : '—'}</dd>
            </div>
          </dl>
        </div>
        <div className="analyze-controls">
          <div className="chips" title="Target environment for the analysis">
            {targetEnvs.map((env) => (
              <button
                key={env.key}
                className={`chip ${envKey === env.key ? 'chip--active' : ''}`}
                onClick={() => onEnvChange(env.key as 'uat' | 'prod')}
              >
                {env.label}
              </button>
            ))}
          </div>
          <button
            className="btn btn--primary"
            disabled={running}
            onClick={() => void run()}
          >
            {running
              ? 'Analyzing…'
              : result
                ? '↻ Re-analyze'
                : '🔍 Run Analysis'}
          </button>
        </div>
      </div>

      {error && <div className="state state--error">{error}</div>}

      {/* Live phase stepper while the sweep runs. */}
      {running && phaseStates && (
        <ol className="detective-stepper">
          {PHASE_ORDER.map((key, i) => {
            const state = phaseStates[key] ?? { key, status: 'pending' }
            return (
              <li key={key} className={`det-step det-step--${state.status}`}>
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
                    {state.status === 'running' && (state.message || 'Running…')}
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

      {!running && result && counts && risk && (
        <div className="analyze-grid">
          <div className="analyze-main">
            {/* Risk score + severity issue cards. */}
            <div className="card analyze-score-card">
              <div className={`risk-gauge risk-gauge--${risk.band}`}>
                <svg viewBox="0 0 128 128" role="img" aria-label="Deployment risk score">
                  <circle
                    className="risk-gauge-track"
                    cx="64"
                    cy="64"
                    r={GAUGE_R}
                  />
                  <circle
                    className="risk-gauge-arc"
                    cx="64"
                    cy="64"
                    r={GAUGE_R}
                    strokeDasharray={GAUGE_C}
                    strokeDashoffset={GAUGE_C * (1 - risk.score / 100)}
                    transform="rotate(-90 64 64)"
                  />
                  <text className="risk-gauge-value" x="64" y="60">
                    {risk.score}
                  </text>
                  <text className="risk-gauge-unit" x="64" y="80">
                    / 100
                  </text>
                </svg>
                <div className="risk-gauge-caption">
                  <span className="risk-gauge-label">Deployment Risk Score</span>
                  <span className={`risk-band risk-band--${risk.band}`}>
                    {risk.label}
                  </span>
                </div>
              </div>

              <div className="severity-cards">
                {SEVERITY_ORDER.map((sev) => (
                  <div key={sev} className={`severity-card severity-card--${sev}`}>
                    <span className="severity-card-count">{counts[sev]}</span>
                    <span className="severity-card-label">
                      {SEVERITY_LABELS[sev]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Key issues. */}
            <section className="card">
              <h3 className="card-title">
                Key Issues{' '}
                <span className="muted">({result.findings.length})</span>
              </h3>
              {result.findings.length === 0 ? (
                <div className="state state--success">
                  No issues found across the four checks for {envLabel}.
                </div>
              ) : (
                <>
                  <table className="analyze-issues">
                    <thead>
                      <tr>
                        <th>Severity</th>
                        <th>Category</th>
                        <th>Issue</th>
                        <th>Check</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>{keyIssues.map(renderKeyIssue)}</tbody>
                  </table>
                  {result.findings.length > keyIssues.length && (
                    <p className="muted analyze-more">
                      Showing the {keyIssues.length} highest-severity issues.
                      Open the Compare, Dependencies, Layers and App Sharing
                      tabs for the full detail.
                    </p>
                  )}
                </>
              )}
            </section>

            {/* Component summary. */}
            {componentSummary && (
              <section className="card">
                <h3 className="card-title">
                  Solution Components{' '}
                  <span className="muted">({componentSummary.total})</span>
                </h3>
                {componentSummary.types.length === 0 ? (
                  <p className="muted">No components in this solution.</p>
                ) : (
                  <div className="component-tiles">
                    {componentSummary.types.map((t) => (
                      <div key={t.typeName} className="component-tile">
                        <span className="component-tile-count">{t.count}</span>
                        <span className="component-tile-label">{t.typeName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Right rail: recommendations + environment readiness. */}
          <aside className="analyze-rail">
            <section className="card">
              <h3 className="card-title">Recommendations</h3>
              <ul className="reco-list">
                {recommendations.map((r) => (
                  <li key={r.id} className="reco-item">
                    <span className={`sev-dot sev-dot--${r.severity}`} />
                    <span className="reco-text">{r.text}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card">
              <h3 className="card-title">Environment Readiness</h3>
              <p className="reco-target muted">
                Target: <strong>{envLabel}</strong>
              </p>
              <ul className="readiness-list">
                {readiness.map((row) => (
                  <li key={row.phase} className="readiness-row">
                    <span className="readiness-label">{row.label}</span>
                    <span
                      className={`readiness-status readiness-status--${row.status}`}
                    >
                      {row.status === 'ok'
                        ? '✓ Compatible'
                        : row.status === 'attention'
                          ? `⚠ ${row.note}`
                          : row.status === 'failed'
                            ? '✕ Failed'
                            : '– N/A'}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="readiness-overall">
                <span>Overall Readiness</span>
                <span className={`readiness-overall-value risk-band--${risk.band}`}>
                  {risk.score}%
                </span>
              </div>
            </section>
          </aside>
        </div>
      )}

      {!running && !result && !error && (
        <div className="state">
          Run the analysis to compile a deployment risk score, the key issues,
          a component summary and an environment-readiness matrix for{' '}
          <strong>{solution.title}</strong> against <strong>{envLabel}</strong>.
          It runs the Dependencies, Compare (incl. content drift), Layers and
          App Sharing checks in one sweep.
        </div>
      )}
    </div>
  )
}
