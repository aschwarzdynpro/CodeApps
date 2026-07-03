import type {
  EffectiveEntry,
  PrincipalRef,
  PrivilegeAction,
  PrivilegeDepthMask,
  ReverseLookupHit,
  RoleAssignmentPath,
  RoleEntityMatrix,
  RoleHygieneReport,
  RoleSummary,
  SecurityModel,
} from '../types/roles'
import type { RoleAnalyzerService } from './roleAnalyzerService'
import { maxDepth } from '../utils/privileges'

/**
 * Mock implementation of {@link RoleAnalyzerService} — a compact but
 * realistic security model (six roles, ten tables, direct + team
 * assignments, one unassigned role, one over-privileged user) so every
 * Role Analyzer view is demonstrable offline.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const ENTITIES = [
  'account',
  'contact',
  'opportunity',
  'salesorder',
  'invoice',
  'incident',
  'pro_workingsolution',
  'pro_mergerun',
  'team',
  'annotation',
]

/** Compact matrix notation: entity → 'CRWDAppAtAsSh' depth string. */
type Spec = Record<string, Partial<Record<PrivilegeAction, PrivilegeDepthMask>>>

function matrix(spec: Spec): RoleEntityMatrix {
  const m: RoleEntityMatrix = new Map()
  for (const [entity, actions] of Object.entries(spec)) {
    const map = new Map<PrivilegeAction, PrivilegeDepthMask>()
    for (const [action, depth] of Object.entries(actions))
      map.set(action as PrivilegeAction, depth as PrivilegeDepthMask)
    m.set(entity, map)
  }
  return m
}

const FULL_ORG: Partial<Record<PrivilegeAction, PrivilegeDepthMask>> = {
  Create: 8,
  Read: 8,
  Write: 8,
  Delete: 8,
  Append: 8,
  AppendTo: 8,
  Assign: 8,
  Share: 8,
}
const BU_WRITER: Partial<Record<PrivilegeAction, PrivilegeDepthMask>> = {
  Create: 2,
  Read: 2,
  Write: 2,
  Append: 2,
  AppendTo: 2,
}
const USER_WRITER: Partial<Record<PrivilegeAction, PrivilegeDepthMask>> = {
  Create: 1,
  Read: 2,
  Write: 1,
  Append: 1,
  AppendTo: 1,
}
const ORG_READER: Partial<Record<PrivilegeAction, PrivilegeDepthMask>> = {
  Read: 8,
}

const ROLES: (RoleSummary & { spec: Spec; misc: string[] })[] = [
  {
    rootRoleId: 'role-admin',
    name: 'System Administrator',
    isManaged: true,
    copyCount: 3,
    spec: Object.fromEntries(ENTITIES.map((e) => [e, FULL_ORG])),
    misc: ['prvBulkDelete', 'prvExportToExcel', 'prvISVExtensions'],
  },
  {
    rootRoleId: 'role-sales-sued',
    name: 'Vertrieb Süd',
    isManaged: false,
    copyCount: 3,
    spec: {
      account: { ...BU_WRITER, Delete: 2, Assign: 2, Share: 2 },
      contact: { ...BU_WRITER, Delete: 2 },
      opportunity: BU_WRITER,
      salesorder: USER_WRITER,
      annotation: USER_WRITER,
    },
    misc: ['prvExportToExcel'],
  },
  {
    rootRoleId: 'role-sales-nord',
    name: 'Vertrieb Nord',
    isManaged: false,
    copyCount: 3,
    // Deliberate drift vs. Vertrieb Süd: no account delete, deeper share.
    spec: {
      account: { ...BU_WRITER, Assign: 2, Share: 4 },
      contact: { ...BU_WRITER, Delete: 1 },
      opportunity: BU_WRITER,
      salesorder: USER_WRITER,
      annotation: USER_WRITER,
    },
    misc: ['prvExportToExcel'],
  },
  {
    rootRoleId: 'role-service',
    name: 'Service Desk',
    isManaged: false,
    copyCount: 3,
    spec: {
      incident: { ...BU_WRITER, Delete: 2, Assign: 2 },
      account: ORG_READER,
      contact: ORG_READER,
      annotation: USER_WRITER,
    },
    misc: [],
  },
  {
    rootRoleId: 'role-deploy',
    name: 'INT | Deployment Manager',
    isManaged: false,
    copyCount: 1,
    spec: {
      pro_workingsolution: FULL_ORG,
      pro_mergerun: FULL_ORG,
    },
    misc: ['prvImportCustomization', 'prvPublishCustomization'],
  },
  {
    rootRoleId: 'role-orphan',
    name: 'Kampagnen Pilot 2023 (verwaist)',
    isManaged: false,
    copyCount: 1,
    spec: { account: ORG_READER, contact: ORG_READER },
    misc: [],
  },
]

