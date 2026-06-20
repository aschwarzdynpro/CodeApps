import type { WorkingSolution } from '../types/solution'
import type { AnalysisRun } from '../hooks/useAnalysisRun'
import { SolutionSelect } from './SolutionSelect'
import { AnalyzeDashboard } from './AnalyzeDashboard'
import { CompareWorkbench } from './CompareWorkbench'
import { DependencyCheck } from './DependencyCheck'
import { LayerInspector } from './LayerInspector'
import { AppSharing } from './AppSharing'

export type ValidateTab =
  | 'analyze'
  | 'compare'
  | 'dependencies'
  | 'layers'
  | 'sharing'

interface Props {
  tab: ValidateTab
  solutions: WorkingSolution[]
  /** Shared selection, lifted to App so it survives tab navigation. */
  solutionId: string
  onSolutionChange: (id: string) => void
  envKey: 'uat' | 'prod'
  onEnvChange: (envKey: 'uat' | 'prod') => void
  /** Lifted Analyze run + starter (keeps running across navigation). */
  analysisRun: AnalysisRun | null
  onAnalyze: (solution: WorkingSolution, envKey: 'uat' | 'prod') => void
}

/**
 * Shared selection for the Validate checks: one release-solution picker feeds
 * whichever check is active, so the selection stays put while switching
 * between the tools. The selection (and the Analyze run) live in App, so they
 * survive navigating away. Changing the solution or env remounts the active
 * check (via the key) so stale results clear; each check runs on demand.
 */
export function ValidateWorkspace({
  tab,
  solutions,
  solutionId,
  onSolutionChange,
  envKey,
  onEnvChange,
  analysisRun,
  onAnalyze,
}: Props) {
  const releases = solutions.filter(
    (s, index) =>
      s.kind === 'deployment' &&
      !s.solutionMissing &&
      solutions.findIndex((o) => o.id === s.id) === index,
  )
  const solution = releases.find((s) => s.id === solutionId) ?? null
  const selKey = `${solutionId}|${envKey}`

  return (
    <div>
      <div className="card compare-controls">
        <div className="compare-picker">
          <span className="form-label">Release solution</span>
          <SolutionSelect
            options={releases}
            value={solutionId}
            onChange={onSolutionChange}
            placeholder="Select a release solution"
          />
        </div>
      </div>

      {!solution ? (
        <div className="state">
          Select a release solution above — the check then runs across the
          environments (the selection stays put as you switch between Analyze,
          Compare, Dependencies, Layers and App Sharing).
        </div>
      ) : tab === 'analyze' ? (
        <AnalyzeDashboard
          solution={solution}
          envKey={envKey}
          onEnvChange={onEnvChange}
          run={analysisRun}
          onRun={() => onAnalyze(solution, envKey)}
        />
      ) : tab === 'compare' ? (
        <CompareWorkbench key={selKey} solution={solution} />
      ) : tab === 'dependencies' ? (
        <DependencyCheck
          key={selKey}
          solution={solution}
          envKey={envKey}
          onEnvChange={onEnvChange}
        />
      ) : tab === 'layers' ? (
        <LayerInspector
          key={selKey}
          solution={solution}
          envKey={envKey}
          onEnvChange={onEnvChange}
        />
      ) : (
        <AppSharing key={selKey} solution={solution} />
      )}
    </div>
  )
}
