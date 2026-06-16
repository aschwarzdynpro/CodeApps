import { useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import { ENVIRONMENTS } from '../config'
import { SolutionSelect } from './SolutionSelect'
import { CompareWorkbench } from './CompareWorkbench'
import { DependencyCheck } from './DependencyCheck'
import { LayerInspector } from './LayerInspector'
import { AppSharing } from './AppSharing'

export type ValidateTab = 'compare' | 'dependencies' | 'layers' | 'sharing'

interface Props {
  tab: ValidateTab
  solutions: WorkingSolution[]
}

const targetEnvs = ENVIRONMENTS.filter(
  (e) => e.key === 'uat' || e.key === 'prod',
)

/** Checks that target a single environment (UAT/PROD) — they show the toggle. */
const ENV_TABS = new Set<ValidateTab>(['dependencies', 'layers'])

/**
 * Shared selection for the Validate checks: one release-solution picker (plus
 * a target-env toggle for Dependencies / Layers) feeds whichever check is
 * active, so the selection stays put while switching between the tools. Each
 * check still runs on demand and keeps its own results; changing the selection
 * remounts the active check (via the key) so stale results clear.
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
  const usesEnv = ENV_TABS.has(tab)
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
        {usesEnv && (
          <div className="chips" title="Target environment for this check">
            {targetEnvs.map((env) => (
              <button
                key={env.key}
                className={`chip ${envKey === env.key ? 'chip--active' : ''}`}
                onClick={() => setEnvKey(env.key as 'uat' | 'prod')}
              >
                {env.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!solution ? (
        <div className="state">
          Select a release solution above — the check then runs across the
          environments (the selection stays put as you switch between Compare,
          Dependencies, Layers and App Sharing).
        </div>
      ) : tab === 'compare' ? (
        <CompareWorkbench key={selKey} solution={solution} />
      ) : tab === 'dependencies' ? (
        <DependencyCheck key={selKey} solution={solution} envKey={envKey} />
      ) : tab === 'layers' ? (
        <LayerInspector key={selKey} solution={solution} envKey={envKey} />
      ) : (
        <AppSharing key={selKey} solution={solution} />
      )}
    </div>
  )
}
