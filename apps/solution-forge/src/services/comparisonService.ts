import type {
  AlmComponentRef,
  ComparisonResult,
  ContentPair,
  EnvKey,
} from '../types/comparison'
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
  /**
   * Second pass over an existing comparison: hashes each diffable
   * component's definition (clientdata/xaml/content) in every environment
   * where it is present and flags a `content` deviation when the hashes
   * differ. Returns a new result with content hashes filled into byEnv and
   * the deviations updated. Loaded on demand because the content fields can
   * be large.
   */
  checkContentDrift(
    result: ComparisonResult,
    onProgress?: (done: number, total: number) => void,
  ): Promise<ComparisonResult>
  /**
   * Fetches one component's raw definition from two environments for the
   * side-by-side diff, decoded to text (base64 web resources are decoded;
   * binary types are flagged instead).
   */
  fetchContentPair(
    ref: AlmComponentRef,
    envA: EnvKey,
    envB: EnvKey,
  ): Promise<ContentPair>
}

export const comparisonService: ComparisonService = dataverseComparisonService
