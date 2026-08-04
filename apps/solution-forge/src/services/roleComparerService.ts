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
import type { RoleSummary, SecurityModel } from '../types/roles'
import type { RoleComparerResult } from '../types/roleComparer'
import { buildRoleComparison, roleMatchKey } from '../utils/roleCompare'
import { roleAnalyzerService } from './roleAnalyzerService'
import { solutionService } from './solutionService'

/** What the caller wants compared — decided BEFORE the expensive load. */
export interface RoleCompareScope {
  /** Include roles that are managed in every environment (the OOB ones). */
  includeSystem: boolean
  /**
   * Root role ids of the selected solution's role components, or null for no
   * solution scope. These are HOST ids; the service resolves them to names via
   * the host role list, because names are what matches across environments.
   */
  limitToRoleIds?: string[] | null
}

export interface RoleComparerService {
  /**
   * Load the privilege matrices of every given environment and build the
   * comparison. A single environment failing does NOT fail the run — it lands
   * in `envErrors` and its column stays "unknown", because reporting an
   * unreadable environment as "identical" would be a false all-clear.
   *
   * TWO PHASES, because the scope decides what is worth loading:
   *  1. the role LIST of every environment (one cheap query each),
   *  2. privileges for the roles the scope keeps — typically a few dozen of
   *     ~286, i.e. one chunked sweep instead of eight.
   */
  compare(
    envKeys: string[],
    scope: RoleCompareScope,
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
  /**
   * Object ids of the security-role components (component type 20) of one
   * solution in the HOST environment — the scope selector's input. Reuses
   * `solutionService.listMergeComponents`, i.e. the raw `solutioncomponent`
   * membership, so no new data path is involved.
   */
  listSolutionRoleIds(solutionId: string): Promise<string[]>
}

/** componenttype of a security role — same constant the Core Role Extractor
 *  uses when it captures a new role via AddSolutionComponent. */
const ROLE_COMPONENT_TYPE = 20

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

  async listSolutionRoleIds(solutionId) {
    const components = await solutionService.listMergeComponents(solutionId)
    return components
      .filter((c) => c.typeCode === ROLE_COMPONENT_TYPE)
      .map((c) => c.objectId)
  },

  async compare(envKeys, scope, onProgress, force) {
    const models: Record<string, SecurityModel | null> = {}
    const envErrors: Record<string, string> = {}

    // --- Phase 1: the role lists (cheap) -----------------------------------
    const summaries = new Map<string, RoleSummary[]>()
    for (const envKey of envKeys) {
      try {
        onProgress?.(`Listing roles — ${envKey}…`)
        summaries.set(
          envKey,
          await roleAnalyzerService.listRoleSummaries(envKey, force),
        )
      } catch (error) {
        envErrors[envKey] =
          error instanceof Error ? error.message : String(error)
        console.warn('[roleCompare] listing roles failed', envKey, error)
      }
    }

    // Solution membership arrives as HOST role ids; names are what matches
    // across environments, so resolve them here — phase 1 already has the list.
    let solutionKeys: Set<string> | null = null
    if (scope.limitToRoleIds) {
      const hostKey = currentEnvKey()
      const byId = new Map(
        (summaries.get(hostKey) ?? []).map((role) => [
          role.rootRoleId.toLowerCase(),
          roleMatchKey(role.name),
        ]),
      )
      solutionKeys = new Set(
        scope.limitToRoleIds
          .map((id) => byId.get(id.toLowerCase()))
          .filter((key): key is string => !!key),
      )
    }

    /*
     * Which role NAMES are worth the privilege sweep. "Custom" is decided
     * across ALL environments: a role managed in DEV but unmanaged in PROD is
     * custom for our purposes, and deciding per environment would drop it from
     * DEV — turning a managed-state finding into a phantom "missing in DEV".
     */
    const wantedKeys = new Set<string>()
    for (const roles of summaries.values()) {
      for (const role of roles) {
        const key = roleMatchKey(role.name)
        if (solutionKeys && !solutionKeys.has(key)) continue
        if (!scope.includeSystem && role.isManaged) continue
        wantedKeys.add(key)
      }
    }
    if (scope.includeSystem) {
      for (const roles of summaries.values()) {
        for (const role of roles) {
          const key = roleMatchKey(role.name)
          if (solutionKeys && !solutionKeys.has(key)) continue
          wantedKeys.add(key)
        }
      }
    }
    onProgress?.(`Comparing ${wantedKeys.size} role(s)…`)

    // --- Phase 2: privileges, per environment, only for those roles --------
    for (const envKey of envKeys) {
      if (envErrors[envKey]) {
        models[envKey] = null
        continue
      }
      try {
        onProgress?.(`Loading role privileges — ${envKey}…`)
        // Ids are per environment: the same role name carries a different id
        // in an environment where it was rebuilt rather than transported.
        const ids = (summaries.get(envKey) ?? [])
          .filter((role) => wantedKeys.has(roleMatchKey(role.name)))
          .map((role) => role.rootRoleId)
        models[envKey] = await roleAnalyzerService.loadRoleMatrix(
          envKey,
          ids,
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