const USERS: PrincipalRef[] = [
  { id: 'u-0001', name: 'Marie Curie', type: 'user' },
  { id: 'u-0002', name: 'Niels Bohr', type: 'user' },
  { id: 'u-0003', name: 'Lise Meitner', type: 'user' },
  { id: 'u-0004', name: 'Max Planck', type: 'user' },
  { id: 'u-0006', name: 'Andy Schwarz', type: 'user' },
]

const TEAMS: PrincipalRef[] = [
  { id: 't-0001', name: 'Sales DE', type: 'team' },
  { id: 't-0002', name: 'Support 1st Level', type: 'team' },
]

const USER_ROLES = new Map<string, Set<string>>([
  ['u-0001', new Set(['role-sales-sued'])],
  ['u-0002', new Set(['role-service'])],
  // Over-privileged demo user: many direct roles.
  [
    'u-0006',
    new Set(['role-admin', 'role-deploy', 'role-sales-sued', 'role-sales-nord']),
  ],
])

const TEAM_ROLES = new Map<string, Set<string>>([
  ['t-0001', new Set(['role-sales-nord'])],
  ['t-0002', new Set(['role-service'])],
])

const TEAM_MEMBERS = new Map<string, Set<string>>([
  ['t-0001', new Set(['u-0001', 'u-0003', 'u-0006'])],
  ['t-0002', new Set(['u-0004'])],
])

function buildModel(): SecurityModel {
  const matrices = new Map<string, RoleEntityMatrix>()
  const miscPrivileges = new Map<string, string[]>()
  for (const role of ROLES) {
    matrices.set(role.rootRoleId, matrix(role.spec))
    miscPrivileges.set(role.rootRoleId, role.misc)
  }
  return {
    roles: ROLES.map(({ spec, misc, ...summary }) => {
      void spec
      void misc
      return summary
    }).sort((a, b) => a.name.localeCompare(b.name)),
    entities: [...ENTITIES].sort(),
    matrices,
    miscPrivileges,
    loadedAt: new Date(),
  }
}

const MODEL = buildModel()

function nameOf(rootId: string): string {
  return MODEL.roles.find((r) => r.rootRoleId === rootId)?.name ?? rootId
}

function rolePathsForUser(userId: string): RoleAssignmentPath[] {
  const paths: RoleAssignmentPath[] = []
  for (const rootId of USER_ROLES.get(userId) ?? [])
    paths.push({ rootRoleId: rootId, roleName: nameOf(rootId), via: 'direct' })
  for (const [teamId, members] of TEAM_MEMBERS) {
    if (!members.has(userId)) continue
    for (const rootId of TEAM_ROLES.get(teamId) ?? [])
      paths.push({
        rootRoleId: rootId,
        roleName: nameOf(rootId),
        via: 'team',
        teamName: TEAMS.find((t) => t.id === teamId)?.name,
      })
  }
  return paths
}

class MockRoleAnalyzerService implements RoleAnalyzerService {
  async loadModel(
    onProgress?: (message: string) => void,
    force?: boolean,
  ): Promise<SecurityModel> {
    void force
    onProgress?.('Loading roles…')
    await delay(250)
    onProgress?.('Loading privilege metadata…')
    await delay(250)
    onProgress?.('Loading assignments…')
    await delay(250)
    return MODEL
  }

  async searchUsers(query: string): Promise<PrincipalRef[]> {
    await delay(120)
    const q = query.trim().toLowerCase()
    return USERS.filter((u) => !q || u.name.toLowerCase().includes(q))
  }

