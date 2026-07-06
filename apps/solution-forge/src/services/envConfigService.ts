import type {
  ConnRefUsage,
  EnvConfigLoadOptions,
  EnvConfigResult,
} from '../types/envConfig'
import { dataverseEnvConfigService } from './dataverseEnvConfigService'

/**
 * Service contract for the Environment Variable & Connection Reference
 * cockpit. Reads the configured environments (ENVIRONMENTS) through the
 * Dataverse connector and lines up each setting by its import-stable name.
 * Read-only.
 */
export interface EnvConfigService {
  /**
   * Load environment variables and connection references across every
   * configured environment. Per-environment failures are collected in
   * `errors` rather than failing the whole load. `options.solutionUniqueName`
   * restricts the result to that solution's components (resolved in the host).
   */
  loadEnvConfig(
    onProgress?: (done: number, total: number, label: string) => void,
    options?: EnvConfigLoadOptions,
  ): Promise<EnvConfigResult>
  /**
   * Which cloud flows reference each connection reference in the HOST
   * environment, keyed by connection-reference logical name and split into
   * active/inactive counts plus the flow list (with deep-link ids). Read from
   * each flow's `clientdata`. Loaded on demand (it scans every flow).
   */
  countConnectionReferenceUsage(): Promise<Record<string, ConnRefUsage>>
}

export const envConfigService: EnvConfigService = dataverseEnvConfigService
