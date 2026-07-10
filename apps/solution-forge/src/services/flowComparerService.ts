import type { WorkingSolution } from '../types/solution'
import type { ComparerEnvState, ComparerResult } from '../types/comparer'
import { dataverseFlowComparerService } from './dataverseFlowComparerService'

/**
 * Flow Comparer: reads a release solution's cloud flows from the host env and
 * looks each one up — by its import-stable `workflowid` — in every configured
 * environment, into a per-environment status matrix. Also turns a flow on/off
 * in a chosen environment (connector SP write, cross-env). Falls back to the
 * mock outside the Power Platform host.
 */
export interface FlowComparerService {
  compareFlows(
    solution: WorkingSolution,
    onProgress?: (message: string) => void,
  ): Promise<ComparerResult>
  /**
   * Turn a flow on (Activated) or off (Draft) in one environment and return the
   * re-read state of that cell. Runs as the connector SP against the target org.
   */
  setFlowState(
    envKey: string,
    workflowId: string,
    on: boolean,
  ): Promise<ComparerEnvState>
}

export const flowComparerService: FlowComparerService = dataverseFlowComparerService
