import type { ComparisonResult } from '../types/comparison'
import { dataverseComparisonService } from './dataverseComparisonService'

/**
 * Service contract for the cross-environment ALM comparison.
 *
 * `compareSolution()` resolves the ALM-relevant components (cloud flows,
 * classic workflows, business rules, plugin steps, scripts) of one solution
 * in the current environment and fetches their state from every configured
 * environment (see ENVIRONMENTS in config.ts) via the Microsoft Dataverse
 * connector's "from selected environment" operations. Deviations are
 * computed per component: missing in target, status drift, unmanaged layer
 * in target.
 *
 * The exported singleton is Dataverse-backed and falls back to mock data
 * outside a Power Platform host.
 */
export interface ComparisonService {
  compareSolution(
    solutionId: string,
    onProgress?: (message: string) => void,
  ): Promise<ComparisonResult>
}

export const comparisonService: ComparisonService = dataverseComparisonService
