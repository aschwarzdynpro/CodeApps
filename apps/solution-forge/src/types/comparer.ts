/**
 * Shared model for the Flow Comparer and Plugin Comparer: one compared item
 * (a cloud flow / a plugin step) looked up by its import-stable id across every
 * configured environment, into a status/version matrix with per-cell drift and
 * a per-cell turn-on/off action.
 */

import type { UserRef, WorkingSolution } from './solution'

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
  /** Owner in THIS environment (flows only) — owners can differ per env. */
  ownerId?: string
  ownerName?: string
}

/** One compared item across the environments. */
export interface ComparerRow {
  /** Import-stable match key (workflowid / sdkmessageprocessingstepid). */
  id: string
  name: string
  /** Import-stable unique id (flow: workflowidunique) for definition matching. */
  uniqueId?: string
  /** Secondary line / grouping dimension (flow: area; step: assembly name). */
  subtitle?: string
  /** Raw `workflow.category` (flows only) — the process kind, for grouping/sort. */
  processCategory?: number
  /** Human process-type label (flows only), e.g. "Cloud flows" / "Business
   *  rules" — the default grouping dimension for the Flow Comparer. */
  processType?: string
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
 * How "status drift" is measured:
 * - `current`    — a target env differs from the current (host) env.
 * - `definition` — an env differs from the flow's defined state (hso_cloudflow);
 *                  applies to every env, including the host.
 */
export type DriftMode = 'current' | 'definition'

/** Whether one environment's cell counts as drift under the given mode. */
export function cellHasDrift(
  row: ComparerRow,
  envKey: string,
  hostKey: string,
  mode: DriftMode,
): boolean {
  const cell = row.byEnv[envKey]
  if (!cell || !cell.present) return false
  if (mode === 'definition') {
    return (
      row.definitionActive !== undefined &&
      cell.active !== row.definitionActive
    )
  }
  if (envKey === hostKey) return false
  const host = row.byEnv[hostKey]
  return !!host && host.present && cell.active !== host.active
}

/** Whether any environment of a row drifts under the given mode. */
export function rowHasDrift(
  row: ComparerRow,
  hostKey: string,
  envKeys: string[],
  mode: DriftMode,
): boolean {
  return envKeys.some((k) => cellHasDrift(row, k, hostKey, mode))
}

export interface ComparerResult {
  rows: ComparerRow[]
  /** Per-env read failures (env not queryable). */
  envErrors: Record<string, string>
  /** Why the defined-state (Definition) column is absent, when it was expected
   *  (e.g. the registry read failed) — shown as a hint. */
  definitionNote?: string
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

/** One item's result inside a serial bulk run. */
export interface BulkResult {
  id: string
  name: string
  ok: boolean
  error?: string
  /** Skipped because the item isn't present in the target environment. */
  skipped?: boolean
}

/** A confirmed bulk action. */
export type BulkAction =
  | { kind: 'activate' | 'deactivate' }
  | { kind: 'owner'; user: UserRef }

/** Live state of a serial bulk run — persisted so it survives navigation. */
export interface ComparerBulkRun {
  running: boolean
  done: number
  total: number
  /** Description of the current step, e.g. 'Activating "Flow B"…'. */
  label: string
  /** Label of the target environment (for the result summary). */
  targetEnvLabel: string
  results: BulkResult[] | null
}

/**
 * The run backing a comparer workspace — the compare result plus any bulk run.
 * The Flow Comparer's implementation ({@link file://./../hooks/useFlowRun}) is a
 * module singleton so the result + bulk run survive navigating to other tabs;
 * the Plugin Comparer uses a component-local implementation.
 */
export interface ComparerRunApi {
  solutionId: string
  result: ComparerResult | null
  comparing: boolean
  compareProgress: string
  loadedAt: Date | null
  error: string | null
  bulk: ComparerBulkRun | null
  setSolutionId: (id: string) => void
  startCompare: (solution: WorkingSolution) => void
  applyCell: (rowId: string, envKey: string, cell: ComparerEnvState) => void
  startBulk: (opts: {
    action: BulkAction
    rows: ComparerRow[]
    targetEnvKey: string
    targetEnvLabel: string
  }) => void
  dismissBulk: () => void
}
