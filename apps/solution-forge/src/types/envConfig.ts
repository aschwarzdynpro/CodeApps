/**
 * Environment Variable & Connection Reference cockpit — configuration values
 * across the configured environments, side by side. Matched by the
 * import-stable schema name (env vars) / logical name (connection references),
 * so the same setting lines up across DEV/UAT/PROD even though its record ids
 * differ per environment.
 */

/** One environment column in the cockpit. */
export interface EnvConfigColumn {
  key: string
  label: string
  /** True for the environment hosting this app. */
  isCurrent: boolean
}

/** Env-var value in one environment. */
export interface EnvVarCell {
  /** The definition exists in this environment. */
  present: boolean
  /** A current value or a default is available (so the app has something). */
  hasValue: boolean
  /** Effective value (current value, else default); masked for secrets. */
  value: string
  /** No current value — falling back to the default. */
  usingDefault: boolean
}

/** One environment variable across all environments. */
export interface EnvVarRow {
  schemaName: string
  displayName: string
  /** Formatted type label (String / Number / JSON / Secret …). */
  typeLabel: string
  isSecret: boolean
  /** Per environment key → cell. */
  cells: Record<string, EnvVarCell>
}

/** Connection-reference binding in one environment. */
export interface ConnRefCell {
  present: boolean
  /** A connection is bound (`connectionid` set). */
  bound: boolean
}

/** One connection reference across all environments. */
export interface ConnRefRow {
  logicalName: string
  displayName: string
  /** Friendly connector name (last segment of `connectorid`). */
  connectorName: string
  cells: Record<string, ConnRefCell>
}

export interface EnvConfigResult {
  columns: EnvConfigColumn[]
  envVars: EnvVarRow[]
  connRefs: ConnRefRow[]
  /** Per-environment query errors (e.g. no access) — surfaced, not thrown. */
  errors: string[]
}

/** environmentvariabledefinition.type option values. */
export const ENV_VAR_TYPE_LABELS: Record<number, string> = {
  100000000: 'String',
  100000001: 'Number',
  100000002: 'Boolean',
  100000003: 'JSON',
  100000004: 'Data Source',
  100000005: 'Secret',
}

export const ENV_VAR_TYPE_SECRET = 100000005
