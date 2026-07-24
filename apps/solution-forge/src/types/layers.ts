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
  /**
   * Relative maker-portal path (between `/solutions/{id}/` and `/layers`) for
   * this component's solution-layers view, e.g. `entities/{id}` or
   * `objects/apps/{id}`. Undefined for types whose maker route we can't build
   * (entity-nested or unmapped) — the UI then falls back to the solution list.
   */
  makerLayerPath?: string
}

/** One component-type's results, emitted as soon as that type is resolved. */
export interface LayerSection {
  typeCode: number
  typeName: string
  stacks: ComponentLayerStack[]
}

export interface LayerInspectionResult {
  // The Deployment-Readiness / Compare features target the conventional uat/prod
  // roles specifically (EnvKey itself is free-form).
  envKey: 'uat' | 'prod'
  stacks: ComponentLayerStack[]
  /** Aggregated query problems (deduplicated, human-readable). */
  warnings: string[]
}
