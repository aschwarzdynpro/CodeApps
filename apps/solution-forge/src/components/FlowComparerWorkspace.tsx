import type { WorkingSolution } from '../types/solution'
import { flowComparerService } from '../services/flowComparerService'
import { useFlowRun } from '../hooks/useFlowRun'
import { ComparerWorkspace } from './ComparerWorkspace'

/**
 * Flow Comparer — a release solution's cloud flows across every environment,
 * with per-cell status drift, owner, a Power Automate deep-link, per-cell and
 * bulk turn on/off + owner reassignment (Deployment Manager). The run is a
 * module singleton (`useFlowRun`), so the result and any bulk run survive
 * navigating to other tabs and surface in the global activity bar.
 */
export function FlowComparerWorkspace({
  solutions,
  canManage,
}: {
  solutions: WorkingSolution[]
  canManage: boolean
}) {
  const run = useFlowRun()
  return (
    <ComparerWorkspace
      solutions={solutions}
      canManage={canManage}
      noun="flow"
      showVersion={false}
      groupByLabel="area"
      enableBulk
      run={run}
      setState={(env, id, on) => flowComparerService.setFlowState(env, id, on)}
      listUsers={(env, query) => flowComparerService.listUsers(env, query)}
    />
  )
}
