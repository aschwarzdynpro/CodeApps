import type { WorkingSolution } from '../types/solution'
import { flowComparerService } from '../services/flowComparerService'
import { useFlowRun } from '../hooks/useFlowRun'
import { PROCESS_TYPE_ORDER } from '../utils/processType'
import { ComparerWorkspace } from './ComparerWorkspace'

/**
 * Flow Comparer — a release solution's processes (cloud flows, classic
 * workflows, business rules, actions, business process flows) across every
 * environment, with per-cell status drift, owner, a Power Automate deep-link
 * (cloud flows), per-cell and bulk turn on/off + owner reassignment (Deployment
 * Manager). Rows group by process type (default) or, when a definition area is
 * configured, by area. The run is a module singleton (`useFlowRun`), so the
 * result and any bulk run survive navigating to other tabs and surface in the
 * global activity bar.
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
      noun="process"
      showVersion={false}
      groupBys={[
        {
          key: 'type',
          label: 'process type',
          get: (r) => r.processType,
          order: PROCESS_TYPE_ORDER,
        },
        { key: 'area', label: 'area', get: (r) => r.subtitle },
      ]}
      enableBulk
      run={run}
      setState={(env, id, on) => flowComparerService.setFlowState(env, id, on)}
      listUsers={(env, query) => flowComparerService.listUsers(env, query)}
    />
  )
}
