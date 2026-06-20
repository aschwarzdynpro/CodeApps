import { useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import { SolutionSelect } from './SolutionSelect'
import { DependencyCheck } from './DependencyCheck'

interface Props {
  solutions: WorkingSolution[]
}

/**
 * Deployment Readiness — everything to consider BEFORE deploying a release:
 * currently the dependency check (required components missing in the target).
 * Pick the release, the check then runs against the chosen environment.
 */
export function ReadinessWorkspace({ solutions }: Props) {
  const releases = solutions.filter(
    (s, index) =>
      s.kind === 'deployment' &&
      !s.solutionMissing &&
      solutions.findIndex((o) => o.id === s.id) === index,
  )
  const [solutionId, setSolutionId] = useState('')
  const [envKey, setEnvKey] = useState<'uat' | 'prod'>('uat')
  const solution = releases.find((s) => s.id === solutionId) ?? null

  return (
    <div>
      <div className="card compare-controls">
        <div className="compare-picker">
          <span className="form-label">Release solution</span>
          <SolutionSelect
            options={releases}
            value={solutionId}
            onChange={setSolutionId}
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
          onEnvChange={setEnvKey}
        />
      )}
    </div>
  )
}
