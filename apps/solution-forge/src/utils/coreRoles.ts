import type {
  CoreRoleCluster,
  CoreRolePrivilege,
  PrivilegeAction,
  PrivilegeDepthMask,
  SecurityModel,
} from '../types/roles'
import { maxDepth } from './privileges'

/**
 * Core Role Extractor analysis (pure, unit-testable).
 *
 * Scans the CUSTOM (unmanaged) roles of a security model for privileges that
 * appear in more than one of them. Every such shared privilege is a candidate
 * to be consolidated into a single "core" role. Shared privileges are then
 * clustered by the EXACT set of roles that share them — each distinct
 * role-set becomes one proposed core role (the "per area" split): privileges
 * common to {Sales North, Sales South} form one core role, privileges common
 * to {Service, Support} another.
 *
 * The consolidated depth of each privilege is the DEEPEST grant across the
 * sharing roles (so the core role never reduces anyone's access).
 *
 * Managed roles (system / from managed solutions) are excluded — only the
 * org's own custom roles are consolidation targets.
 */
export function analyzeCoreRoles(
  model: SecurityModel,
  opts: { minRoles?: number } = {},
): CoreRoleCluster[] {
  const minRoles = Math.max(2, opts.minRoles ?? 2)
  const custom = model.roles.filter((r) => !r.isManaged)

  // privilege key ("entity|action") → rootRoleId → depth
  const byPrivilege = new Map<string, Map<string, PrivilegeDepthMask>>()
  for (const role of custom) {
    const matrix = model.matrices.get(role.rootRoleId)
    if (!matrix) continue
    for (const [entity, actions] of matrix) {
      for (const [action, depth] of actions) {
        if (!depth) continue
        const key = `${entity}|${action}`
        const grants = byPrivilege.get(key) ?? new Map<string, PrivilegeDepthMask>()
        grants.set(role.rootRoleId, depth)
        byPrivilege.set(key, grants)
      }
    }
  }

  // Cluster shared privileges by the exact set of sharing roles.
  const clusters = new Map<string, { ids: string[]; privileges: CoreRolePrivilege[] }>()
  for (const [key, grants] of byPrivilege) {
    if (grants.size < minRoles) continue
    const [entity, action] = key.split('|') as [string, PrivilegeAction]
    const ids = [...grants.keys()].sort()
    const setKey = ids.join(',')
    const depth = [...grants.values()].reduce<PrivilegeDepthMask>(
      (acc, d) => maxDepth(acc, d),
      0,
    )
    const cluster = clusters.get(setKey) ?? { ids, privileges: [] }
    cluster.privileges.push({ entity, action, depth })
    clusters.set(setKey, cluster)
  }

  const nameOf = (id: string) =>
    model.roles.find((r) => r.rootRoleId === id)?.name ?? id

  return [...clusters.values()]
    .map((cluster) => {
      const names = cluster.ids.map(nameOf)
      return {
        id: cluster.ids.join(','),
        sources: cluster.ids.map((id) => ({ rootRoleId: id, name: nameOf(id) })),
        privileges: cluster.privileges.sort(
          (a, b) =>
            a.entity.localeCompare(b.entity) || a.action.localeCompare(b.action),
        ),
        suggestedName: `Core – ${names.join(' / ')}`.slice(0, 90),
      }
    })
    .sort(
      (a, b) =>
        b.sources.length - a.sources.length ||
        b.privileges.length - a.privileges.length,
    )
}
