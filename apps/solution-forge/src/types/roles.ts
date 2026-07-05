/**
 * Security Role Analyzer — types over `role`, `privilege`,
 * `roleprivileges`, `systemuserroles`, `teamroles` and `teammembership`.
 *
 * Roles are always aggregated on their ROOT copy: Dataverse clones every
 * role per business unit (`parentrootroleid` points at the root), the copies
 * share the privilege set.
 */

/** The eight matrix actions in classic role-editor order. */
export const PRIVILEGE_ACTIONS = [
  'Create',
  'Read',
  'Write',
  'Delete',
  'Append',
  'AppendTo',
  'Assign',
  'Share',
] as const

export type PrivilegeAction = (typeof PRIVILEGE_ACTIONS)[number]

/** privilegedepthmask values (roleprivileges intersect). */
export const PRIVILEGE_DEPTHS = [
  { mask: 1, key: 'user', label: 'User', short: 'U' },
  { mask: 2, key: 'bu', label: 'Business Unit', short: 'BU' },
  { mask: 4, key: 'parent', label: 'Parent: Child BUs', short: 'P' },
  { mask: 8, key: 'org', label: 'Organization', short: 'O' },
] as const

export type PrivilegeDepthMask = 0 | 1 | 2 | 4 | 8

/** One root role with its assignment stats. */
export interface RoleSummary {
  /** parentrootroleid — the stable identity across BU copies. */
  rootRoleId: string
  name: string
  isManaged: boolean
  /** Number of BU copies seen (≥ 1). */
  copyCount: number
}

/** One privilege definition (metadata — cached aggressively). */
export interface PrivilegeInfo {
  id: string
  /** e.g. prvDeleteAccount. */
  name: string
  /** AccessRights bit — mapped to a {@link PrivilegeAction} when possible. */
  accessRight: number
  /** Entity logical name(s) the privilege applies to. */
  entities: string[]
}

/** entity → action → granted depth, for one role. */
export type RoleEntityMatrix = Map<string, Map<PrivilegeAction, PrivilegeDepthMask>>

/** The loaded security model — one snapshot, built once per session. */
export interface SecurityModel {
  roles: RoleSummary[]
  /** All entity logical names seen in any role's table privileges, sorted. */
  entities: string[]
  /** rootRoleId → matrix. */
  matrices: Map<string, RoleEntityMatrix>
  /** Non-table privileges per role (accessRight 0 / no entity), by name. */
  miscPrivileges: Map<string, string[]>
  loadedAt: Date
}

/** One cell delta in the role diff. */
export interface RoleDiffEntry {
  entity: string
  action: PrivilegeAction
  left: PrivilegeDepthMask
  right: PrivilegeDepthMask
}

/** A user or team as the subject of effective-rights analysis. */
export interface PrincipalRef {
  id: string
  name: string
  type: 'user' | 'team'
}

/** How a role reaches a user (directly or through a team). */
export interface RoleAssignmentPath {
  rootRoleId: string
  roleName: string
  via: 'direct' | 'team'
  teamName?: string
}

/** Effective depth of one entity × action for a user, with provenance. */
export interface EffectiveEntry {
  entity: string
  action: PrivilegeAction
  depth: PrivilegeDepthMask
  /** Every role granting it, best (deepest) first. */
  sources: RoleAssignmentPath[]
}

/** Reverse lookup: who can <action> on <entity>? */
export interface ReverseLookupHit {
  principal: PrincipalRef
  depth: PrivilegeDepthMask
  paths: RoleAssignmentPath[]
}

/**
 * Core Role Extractor — one consolidated privilege (entity × action at the
 * deepest depth needed across the roles that share it).
 */
export interface CoreRolePrivilege {
  entity: string
  action: PrivilegeAction
  /** Consolidated depth = the deepest grant across the sharing roles. */
  depth: PrivilegeDepthMask
}

/** A custom role that a proposed core role would be extracted from. */
export interface CoreRoleSource {
  rootRoleId: string
  name: string
}

/**
 * One consolidation candidate: a set of custom roles that all share the same
 * privileges, proposed as a single core role. Clustering is by the exact set
 * of roles that share the privileges ("per area").
 */
export interface CoreRoleCluster {
  /** Stable id (sorted source role ids joined) — also the cluster key. */
  id: string
  sources: CoreRoleSource[]
  privileges: CoreRolePrivilege[]
  /** Editable default name for the new core role. */
  suggestedName: string
}

/** Input to the consolidation automatism. */
export interface CoreRoleApplyInput {
  /** Unique name of the working solution the roles are captured in. */
  workingSolutionUniqueName: string
  /** Name of the new core role. */
  roleName: string
  /** Privileges to grant the new core role. */
  privileges: CoreRolePrivilege[]
  /** Root role ids the privileges come from (added to the solution when stripped). */
  sourceRoleIds: string[]
  /** When true, remove the duplicated privileges from the source roles. */
  removeDuplicates: boolean
}

/** One step of the apply automatism, for a transparent result report. */
export interface CoreRoleApplyStep {
  label: string
  ok: boolean
  error?: string
}

export interface CoreRoleApplyResult {
  ok: boolean
  roleId: string | null
  roleName: string
  privilegesAdded: number
  privilegesRemoved: number
  steps: CoreRoleApplyStep[]
}

/** Hygiene report findings. */
export interface RoleHygieneReport {
  /** Roles assigned to no user and no team. */
  unassignedRoles: RoleSummary[]
  /** Users holding more than the threshold number of roles. */
  usersWithManyRoles: { user: PrincipalRef; roleCount: number; roles: string[] }[]
  threshold: number
}
