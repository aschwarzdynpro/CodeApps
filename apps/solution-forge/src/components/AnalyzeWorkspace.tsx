import { useMemo, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import {
  PHASE_LABELS,
  type DetectivePhaseKey,
} from '../types/detective'
import type { AnalysisRun } from '../hooks/useAnalysisRun'
import { ENVIRONMENTS } from '../config'
import { SolutionSelect } from './SolutionSelect'
import { AnalyzeSummary } from './AnalyzeSummary'
import { CompareWorkbench } from './CompareWorkbench'
import { LayerInspector } from './LayerInspector'
import { AppSharing } from './AppSharing'

interface Props {
  solutions: WorkingSolution[]
  /** Lifted selection + run (survive tab navigation). */
  solutionId: string
  onSolutionChange: (id: string) => void
  envKey: 'uat' | 'prod'
  onEnvChange: (envKey: 'uat' | 'prod') => void
  run: AnalysisRun | null
  onAnalyze: (
    solution: WorkingSolution,
    envKey: 'uat' | 'prod',
    phases: DetectivePhaseKey[],
  ) => void
}

/** The post-deployment checks the Analyze sweep can include. */
const POST_CHECKS: { key: DetectivePhaseKey; label: string }[] = [
  { key: 'compare', label: 'Compare' },
  { key: 'layers', label: 'Layers' },
  { key: 'sharing', label: 'App Sharing' },
]

type SubTab = 'summary' | DetectivePhaseKey

/**
 * Analyze workspace — post-deployment checks for a release solution. Pick the
 * solution, target environment and which checks to run; one sweep feeds a
 * Summary dashboard plus a tab per selected check (Compare, Layers, App
 * Sharing) with the full check content. The run is lifted to App, so it keeps
 * going while navigating away.
 */
export function AnalyzeWorkspace({
  solutions,
  solutionId,
  onSolutionChange,
  envKey,
  onEnvChange,
  run,
  onAnalyze,
}: Props) {
  const releases = solutions.filter(
    (s, index) =>
      s.kind === 'deployment' &&
      !s.solutionMissing &&
      solutions.findIndex((o) => o.id === s.id) === index,
  )
  const solution = releases.find((s) => s.id === solutionId) ?? null
  // Per render (not module-level) so it reflects runtime config from Dataverse.
  const targetEnvs = ENVIRONMENTS.filter(
    (e) => e.key === 'uat' || e.key === 'prod',
  )
  // Analyze compares against a TARGET env; with only the current environment
  // configured there is nothing to compare against, so it is disabled.
  const noTarget = targetEnvs.length === 0

  const [checks, setChecks] = useState<Record<DetectivePhaseKey, boolean>>({
    compare: true,
    layers: true,
    sharing: true,
    dependencies: false,
  })
  const [subTab, setSubTab] = useState<SubTab>('summary')
  // Keep-alive: detail tabs stay mounted once opened so they don't re-run.
  const [openedDetails, setOpenedDetails] = useState<Set<DetectivePhaseKey>>(
    new Set(),
  )

  const envLabel =
    ENVIRONMENTS.find((e) => e.key === envKey)?.label ?? envKey.toUpperCase()

  // The lifted run reflects this view only when it matches the selection.
  const matching =
    run && run.solutionId === solutionId && run.envKey === envKey ? run : null
  const running = matching?.running ?? false
  const done = !!matching && !matching.running && !!matching.result
  const selectedPhases = POST_CHECKS.filter((c) => checks[c.key]).map(
    (c) => c.key,
  )

  const start = () => {
    if (noTarget || !solution || selectedPhases.length === 0) return
    setSubTab('summary')
    setOpenedDetails(new Set())
    onAnalyze(solution, envKey, selectedPhases)
  }

  const openSub = (t: SubTab) => {
    setSubTab(t)
    if (t !== 'summary')
      setOpenedDetails((prev) => new Set(prev).add(t))
  }

  // Tabs to show after a run: Summary + the phases that ran.
  const detailTabs = useMemo(
    () => (matching ? matching.phases.filter((p) => p !== 'dependencies') : []),
    [matching],
  )

  return (
    <div>
      <div className="card analyze-toolbar">
        <div className="analyze-toolbar-pick">
          <span className="form-label">Release solution</span>
          <SolutionSelect
            options={releases}
            value={solutionId}
            onChange={onSolutionChange}
            placeholder="Select a release solution"
          />
        </div>

        <div className="analyze-toolbar-env">
          <span className="form-label">Target</span>
          <div className="chips">
            {noTarget ? (
              <span className="muted">No target environment</span>
            ) : (
              targetEnvs.map((env) => (
                <button
                  key={env.key}
                  className={`chip ${envKey === env.key ? 'chip--active' : ''}`}
                  onClick={() => onEnvChange(env.key as 'uat' | 'prod')}
                >
                  {env.label}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="analyze-toolbar-checks">
          <span className="form-label">Checks</span>
          <div className="chips">
            {POST_CHECKS.map((c) => (
              <label key={c.key} className="check-chip">
                <input
                  type="checkbox"
                  checked={checks[c.key]}
                  onChange={(e) =>
                    setChecks((prev) => ({ ...prev, [c.key]: e.target.checked }))
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <button
          className="btn btn--primary analyze-toolbar-run"
          disabled={noTarget || !solution || selectedPhases.length === 0 || running}
          onClick={start}
        >
          {running ? 'Analyzing…' : done ? '↻ Re-analyze' : '🔍 Analyze'}
        </button>
      </div>

      {noTarget && (
        <div className="state state--warn">
          Analyze compares the release against a <strong>target</strong>{' '}
          environment. Only the current environment is configured — add a
          UAT/PROD target (in the <code>pro_environmentconfig</code> table) to
          enable this.
        </div>
      )}

      {!noTarget && !solution && (
        <div className="state">
          Select a release solution, the target environment and the checks to
          include — the sweep then fills the Summary plus a tab per check.
        </div>
      )}

      {matching?.error && (
        <div className="state state--error">{matching.error}</div>
      )}

      {/* Live phase stepper while the sweep runs. */}
      {solution && matching && matching.running && (
        <ol className="detective-stepper">
          {matching.phases.map((key, i) => {
            const state = matching.phaseStates[key] ?? { key, status: 'pending' }
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

      {/* Result tabs once the sweep finished. */}
      {solution && done && matching.result && (
        <>
          <nav className="subtabs">
            <button
              className={`subtab ${subTab === 'summary' ? 'subtab--active' : ''}`}
              onClick={() => openSub('summary')}
            >
              Summary
            </button>
            {detailTabs.map((p) => (
              <button
                key={p}
                className={`subtab ${subTab === p ? 'subtab--active' : ''}`}
                onClick={() => openSub(p)}
              >
                {PHASE_LABELS[p]}
              </button>
            ))}
          </nav>

          <div hidden={subTab !== 'summary'}>
            <AnalyzeSummary
              solution={solution}
              envLabel={envLabel}
              result={matching.result}
              phaseStates={matching.phaseStates}
              components={matching.components}
              analyzedAt={matching.analyzedAt}
            />
          </div>

          {detailTabs.includes('compare') &&
            openedDetails.has('compare') && (
              <div hidden={subTab !== 'compare'}>
                <CompareWorkbench
                  key={`cmp-${solution.id}-${envKey}`}
                  solution={solution}
                  autoRun
                  targetEnv={envKey}
                />
              </div>
            )}

          {detailTabs.includes('layers') && openedDetails.has('layers') && (
            <div hidden={subTab !== 'layers'}>
              <LayerInspector
                key={`lyr-${solution.id}-${envKey}`}
                solution={solution}
                envKey={envKey}
                onEnvChange={onEnvChange}
                autoRun
              />
            </div>
          )}

          {detailTabs.includes('sharing') &&
            openedDetails.has('sharing') && (
              <div hidden={subTab !== 'sharing'}>
                <AppSharing key={`shr-${solution.id}`} solution={solution} autoRun />
              </div>
            )}
        </>
      )}

      {solution && !running && !done && !matching?.error && (
        <div className="state">
          Run the analysis to compile a deployment risk score, all issues by
          criticality, a component summary and an environment-readiness matrix
          for <strong>{solution.title}</strong> against{' '}
          <strong>{envLabel}</strong> — plus a tab per selected check with its
          full detail.
        </div>
      )}
    </div>
  )
}
