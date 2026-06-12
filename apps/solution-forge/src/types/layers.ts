import type { EnvKey } from './comparison'
import type { SolutionComponentInfo } from './solution'

/**
 * Layer-inspector model: for each component of a solution, the layer stack
 * (`msdyn_componentlayer`) in a target environment. An unmanaged "Active"
 * layer above managed layers means local customizations override whatever
 * the next solution import delivers — the classic ALM smell the inspector
 * exists to uncover.
 */

/** One row of the msdyn_componentlayer virtual table. */
export interface ComponentLayerInfo {
  /** msdyn_componentlayerid */
  id: string
  /** msdyn_solutionname — 'Active' marks the unmanaged layer. */
  solutionName: string
  publisherName?: string
  solutionVersion?: string
  /** msdyn_order — counts up from the base layer; highest = top layer. */
  order: number
}

/**
 * Verdict per component in the target environment:
 * - overridden     = unmanaged Active layer sits on top of managed layers
 * - unmanagedOnly  = the component exists only unmanaged in the target
 * - clean          = present, no unmanaged layer
 * - absent         = no layers found (component not present in the target)
 * - unsupported    = the component type has no layer representation we can
 *                    query (msdyn_solutioncomponentname unknown)
 * - error          = the layer query for this component failed
 */
export type LayerVerdict =
  | 'overridden'
  | 'unmanagedOnly'
  | 'clean'
  | 'absent'
  | 'unsupported'
  | 'error'

export interface ComponentLayerStack {
  component: SolutionComponentInfo
  verdict: LayerVerdict
  /** Layers top-first (highest order first); empty unless present. */
  layers: ComponentLayerInfo[]
}

export interface LayerInspectionResult {
  envKey: Extract<EnvKey, 'uat' | 'prod'>
  stacks: ComponentLayerStack[]
  /** Aggregated query problems (deduplicated, human-readable). */
  warnings: string[]
}
