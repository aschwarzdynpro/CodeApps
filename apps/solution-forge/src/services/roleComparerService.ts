/**
 * Cross-environment Role Comparer.
 *
 * This is an ORCHESTRATOR, not a data path — the same arrangement as the ALM
 * Detective (`detectiveService.ts`): it loads the existing per-environment
 * security-model snapshot through {@link roleAnalyzerService} and hands the
 * models to the pure functions in `utils/roleCompare.ts`. Consequences worth
 * knowing:
 *
 * - No new Dataverse reads, no new data source. Everything rides on the
 *   analyzer's connector queries and its ~15-minute per-environment cache, so
 *   a repeat comparison (or opening the Role Analyzer afterwards) is instant.
 * - No own mock. It inherits whatever `roleAnalyzerService` resolves to, which
 *   falls back to the mock offline — that is why `mockRoleAnalyzerService`
 *   returns a per-environment VARIANT of its model: without that, the offline
 *   demo would show a comparison with zero drift, which is worse than no demo.
 * - Reads run as the connector service principal (like the analyzer), so the
 *   workspace is gated as a whole.
 *
 * Environments are loaded SEQUENTIALLY. Each snapshot is a handful of paged
 * FetchXML sweeps, and doing them one environment at a time keeps the progress
 * message meaningful and avoids stacking three parallel sweeps onto one
 * connector.
 */

import { ENVIRONMENTS, currentEnvKey } from '../config'
import type { SecurityModel } from '../types/roles'
import type { RoleComparerResult } from '../types/roleComparer'
import { buildRoleComparison } from '../utils/roleCompare'
import { roleAnalyzerService } from './roleAnalyzerService'

export interface RoleComparerService {
  /**
   * Load the security model of every given environment and build the
   * comparison. A single environment failing does NOT fail the run — it lands
   * in `envErrors` and its column stays "unknown", because reporting an
   * unreadable environment as "identical" would be a false all-clear.
   */
  compare(
    envKeys: string[],
    onProgress?: (message: string) => void,
    force?: boolean,
  ): Promise<RoleComparerResult>
  /** The environments offered for comparison (host first). */
  listEnvKeys(): string[]
  /**
   * The models of the last run, for the drill-down. Kept here rather than
   * re-derived so opening a role costs nothing.
   */
  lastModels(): Record<string, SecurityModel | null>
}

let lastModels: Record<string, SecurityModel | null> = {}

/** Host environment first, then the rest in configured order. */
function orderedEnvKeys(): string[] {
  const host = currentEnvKey()
  const keys = ENVIRONMENTS.map((e) => e.key)
  return [
    ...keys.filter((k) => k.toLowerCase() === host.toLowerCase()),
    ...keys.filter((k) => k.toLowerCase() !== host.toLowerCase()),
  ]
}

export const roleComparerService: RoleComparerService = {
  listEnvKeys: orderedEnvKeys,

  lastModels: () => lastModels,

  async compare(envKeys, onProgress, force) {
    const models: Record<string, SecurityModel | null> = {}
    const envErrors: Record<string, string> = {}

    for (const envKey of envKeys) {
      try {
        onProgress?.(`Loading security model — ${envKey}…`)
        models[envKey] = await roleAnalyzerService.loadModel(
          envKey,
          (message) => onProgress?.(`${envKey}: ${message}`),
          force,
        )
      } catch (error) {
        models[envKey] = null
        envErrors[envKey] =
          error instanceof Error ? error.message : String(error)
        console.warn('[roleCompare] environment failed', envKey, error)
      }
    }

    lastModels = models
    onProgress?.('Comparing…')
    return buildRoleComparison({
      models,
      envKeys,
      hostKey: currentEnvKey(),
      envErrors,
      loadedAt: new Date(),
    })
  },
}
