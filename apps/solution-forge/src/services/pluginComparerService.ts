import type { WorkingSolution } from '../types/solution'
import type { ComparerEnvState, ComparerResult } from '../types/comparer'
import { dataversePluginComparerService } from './dataversePluginComparerService'

/**
 * Plugin Comparer: reads a release solution's plugin (SDK message processing)
 * steps from the host env — with each step's plugin-assembly version — and
 * looks each step up by its import-stable `sdkmessageprocessingstepid` in every
 * configured environment, into a per-environment status/version matrix. Also
 * enables/disables a step in a chosen environment (connector SP write). Falls
 * back to the mock outside the Power Platform host.
 */
export interface PluginComparerService {
  comparePlugins(
    solution: WorkingSolution,
    onProgress?: (message: string) => void,
  ): Promise<ComparerResult>
  /**
   * Enable or disable a plugin step in one environment and return the re-read
   * state of that cell. Runs as the connector SP against the target org.
   */
  setStepState(
    envKey: string,
    stepId: string,
    on: boolean,
  ): Promise<ComparerEnvState>
}

export const pluginComparerService: PluginComparerService =
  dataversePluginComparerService
