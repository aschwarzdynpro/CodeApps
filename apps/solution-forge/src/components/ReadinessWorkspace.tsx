import type { WorkingSolution } from '../types/solution'
import type { ReadinessRun } from '../hooks/useReadinessRun'
import { SolutionSelect } from './SolutionSelect'
import { DependencyCheck } from './DependencyCheck'

interface Props {
  solutions: WorkingSolution[]
  /** Lifted selection + run (survive tab navigation). */
  solutionId: string
  onSolutionChange: (id: string) => void
  envKey: 'uat' | 'prod'
  onEnvChange: (envKey: 'uat' | 'prod') => void
  run: ReadinessRun | null
  onCheck: (solution: WorkingSolution, envKey: 'uat' | 'prod') => void
}

/**
 * Deployment Readiness — everything to consider BEFORE deploying a release:
 * currently the dependency check (required components missing in the target).
 * Pick the release, the check then runs against the chosen environment. The
 * run is lifted to App, so it keeps going while navigating away.
 */
export function ReadinessWorkspace({
  solutions,
  solutionId,
  onSolutionChange,
  envKey,
  onEnvChange,
  run,
  onCheck,
}: Props) {
  const releases = solutions.filter(
    (s, index) =>
      s.kind === 'deployment' &&
      !s.solutionMissing &&
      solutions.findIndex((o) => o.id === s.id) === index,
  )
  const solution = releases.find((s) => s.id === solutionId) ?? null
  // The lifted run reflects this view only when it matches the selection.
  const matching =
    run && run.solutionId === solutionId && run.envKey === envKey ? run : null

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
          Select a release solution above — the readiness check then runs
          against the chosen target environment.
        </div>
      ) : (
        <DependencyCheck
          key={`${solutionId}|${envKey}`}
          solution={solution}
          envKey={envKey}
          onEnvChange={onEnvChange}
          run={matching}
          onCheck={() => onCheck(solution, envKey)}
        />
      )}
    </div>
  )
}