  async getEffectiveRights(userId: string): Promise<{
    entries: EffectiveEntry[]
    roles: RoleAssignmentPath[]
  }> {
    await delay(200)
    const paths = rolePathsForUser(userId)
    const byKey = new Map<string, EffectiveEntry>()
    for (const path of paths) {
      const m = MODEL.matrices.get(path.rootRoleId)
      if (!m) continue
      for (const [entity, actions] of m) {
        for (const [action, depth] of actions) {
          const key = `${entity}|${action}`
          const existing = byKey.get(key)
          if (!existing) byKey.set(key, { entity, action, depth, sources: [path] })
          else if (depth > existing.depth) {
            existing.depth = depth
            existing.sources = [path, ...existing.sources]
          } else existing.sources.push(path)
        }
      }
    }
    return {
      entries: [...byKey.values()].sort(
        (a, b) =>
          a.entity.localeCompare(b.entity) || a.action.localeCompare(b.action),
      ),
      roles: paths,
    }
  }

  async reverseLookup(
    entity: string,
    action: PrivilegeAction,
  ): Promise<ReverseLookupHit[]> {
    await delay(200)
    const granting = new Map<string, PrivilegeDepthMask>()
    for (const [rootId, m] of MODEL.matrices) {
      const depth = m.get(entity)?.get(action)
      if (depth) granting.set(rootId, depth)
    }
    const hits = new Map<string, ReverseLookupHit>()
    const add = (
      principal: PrincipalRef,
      depth: PrivilegeDepthMask,
      path: RoleAssignmentPath,
    ) => {
      const key = `${principal.type}:${principal.id}`
      const existing = hits.get(key)
      if (!existing) hits.set(key, { principal, depth, paths: [path] })
      else {
        existing.depth = maxDepth(existing.depth, depth)
        existing.paths.push(path)
      }
    }
    for (const [userId, roleIds] of USER_ROLES) {
      for (const rootId of roleIds) {
        const depth = granting.get(rootId)
        if (!depth) continue
        const user = USERS.find((u) => u.id === userId)
        if (user)
          add(user, depth, {
            rootRoleId: rootId,
            roleName: nameOf(rootId),
            via: 'direct',
          })
      }
    }
    for (const [teamId, roleIds] of TEAM_ROLES) {
      for (const rootId of roleIds) {
        const depth = granting.get(rootId)
        if (!depth) continue
        const team = TEAMS.find((t) => t.id === teamId)
        if (!team) continue
        const path: RoleAssignmentPath = {
          rootRoleId: rootId,
          roleName: nameOf(rootId),
          via: 'team',
          teamName: team.name,
        }
        add(team, depth, path)
        for (const memberId of TEAM_MEMBERS.get(teamId) ?? []) {
          const member = USERS.find((u) => u.id === memberId)
          if (member) add(member, depth, path)
        }
      }
    }
    return [...hits.values()].sort(
      (a, b) =>
        b.depth - a.depth ||
        a.principal.type.localeCompare(b.principal.type) ||
        a.principal.name.localeCompare(b.principal.name),
    )
  }

  async getHygieneReport(threshold: number): Promise<RoleHygieneReport> {
    await delay(200)
    const assigned = new Set<string>()
    for (const set of USER_ROLES.values()) for (const id of set) assigned.add(id)
    for (const set of TEAM_ROLES.values()) for (const id of set) assigned.add(id)
    const usersWithManyRoles: RoleHygieneReport['usersWithManyRoles'] = []
    for (const user of USERS) {
      const paths = rolePathsForUser(user.id)
      const roots = new Set(paths.map((p) => p.rootRoleId))
      if (roots.size > threshold)
        usersWithManyRoles.push({
          user,
          roleCount: roots.size,
          roles: [...new Set(paths.map((p) => p.roleName))].sort(),
        })
    }
    usersWithManyRoles.sort((a, b) => b.roleCount - a.roleCount)
    return {
      unassignedRoles: MODEL.roles.filter((r) => !assigned.has(r.rootRoleId)),
      usersWithManyRoles,
      threshold,
    }
  }
}

export const mockRoleAnalyzerService: RoleAnalyzerService =
  new MockRoleAnalyzerService()
