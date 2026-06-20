import { useMemo, useState } from 'react'
import type { WorkingSolution, SolutionComponentInfo } from '../types/solution'
import {
  PHASE_LABELS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  type DetectiveResult,
  type Finding,
  type PhaseState,
  type Severity,
} from '../types/detective'
import { severityCounts } from '../services/detectiveService'
import {
  buildReadiness,
  buildRecommendations,
  computeRiskScore,
  summarizeComponents,
} from '../services/analysisModel'
import { formatDateTime } from '../utils/format'

interface Props {
  solution: WorkingSolution
  envLabel: string
  result: DetectiveResult
  phaseStates: Record<string, PhaseState>
  components: SolutionComponentInfo[] | null
  analyzedAt: Date | null
}

/** Circumference helper for the SVG gauge (r = 54). */
const GAUGE_R = 54
const GAUGE_C = 2 * Math.PI * GAUGE_R

/** Recommended next step per finding category (when no deep link applies). */
const ACTION_BY_CATEGORY: Record<string, string> = {
  'Missing dependency': 'Add the component to the solution (Deployment Readiness)',
  'Missing in target': 'Deploy the component to the target',
  'Unmanaged in target': 'Remove the unmanaged layer / redeploy managed',
  'Status drift': 'Activate / enable in the target to match DEV',
  'Content drift': 'Open the ⇄ diff in Compare, then redeploy from DEV',
  'Unmanaged layer over managed': 'Remove active customizations in the target',
  'Unmanaged-only component': 'Add the component to a managed solution',
  'Canvas app not shared': 'Share the app with its users / a team',
  'Layer lookup failed': 'Retry — check access to the target environment',
  'Sharing lookup failed': 'Retry — check access to the target environment',
}

/**
 * Summary tab of the Analyze workspace: a single-screen overview compiled
 * from a finished post-deployment sweep — deployment risk score, severity
 * breakdown (clickable as an issue filter), every issue grouped by
 * criticality in collapsible sections, a component summary, recommendations
 * and an environment-readiness matrix.
 */
export function AnalyzeSummary({
  solution,
  envLabel,
  result,
  phaseStates,
  components,
  analyzedAt,
}: Props) {
  // Clicking a severity card filters the issue list to that severity.
  const [severityFilter, setSeverityFilter] = useState<Severity | null>(null)
  // Per-severity collapse overrides (issue groups).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const counts = useMemo(() => severityCounts(result.findings), [result])
  const risk = useMemo(() => computeRiskScore(result.findings), [result])
  const recommendations = useMemo(
    () => buildRecommendations(result.findings, envLabel),
    [result, envLabel],
  )
  const readiness = useMemo(
    () => buildReadiness(result.findings, phaseStates),
    [result, phaseStates],
  )
  const componentSummary = useMemo(
    () => (components ? summarizeComponents(components) : null),
    [components],
  )

  // Issues grouped by severity, honoring the active filter.
  const groups = useMemo(() => {
    const bySev: Record<Severity, Finding[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    }
    for (const f of result.findings) bySev[f.severity].push(f)
    return SEVERITY_ORDER.map((sev) => ({ sev, items: bySev[sev] })).filter(
      (g) => g.items.length > 0,
    )
  }, [result])

  const visibleGroups = severityFilter
    ? groups.filter((g) => g.sev === severityFilter)
    : groups

  // Default: critical/high open, medium/low collapsed — overridable per group.
  const isCollapsed = (sev: Severity) =>
    collapsed[sev] ?? !(sev === 'critical' || sev === 'high')

  const renderIssue = (f: Finding, i: number) => (
    <tr key={`${f.phase}-${f.category}-${i}`}>
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
        ) : ACTION_BY_CATEGORY[f.category] ? (
          <span className="analyze-issue-reco">
            {ACTION_BY_CATEGORY[f.category]}
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  )

  return (
    <div className="analyze">
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
              <dt>Target</dt>
              <dd>{envLabel}</dd>
            </div>
            <div>
              <dt>Analyzed</dt>
              <dd>{analyzedAt ? formatDateTime(analyzedAt.toISOString()) : '—'}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="analyze-grid">
        <div className="analyze-main">
          {/* Risk score + severity issue cards (cards filter the list). */}
          <div className="card analyze-score-card">
            <div className={`risk-gauge risk-gauge--${risk.band}`}>
              <svg viewBox="0 0 128 128" role="img" aria-label="Deployment risk score">
                <circle className="risk-gauge-track" cx="64" cy="64" r={GAUGE_R} />
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
                <button
                  key={sev}
                  className={`severity-card severity-card--${sev} ${
                    severityFilter === sev ? 'severity-card--active' : ''
                  }`}
                  title={`Filter issues to ${SEVERITY_LABELS[sev]}`}
                  disabled={counts[sev] === 0}
                  onClick={() =>
                    setSeverityFilter((prev) => (prev === sev ? null : sev))
                  }
                >
                  <span className="severity-card-count">{counts[sev]}</span>
                  <span className="severity-card-label">
                    {SEVERITY_LABELS[sev]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* All issues, grouped by criticality, collapsible. */}
          <section className="card">
            <h3 className="card-title">
              Issues <span className="muted">({result.findings.length})</span>
              {severityFilter && (
                <button
                  className="btn btn--small analyze-clear-filter"
                  onClick={() => setSeverityFilter(null)}
                >
                  Clear filter ✕
                </button>
              )}
            </h3>
            {result.findings.length === 0 ? (
              <div className="state state--success">
                No issues found across the selected checks for {envLabel}.
              </div>
            ) : (
              visibleGroups.map(({ sev, items }) => {
                const open = !isCollapsed(sev)
                return (
                  <section key={sev} className="issue-group">
                    <button
                      className="issue-group-head"
                      onClick={() =>
                        setCollapsed((prev) => ({ ...prev, [sev]: open }))
                      }
                      aria-expanded={open}
                    >
                      <span className="issue-group-caret">{open ? '▾' : '▸'}</span>
                      <span className={`sev-pill sev-pill--${sev}`}>
                        {SEVERITY_LABELS[sev]}
                      </span>
                      <span className="muted">{items.length}</span>
                    </button>
                    {open && (
                      <table className="analyze-issues">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Issue</th>
                            <th>Check</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>{items.map(renderIssue)}</tbody>
                      </table>
                    )}
                  </section>
                )
              })
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
    </div>
  )
}
