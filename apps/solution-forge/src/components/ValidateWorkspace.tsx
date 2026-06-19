import { useState } from 'react'
import type { WorkingSolution } from '../types/solution'
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
}

/**
 * Shared selection for the Validate checks: one release-solution picker feeds
 * whichever check is active, so the selection stays put while switching
 * between the tools. The target-env toggle (Dependencies / Layers) lives in
 * each check's own toolbar but is backed by the shared envKey here, so it's
 * consistent across the two. Changing the solution or env remounts the active
 * check (via the key) so stale results clear; each check runs on demand.
 */
export function ValidateWorkspace({ tab, solutions }: Props) {
  const releases = solutions.filter(
    (s, index) =>
      s.kind === 'deployment' &&
      !s.solutionMissing &&
      solutions.findIndex((o) => o.id === s.id) === index,
  )
  const [solutionId, setSolutionId] = useState('')
  const [envKey, setEnvKey] = useState<'uat' | 'prod'>('uat')

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
            onChange={setSolutionId}
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
          key={selKey}
          solution={solution}
          envKey={envKey}
          onEnvChange={setEnvKey}
        />
      ) : tab === 'compare' ? (
        <CompareWorkbench key={selKey} solution={solution} />
      ) : tab === 'dependencies' ? (
        <DependencyCheck
          key={selKey}
          solution={solution}
          envKey={envKey}
          onEnvChange={setEnvKey}
        />
      ) : tab === 'layers' ? (
        <LayerInspector
          key={selKey}
          solution={solution}
          envKey={envKey}
          onEnvChange={setEnvKey}
        />
      ) : (
        <AppSharing key={selKey} solution={solution} />
      )}
    </div>
  )
}
