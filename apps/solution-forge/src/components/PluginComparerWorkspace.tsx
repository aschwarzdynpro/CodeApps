import type { WorkingSolution } from '../types/solution'
import { pluginComparerService } from '../services/pluginComparerService'
import { ComparerWorkspace } from './ComparerWorkspace'

/**
 * Plugin Comparer — a release solution's plugin steps across every environment,
 * with each step's assembly version, per-cell status drift and an enable/disable
 * button (Deployment Manager).
 */
export function PluginComparerWorkspace({
  solutions,
  canManage,
}: {
  solutions: WorkingSolution[]
  canManage: boolean
}) {
  return (
    <ComparerWorkspace
      solutions={solutions}
      canManage={canManage}
      noun="plugin step"
      showVersion={true}
      compare={(s, p) => pluginComparerService.comparePlugins(s, p)}
      setState={(env, id, on) => pluginComparerService.setStepState(env, id, on)}
    />
  )
}
