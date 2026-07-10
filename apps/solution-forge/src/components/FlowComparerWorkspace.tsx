import type { WorkingSolution } from '../types/solution'
import { flowComparerService } from '../services/flowComparerService'
import { ComparerWorkspace } from './ComparerWorkspace'

/**
 * Flow Comparer — a release solution's cloud flows across every environment,
 * with per-cell status drift, a Power Automate deep-link and a turn on/off
 * button (Deployment Manager).
 */
export function FlowComparerWorkspace({
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
      noun="flow"
      showVersion={false}
      groupByLabel="area"
      compare={(s, p) => flowComparerService.compareFlows(s, p)}
      setState={(env, id, on) => flowComparerService.setFlowState(env, id, on)}
    />
  )
}
