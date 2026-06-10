/**
 * Cross-environment comparison model. For a selected solution in the current
 * (DEV) environment, the ALM-relevant components are resolved per environment
 * and compared — deviations point at deployment / ALM problems.
 */

export type EnvKey = 'dev' | 'uat' | 'prod'

export interface EnvironmentDef {
  key: EnvKey
  label: string
  /** Dataverse org URL, e.g. https://org.crm4.dynamics.com (no trailing /). */
  url: string
  environmentId: string
  /** True for the environment hosting this app. */
  isCurrent?: boolean
}

/** Component kinds the comparison cares about. */
export type AlmComponentKind =
  | 'cloudflow'
  | 'workflow'
  | 'businessrule'
  | 'pluginstep'
  | 'webresource'

export const ALM_KIND_LABELS: Record<AlmComponentKind, string> = {
  cloudflow: 'Cloud Flows',
  workflow: 'Workflows',
  businessrule: 'Business Rules',
  pluginstep: 'Plugin Steps',
  webresource: 'Scripts (Web Resources)',
}

/** Identity of one compared component (GUID is solution-import-stable). */
export interface AlmComponentRef {
  objectId: string
  kind: AlmComponentKind
  name: string
}

/** Snapshot of a component in one environment. */
export interface EnvComponentState {
  present: boolean
  name?: string
  /** "Activated" / "Draft" / "Enabled" / "Disabled"; undefined for scripts. */
  stateLabel?: string
  /** Normalized on/off where the table has a state; undefined for scripts. */
  active?: boolean
  modifiedOn?: string
  isManaged?: boolean
}

export type DeviationKind = 'missing' | 'state' | 'unmanaged'

export const DEVIATION_LABELS: Record<DeviationKind, string> = {
  missing: 'Missing',
  state: 'Status drift',
  unmanaged: 'Unmanaged in target',
}

export interface ComparisonRow {
  ref: AlmComponentRef
  /** Snapshot per environment; null = environment could not be queried. */
  byEnv: Record<EnvKey, EnvComponentState | null>
  deviations: DeviationKind[]
}

export interface ComparisonResult {
  rows: ComparisonRow[]
  /** Environments that failed entirely (auth, network, permissions). */
  envErrors: Partial<Record<EnvKey, string>>
}
