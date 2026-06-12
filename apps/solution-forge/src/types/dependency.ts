import type { EnvKey } from './comparison'

/**
 * Dependency-check model: required components of a release solution that
 * are not part of the solution itself (RetrieveMissingDependencies),
 * enriched with their presence in a selected target environment.
 */

export interface DependencyItem {
  /** Required component (the one the solution depends on). */
  requiredObjectId: string
  requiredType: number
  requiredTypeName: string
  /** Resolved display name when the type is queryable; otherwise absent. */
  requiredName?: string
  /** Dependent component (the solution member needing it). */
  dependentObjectId: string
  dependentType: number
  dependentTypeName: string
  dependentName?: string
  /**
   * Presence of the required component in the target environment:
   * missing = import would fail there, present = already deployed,
   * unknown = type not verifiable from the app (metadata types).
   */
  targetStatus: 'missing' | 'present' | 'unknown'
}

export interface DependencyCheckResult {
  envKey: EnvKey
  items: DependencyItem[]
  /** Set when the target environment could not be queried at all. */
  targetUnreachable?: boolean
}
