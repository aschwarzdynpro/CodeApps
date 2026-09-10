import type {
  EffectiveEntry,
  PrivilegeAction,
  RoleAssignmentPath,
} from '../types/roles'

/**
 * Narrowing the User-rights result of the Role Analyzer.
 *
 * A user with a handful of roles easily reaches several hundred entity ×
 * action rows, which is a table nobody reads top to bottom. Two questions are
 * actually asked of it — "what may this user do to table X?" and "what does
 * role Y actually contribute?" — and both are selections over the same list,
 * so they live here as pure functions rather than as state in the component.
 */

export interface EffectiveFilter {
  /** Case-insensitive substring on the table's logical name; '' = all. */
  entity: string
  /** Exact privilege; '' = all. */
  action: PrivilegeAction | ''
  /** `rootRoleId` of a granting role; '' = all. */
  rootRoleId: string
}

export const EMPTY_EFFECTIVE_FILTER: EffectiveFilter = {
  entity: '',
  action: '',
  rootRoleId: '',
}

/** One granting role, as the chip row shows it. */
export interface RoleChip {
  rootRoleId: string
  roleName: string
  /** True when the role is assigned to the user directly. */
  direct: boolean
  /** Teams the role also arrives through, in encounter order. */
  teams: string[]
  /** How many of the user's effective privileges this role grants. */
  count: number
}

export function isFilterActive(filter: EffectiveFilter): boolean {
  return (
    filter.entity.trim() !== '' || filter.action !== '' || filter.rootRoleId !== ''
  )
}

/** Apply all three dimensions; they combine with AND. */
export function filterEffectiveEntries(
  entries: EffectiveEntry[],
  filter: EffectiveFilter,
): EffectiveEntry[] {
  const needle = filter.entity.trim().toLowerCase()
  return entries.filter((entry) => {
    if (needle && !entry.entity.toLowerCase().includes(needle)) return false
    if (filter.action && entry.action !== filter.action) return false
    if (
      filter.rootRoleId &&
      !entry.sources.some((s) => s.rootRoleId === filter.rootRoleId)
    )
      return false
    return true
  })
}

/**
 * The chip row: one chip per ROLE, not per assignment path.
 *
 * A role held directly AND through a team is still one role granting one set
 * of privileges — two chips for it would filter identically and suggest the
 * user had it twice. The chip therefore merges the paths and carries both
 * facts, so "how do they have it" survives the merge.
 *
 * `roles` drives the list rather than the entries, so a role that grants
 * NOTHING still appears (with count 0). That is a finding in its own right —
 * an assignment doing no work — and dropping it would hide it.
 */
export function effectiveRoleChips(
  entries: EffectiveEntry[],
  roles: RoleAssignmentPath[],
): RoleChip[] {
  const byRole = new Map<string, RoleChip>()
  for (const path of roles) {
    const chip = byRole.get(path.rootRoleId) ?? {
      rootRoleId: path.rootRoleId,
      roleName: path.roleName,
      direct: false,
      teams: [],
      count: 0,
    }
    if (path.via === 'direct') chip.direct = true
    else if (path.teamName && !chip.teams.includes(path.teamName))
      chip.teams.push(path.teamName)
    byRole.set(path.rootRoleId, chip)
  }

  for (const entry of entries) {
    // One entry counts once per role even if several of its paths name it.
    for (const id of new Set(entry.sources.map((s) => s.rootRoleId))) {
      const chip = byRole.get(id)
      if (chip) chip.count += 1
    }
  }

  // Heaviest contributor first — that is the one worth looking at.
  return [...byRole.values()].sort(
    (a, b) => b.count - a.count || a.roleName.localeCompare(b.roleName),
  )
}

/** Privileges that actually occur, in the canonical action order. */
export function actionsPresent(
  entries: EffectiveEntry[],
  order: readonly PrivilegeAction[],
): PrivilegeAction[] {
  const present = new Set(entries.map((e) => e.action))
  return order.filter((a) => present.has(a))
}
