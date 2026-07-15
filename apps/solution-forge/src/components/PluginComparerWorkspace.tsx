import { useCallback } from 'react'
import type { WorkingSolution } from '../types/solution'
import { pluginComparerService } from '../services/pluginComparerService'
import { useLocalComparerRun } from '../hooks/useLocalComparerRun'
import { ComparerWorkspace } from './ComparerWorkspace'

/**
 * Plugin Comparer — a release solution's plugin steps across every environment,
 * with each step's assembly version, per-cell status drift and an enable/disable
 * button (Deployment Manager). Uses a component-local run (no cross-tab
 * persistence / bulk) — those are Flow-Comparer features.
 */
export function PluginComparerWorkspace({
  solutions,
  canManage,
}: {
  solutions: WorkingSolution[]
  canManage: boolean
}) {
  const compare = useCallback(
    (s: WorkingSolution, p?: (m: string) => void) =>
      pluginComparerService.comparePlugins(s, p),
    [],
  )
  const run = useLocalComparerRun(compare)
  return (
    <ComparerWorkspace
      solutions={solutions}
      canManage={canManage}
      noun="plugin step"
      showVersion={true}
      groupByLabel="assembly"
      run={run}
      setState={(env, id, on) => pluginComparerService.setStepState(env, id, on)}
    />
  )
}
