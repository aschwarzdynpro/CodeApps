/**
 * Shared model for the Flow Comparer and Plugin Comparer: one compared item
 * (a cloud flow / a plugin step) looked up by its import-stable id across every
 * configured environment, into a status/version matrix with per-cell drift and
 * a per-cell turn-on/off action.
 */

/** One environment's state for a compared item. */
export interface ComparerEnvState {
  /** The item exists in this environment. */
  present: boolean
  /** on = flow Activated / plugin step Enabled. */
  active: boolean
  /** "Activated"/"Draft" (flow) or "Enabled"/"Disabled" (step) / "Missing". */
  statusLabel: string
  /** Plugin-assembly version (steps); flows have none. */
  version?: string
  modifiedOn?: string
  isManaged?: boolean
  /** Portal deep link into this environment (flows: Power Automate). */
  link?: string
  /** DEFINED desired state for this env (flows: hso_cloudflowbyenvironment) —
   *  the label ("On"/"Off") and its on/off, when a definition exists. */
  desired?: string
  desiredActive?: boolean
}

/** One compared item across the environments. */
export interface ComparerRow {
  /** Import-stable match key (workflowid / sdkmessageprocessingstepid). */
  id: string
  name: string
  /** Import-stable unique id (flow: workflowidunique) for definition matching. */
  uniqueId?: string
  /** Secondary line (flow: none; step: assembly name). */
  subtitle?: string
  /** Keyed by environment key; null = the environment could not be read. */
  byEnv: Record<string, ComparerEnvState | null>
  /** A target environment's on/off differs from the host. */
  statusDrift: boolean
  /** DEFINED overall desired state (flows: hso_cloudflow.hso_flowstate) — the
   *  label ("On"/"Off") and its on/off, when a definition exists. */
  definition?: string
  definitionActive?: boolean
}

/**
 * True when any environment's actual on/off differs from its DEFINED desired
 * state — i.e. the environment isn't in the state the definition wants.
 */
export function hasDefinitionMismatch(
  row: ComparerRow,
  envKeys: string[],
): boolean {
  return envKeys.some((key) => {
    const cell = row.byEnv[key]
    return (
      !!cell &&
      cell.present &&
      cell.desiredActive !== undefined &&
      cell.desiredActive !== cell.active
    )
  })
}

export interface ComparerResult {
  rows: ComparerRow[]
  /** Per-env read failures (env not queryable). */
  envErrors: Record<string, string>
}

/**
 * Recompute a row's `statusDrift`: true when any non-host environment has the
 * item present with a different on/off than the host. Shared by the services
 * (initial build) and the workspace (after a turn-on/off updates a cell).
 */
export function recomputeDrift(
  row: ComparerRow,
  hostKey: string,
  envKeys: string[],
): boolean {
  const host = row.byEnv[hostKey]
  if (!host || !host.present) return false
  return envKeys.some((key) => {
    if (key === hostKey) return false
    const cell = row.byEnv[key]
    return !!cell && cell.present && cell.active !== host.active
  })
}
