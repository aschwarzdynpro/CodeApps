/**
 * Cross-environment role comparison — the same security role looked up in
 * every configured environment, into a matrix of "does it exist, and does it
 * grant the same thing?".
 *
 * Why this is not {@link file://./comparer.ts}: that model compares an ON/OFF
 * state of one import-stable id. Roles have no on/off, their identity is not
 * reliably stable across environments, and the interesting delta is the
 * *privilege set* — so the drift signal here is a fingerprint, and a row can
 * drill down into entity × action × environment.
 *
 * MATCHING: roles are matched by NAME, not by id. A GUID only survives clean
 * solution transport (CLAUDE.md gotcha #7); a role someone rebuilt by hand in
 * UAT/PROD carries a different id and would never match. Name matching also
 * mirrors `resolveHasRole`, which already identifies roles by name to cover
 * the per-business-unit copies. When the name matches but the id does not,
 * that IS the finding — see {@link RoleComparerRow.identityDrift}.
 */

import type { PrivilegeAction, PrivilegeDepthMask } from './roles'

/** One environment's state for a compared role. */
export interface RoleEnvState {
  present: boolean
  /**
   * The role's root id IN THIS ENVIRONMENT. Differs from the host's when the
   * role was rebuilt rather than transported.
   */
  rootRoleId: string
  isManaged: boolean
  /** Business-unit copies seen (≥ 1) — roles are cloned per BU. */
  copyCount: number
  /** Number of entity × action grants. */
  privilegeCount: number
  /** Number of non-table privileges (prvExportToExcel, …). */
  miscCount: number
  /**
   * How many privileges this environment grants DIFFERENTLY from the baseline
   * — table grants whose depth deviates (including granted-vs-not) plus misc
   * privileges present on only one side.
   *
   * `null` for the baseline itself and whenever there is nothing to compare
   * against (the role exists in only one environment). The baseline is the
   * host when it has the role, otherwise the first environment that does — so
   * one column reads as the reference and the deviation sits where it belongs
   * instead of lighting up every column.
   */
  driftCount: number | null
}

/** One role across the environments. */
export interface RoleComparerRow {
  /** Match key — the normalised role name. */
  key: string
  /** Display name (as spelled in the host, else the first env that has it). */
  name: string
  /**
   * Keyed by environment key. `null` = that environment could not be read at
   * all; a state with `present: false` = read fine, role not there. Keeping
   * those apart matters — "unknown" must never be shown as "identical".
   */
  byEnv: Record<string, RoleEnvState | null>
  /**
   * The privilege set is not identical across all environments that HAVE the
   * role. Deliberately symmetric (no host reference): a role can be absent
   * from the host and still drift between UAT and PROD.
   */
  drift: boolean
  /** Present in the host, absent in at least one readable target. */
  missingSomewhere: boolean
  /** Present in a target but not in the host — grown locally, never in DEV. */
  extraSomewhere: boolean
  /**
   * Same name, different root id: the role was NOT transported but rebuilt in
   * place. Its privileges may match today and drift apart silently tomorrow,
   * and a solution import will not update it.
   */
  identityDrift: boolean
  /**
   * `ismanaged` differs between environments. Stated as an observation, not a
   * diagnosis — it usually means the role came from a solution in one place
   * and was created by hand in the other.
   */
  managedDrift: boolean
  /** Set only in baseline mode — how the role stands against the frozen state. */
  baseline?: RoleBaselineVerdict
}

/**
 * How one role stands against a frozen baseline (see `utils/securityBaseline`).
 * Only present when the workspace runs in baseline mode.
 */
export interface RoleBaselineVerdict {
  /**
   * Privileges granted differently than at freeze time, per environment.
   * `null` = the baseline did not capture this environment, or the role was
   * not in it — which is NOT the same as "unchanged".
   */
  changedByEnv: Record<string, number | null>
  /** At least one environment deviates from the frozen state. */
  changed: boolean
  /** The role did not exist in the baseline at all — created since. */
  isNew: boolean
  /** The baseline had the role; it exists in no environment now. */
  isGone: boolean
}

export interface RoleComparerResult {
  rows: RoleComparerRow[]
  /** Environments that could not be read, with the reason. */
  envErrors: Record<string, string>
  hostKey: string
  /** Environment keys in display order, host first. */
  envKeys: string[]
  loadedAt: Date
}

/** One entity × action cell across the environments, for the drill-down. */
export interface RolePrivilegeDiffRow {
  entity: string
  action: PrivilegeAction
  /** Depth per environment; null = the role is absent / unreadable there. */
  byEnv: Record<string, PrivilegeDepthMask | null>
  /** The environments that have the role do not all grant the same depth. */
  drift: boolean
}

/** One misc (non-table) privilege across the environments. */
export interface RoleMiscDiffRow {
  name: string
  byEnv: Record<string, boolean | null>
  drift: boolean
}

/** The full drill-down for one role. */
export interface RolePrivilegeDiff {
  privileges: RolePrivilegeDiffRow[]
  misc: RoleMiscDiffRow[]
}

/** Which rows the workspace shows. */
export type RoleComparerFilter =
  | 'all'
  | 'drift'
  | 'missing'
  | 'identity'
  | 'managed'
  // Baseline mode only.
  | 'changed'
  | 'new'
  | 'gone'

/** One stored baseline, as listed in the picker. */
export interface SecuritySnapshotSummary {
  id: string
  name: string
  /** Scope description captured at freeze time ("Custom roles", "Solution: …"). */
  scope: string
  envKeys: string[]
  roleCount: number
  frozenOn?: string
  frozenBy?: string
  notes?: string
}
