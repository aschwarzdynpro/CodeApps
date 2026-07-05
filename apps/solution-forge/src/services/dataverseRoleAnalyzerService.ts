import type {
  CoreRoleApplyInput,
  CoreRoleApplyResult,
  CoreRoleApplyStep,
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
import type {
  OrgBusinessUnit,
  OrgStructure,
  OrgTeam,
} from '../types/orgStructure'
import type { RoleAnalyzerService } from './roleAnalyzerService'
import { mockRoleAnalyzerService } from './mockRoleAnalyzerService'
import { powerModeReady } from '../PowerProvider'
import {
  currentOrgUrl,
  fetchXmlAllPages,
  fetchXmlQuery,
  rowNum,
  rowStr,
  type Row,
} from './currentEnvQuery'
import { isCurrentEnvKey, orgUrlForEnvKey } from '../config'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'
import {
  actionFromAccessRight,
  actionFromPrivilegeName,
  depthFromMask,
  maxDepth,
} from '../utils/privileges'

/**
 * Real implementation of {@link RoleAnalyzerService}.
 *
 * All reads use the connector's FetchXML passthrough (SP identity). The
 * intersect tables (`roleprivileges`, `systemuserroles`, `teamroles`,
 * `teammembership`) are traversed through link-entities from their parent
 * entity — intersects are queried via FetchXML by design (they are not
 * addable as data sources) and going through `privileges` / `systemusers` /
 * `teams` avoids depending on the intersects' entity-set names entirely.
 *
 * Aggregation rule: every role copy maps onto `parentrootroleid`; only the
 * ROOT roles' privilege rows are fetched (copies share the privilege set).
 */

const MODEL_STALE_MS = 15 * 60_000

/** privilegedepthmask → Web API PrivilegeDepth enum member (AddPrivilegesRole). */
const PRIVILEGE_DEPTH_ENUM: Record<number, string> = {
  1: 'Basic', // User
  2: 'Local', // Business Unit
  4: 'Deep', // Parent: Child BUs
  8: 'Global', // Organization
}

interface TeamMeta {
  buId: string
  teamType: number
  isDefault: boolean
}

interface OrgBuRow {
  id: string
  name: string
  parentId: string | null
}

interface AssignmentSnapshot {
  /** Enabled users. */
  users: Map<string, PrincipalRef>
  teams: Map<string, PrincipalRef>
  /** userId → set of ROOT role ids assigned directly. */
  userRoles: Map<string, Set<string>>
  /** teamId → set of ROOT role ids. */
  teamRoles: Map<string, Set<string>>
  /** teamId → member user ids. */
  teamMembers: Map<string, Set<string>>
  /** teamId → owning BU / type / default flag (Team & BU map). */
  teamMeta: Map<string, TeamMeta>
  /** userId → owning BU id (Team & BU map user counts + trace). */
  userBu: Map<string, string>
  /** Business-unit hierarchy rows. */
  businessUnits: OrgBuRow[]
}

interface CachedModel {
  model: SecurityModel
  assignments: AssignmentSnapshot
  /** "entity|action" → privilegeId, for the Core Role apply automatism. */
  privilegeIdByKey: Map<string, string>
  at: number
}

// Cached per environment (keyed by org URL) — the snapshot of one env must
// never be served for another.
const cache = new Map<string, CachedModel>()
const loadInFlight = new Map<string, Promise<CachedModel>>()

/** role copy id → root role id, filled while loading roles. */
function rootOf(row: Row): string {
  return (
    rowStr(row._parentrootroleid_value) ||
    rowStr(row.parentrootroleid) ||
    rowStr(row.roleid)
  )
}

async function loadRoles(orgUrl: string): Promise<{
  roles: RoleSummary[]
  rootByCopy: Map<string, string>
}> {
  const fetchXml =
    `<fetch>` +
    `<entity name="role">` +
    `<attribute name="roleid" />` +
    `<attribute name="name" />` +
    `<attribute name="ismanaged" />` +
    `<attribute name="parentrootroleid" />` +
    `</entity></fetch>`
  const rows = await fetchXmlAllPages('roles', fetchXml, orgUrl)
  const byRoot = new Map<string, RoleSummary>()
  const rootByCopy = new Map<string, string>()
  for (const row of rows) {
    const copyId = rowStr(row.roleid)
    const rootId = rootOf(row)
    rootByCopy.set(copyId, rootId)
    const existing = byRoot.get(rootId)
    if (existing) {
      existing.copyCount++
      // Prefer the root copy's own name/managed flag when we see it.
      if (copyId === rootId) {
        existing.name = rowStr(row.name) || existing.name
        existing.isManaged = row.ismanaged === true
      }
    } else {
      byRoot.set(rootId, {
        rootRoleId: rootId,
        name: rowStr(row.name),
        isManaged: row.ismanaged === true,
        copyCount: 1,
      })
    }
  }
  const roles = [...byRoot.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  return { roles, rootByCopy }
}

interface PrivilegeMeta {
  action: PrivilegeAction | null
  name: string
  entities: string[]
}

/** privilegeid → meta (action + entities), from privilege ⋈ objecttypecodes. */
async function loadPrivilegeMeta(
  orgUrl: string,
): Promise<Map<string, PrivilegeMeta>> {
  const fetchXml =
    `<fetch>` +
    `<entity name="privilege">` +
    `<attribute name="privilegeid" />` +
    `<attribute name="name" />` +
    `<attribute name="accessright" />` +
    `<link-entity name="privilegeobjecttypecodes" from="privilegeid" to="privilegeid" link-type="outer" alias="otc">` +
    `<attribute name="objecttypecode" />` +
    `</link-entity>` +
    `</entity></fetch>`
  const rows = await fetchXmlAllPages('privileges', fetchXml, orgUrl)
  const map = new Map<string, PrivilegeMeta>()
  const numericOtcs = new Set<number>()
  for (const row of rows) {
    const id = rowStr(row.privilegeid)
    if (!id) continue
    const name = rowStr(row.name)
    const meta = map.get(id) ?? {
      action:
        actionFromAccessRight(rowNum(row.accessright)) ??
        actionFromPrivilegeName(name),
      name,
      entities: [],
    }
    const otcRaw = row['otc.objecttypecode']
    const otc =
      typeof otcRaw === 'string'
        ? otcRaw
        : typeof otcRaw === 'number'
          ? String(otcRaw)
          : ''
    if (otc) {
      if (/^\d+$/.test(otc)) numericOtcs.add(Number(otc))
      if (!meta.entities.includes(otc)) meta.entities.push(otc)
    }
    map.set(id, meta)
  }
  // Some orgs return the numeric ObjectTypeCode instead of the logical
  // name — resolve those through EntityDefinitions once.
  if (numericOtcs.size > 0) {
    try {
      const nameByOtc = await loadEntityNamesByOtc(orgUrl)
      for (const meta of map.values())
        meta.entities = meta.entities.map((e) =>
          /^\d+$/.test(e) ? (nameByOtc.get(Number(e)) ?? e) : e,
        )
    } catch (err) {
      console.warn('[roles] ObjectTypeCode resolution failed:', err)
    }
  }
  return map
}

/** ObjectTypeCode → logical name via EntityDefinitions (metadata). */
async function loadEntityNamesByOtc(
  orgUrl: string,
): Promise<Map<number, string>> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    orgUrl || currentOrgUrl(),
    'EntityDefinitions',
    undefined,
    undefined,
    undefined,
    undefined,
    'LogicalName,ObjectTypeCode',
  )
  const rows =
    (result.data as { value?: Row[] } | undefined)?.value ?? []
  const map = new Map<number, string>()
  for (const row of rows) {
    const otc = rowNum(row.ObjectTypeCode)
    const name = rowStr(row.LogicalName)
    if (otc && name) map.set(otc, name)
  }
  return map
}

/** roleprivileges of the given ROOT roles, via privilege ⋈ roleprivileges. */
async function loadRolePrivileges(
  rootRoleIds: string[],
  privilegeMeta: Map<string, PrivilegeMeta>,
  orgUrl: string,
  onProgress?: (message: string) => void,
): Promise<{
  matrices: Map<string, RoleEntityMatrix>
  miscPrivileges: Map<string, string[]>
  entities: string[]
}> {
  const matrices = new Map<string, RoleEntityMatrix>()
  const miscPrivileges = new Map<string, string[]>()
  const entitySet = new Set<string>()
  const CHUNK = 40
  for (let i = 0; i < rootRoleIds.length; i += CHUNK) {
    const chunk = rootRoleIds.slice(i, i + CHUNK)
    onProgress?.(
      `Loading role privileges… (${Math.min(i + CHUNK, rootRoleIds.length)}/${rootRoleIds.length} roles)`,
    )
    const fetchXml =
      `<fetch>` +
      `<entity name="privilege">` +
      `<attribute name="privilegeid" />` +
      `<link-entity name="roleprivileges" from="privilegeid" to="privilegeid" alias="rp">` +
      `<attribute name="roleid" />` +
      `<attribute name="privilegedepthmask" />` +
      `<filter><condition attribute="roleid" operator="in">${chunk
        .map((id) => `<value>${id}</value>`)
        .join('')}</condition></filter>` +
      `</link-entity>` +
      `</entity></fetch>`
    const rows = await fetchXmlAllPages('privileges', fetchXml, orgUrl)
    for (const row of rows) {
      const privilegeId = rowStr(row.privilegeid)
      const roleId = rowStr(row['rp.roleid'])
      const depth = depthFromMask(rowNum(row['rp.privilegedepthmask']))
      const meta = privilegeMeta.get(privilegeId)
      if (!roleId || !meta) continue
      if (!meta.action || meta.entities.length === 0) {
        // Misc privilege (prvExportToExcel, …) — listed, not in the matrix.
        const list = miscPrivileges.get(roleId) ?? []
        if (!list.includes(meta.name)) list.push(meta.name)
        miscPrivileges.set(roleId, list)
        continue
      }
      const matrix: RoleEntityMatrix =
        matrices.get(roleId) ?? new Map<string, Map<PrivilegeAction, PrivilegeDepthMask>>()
      for (const entity of meta.entities) {
        entitySet.add(entity)
        const actions =
          matrix.get(entity) ?? new Map<PrivilegeAction, PrivilegeDepthMask>()
        actions.set(
          meta.action,
          maxDepth(actions.get(meta.action) ?? 0, depth),
        )
        matrix.set(entity, actions)
      }
      matrices.set(roleId, matrix)
    }
  }
  for (const list of miscPrivileges.values()) list.sort()
  return {
    matrices,
    miscPrivileges,
    entities: [...entitySet].sort(),
  }
}

/** Users + direct roles + owning BU (systemuser ⋈ systemuserroles). */
async function loadUserAssignments(
  rootByCopy: Map<string, string>,
  orgUrl: string,
): Promise<{
  users: Map<string, PrincipalRef>
  userRoles: Map<string, Set<string>>
  userBu: Map<string, string>
}> {
  const fetchXml =
    `<fetch>` +
    `<entity name="systemuser">` +
    `<attribute name="systemuserid" />` +
    `<attribute name="fullname" />` +
    `<attribute name="businessunitid" />` +
    `<link-entity name="systemuserroles" from="systemuserid" to="systemuserid" link-type="outer" alias="ur">` +
    `<attribute name="roleid" />` +
    `</link-entity>` +
    `<filter><condition attribute="isdisabled" operator="eq" value="false" /></filter>` +
    `</entity></fetch>`
  const rows = await fetchXmlAllPages('systemusers', fetchXml, orgUrl)
  const users = new Map<string, PrincipalRef>()
  const userRoles = new Map<string, Set<string>>()
  const userBu = new Map<string, string>()
  for (const row of rows) {
    const id = rowStr(row.systemuserid)
    if (!id) continue
    if (!users.has(id)) {
      users.set(id, { id, name: rowStr(row.fullname) || '(no name)', type: 'user' })
      const bu = rowStr(row._businessunitid_value)
      if (bu) userBu.set(id, bu)
    }
    const roleCopy = rowStr(row['ur.roleid'])
    if (roleCopy) {
      const root = rootByCopy.get(roleCopy) ?? roleCopy
      const set = userRoles.get(id) ?? new Set<string>()
      set.add(root)
      userRoles.set(id, set)
    }
  }
  return { users, userRoles, userBu }
}

/** Business-unit hierarchy rows. */
async function loadBusinessUnits(orgUrl: string): Promise<OrgBuRow[]> {
  const fetchXml =
    `<fetch>` +
    `<entity name="businessunit">` +
    `<attribute name="businessunitid" />` +
    `<attribute name="name" />` +
    `<attribute name="parentbusinessunitid" />` +
    `</entity></fetch>`
  const rows = await fetchXmlAllPages('businessunits', fetchXml, orgUrl)
  return rows
    .map((row) => ({
      id: rowStr(row.businessunitid),
      name: rowStr(row.name) || '(business unit)',
      parentId: rowStr(row._parentbusinessunitid_value) || null,
    }))
    .filter((b) => b.id)
}

/** Teams + team roles + membership + BU/type meta (two passes over team). */
async function loadTeamAssignments(
  rootByCopy: Map<string, string>,
  orgUrl: string,
): Promise<{
  teams: Map<string, PrincipalRef>
  teamRoles: Map<string, Set<string>>
  teamMembers: Map<string, Set<string>>
  teamMeta: Map<string, TeamMeta>
}> {
  const rolesFetch =
    `<fetch>` +
    `<entity name="team">` +
    `<attribute name="teamid" />` +
    `<attribute name="name" />` +
    `<attribute name="businessunitid" />` +
    `<attribute name="teamtype" />` +
    `<attribute name="isdefault" />` +
    `<link-entity name="teamroles" from="teamid" to="teamid" link-type="outer" alias="tr">` +
    `<attribute name="roleid" />` +
    `</link-entity>` +
    `</entity></fetch>`
  const roleRows = await fetchXmlAllPages('teams', rolesFetch, orgUrl)
  const teams = new Map<string, PrincipalRef>()
  const teamRoles = new Map<string, Set<string>>()
  const teamMeta = new Map<string, TeamMeta>()
  for (const row of roleRows) {
    const id = rowStr(row.teamid)
    if (!id) continue
    if (!teams.has(id)) {
      teams.set(id, { id, name: rowStr(row.name) || '(team)', type: 'team' })
      teamMeta.set(id, {
        buId: rowStr(row._businessunitid_value),
        teamType: rowNum(row.teamtype),
        isDefault: row.isdefault === true,
      })
    }
    const roleCopy = rowStr(row['tr.roleid'])
    if (roleCopy) {
      const root = rootByCopy.get(roleCopy) ?? roleCopy
      const set = teamRoles.get(id) ?? new Set<string>()
      set.add(root)
      teamRoles.set(id, set)
    }
  }
  // Membership only for teams that actually carry roles.
  const teamMembers = new Map<string, Set<string>>()
  const roleTeamIds = [...teamRoles.keys()]
  const CHUNK = 40
  for (let i = 0; i < roleTeamIds.length; i += CHUNK) {
    const chunk = roleTeamIds.slice(i, i + CHUNK)
    const memberFetch =
      `<fetch>` +
      `<entity name="team">` +
      `<attribute name="teamid" />` +
      `<link-entity name="teammembership" from="teamid" to="teamid" alias="tm">` +
      `<attribute name="systemuserid" />` +
      `</link-entity>` +
      `<filter><condition attribute="teamid" operator="in">${chunk
        .map((id) => `<value>${id}</value>`)
        .join('')}</condition></filter>` +
      `</entity></fetch>`
    const rows = await fetchXmlAllPages('teams', memberFetch, orgUrl)
    for (const row of rows) {
      const teamId = rowStr(row.teamid)
      const userId = rowStr(row['tm.systemuserid'])
      if (!teamId || !userId) continue
      const set = teamMembers.get(teamId) ?? new Set<string>()
      set.add(userId)
      teamMembers.set(teamId, set)
    }
  }
  return { teams, teamRoles, teamMembers, teamMeta }
}

async function buildSnapshot(
  orgUrl: string,
  onProgress?: (message: string) => void,
): Promise<CachedModel> {
  onProgress?.('Loading roles…')
  const { roles, rootByCopy } = await loadRoles(orgUrl)
  onProgress?.('Loading privilege metadata…')
  const privilegeMeta = await loadPrivilegeMeta(orgUrl)
  // Reverse lookup ("entity|action" → privilegeId) for the Core Role apply.
  const privilegeIdByKey = new Map<string, string>()
  for (const [privilegeId, meta] of privilegeMeta) {
    if (!meta.action) continue
    for (const entity of meta.entities)
      privilegeIdByKey.set(`${entity}|${meta.action}`, privilegeId)
  }
  const { matrices, miscPrivileges, entities } = await loadRolePrivileges(
    roles.map((r) => r.rootRoleId),
    privilegeMeta,
    orgUrl,
    onProgress,
  )
  onProgress?.('Loading user assignments…')
  const { users, userRoles, userBu } = await loadUserAssignments(
    rootByCopy,
    orgUrl,
  )
  onProgress?.('Loading team assignments…')
  const { teams, teamRoles, teamMembers, teamMeta } = await loadTeamAssignments(
    rootByCopy,
    orgUrl,
  )
  onProgress?.('Loading business units…')
  const businessUnits = await loadBusinessUnits(orgUrl)
  return {
    model: {
      roles,
      entities,
      matrices,
      miscPrivileges,
      loadedAt: new Date(),
    },
    assignments: {
      users,
      teams,
      userRoles,
      teamRoles,
      teamMembers,
      teamMeta,
      userBu,
      businessUnits,
    },
    privilegeIdByKey,
    at: Date.now(),
  }
}

/** All root role ids reaching a user, with their path. */
function rolePathsForUser(
  userId: string,
  snapshot: CachedModel,
): RoleAssignmentPath[] {
  const { assignments, model } = snapshot
  const nameOf = (rootId: string) =>
    model.roles.find((r) => r.rootRoleId === rootId)?.name ?? rootId
  const paths: RoleAssignmentPath[] = []
  for (const rootId of assignments.userRoles.get(userId) ?? [])
    paths.push({ rootRoleId: rootId, roleName: nameOf(rootId), via: 'direct' })
  for (const [teamId, members] of assignments.teamMembers) {
    if (!members.has(userId)) continue
    for (const rootId of assignments.teamRoles.get(teamId) ?? [])
      paths.push({
        rootRoleId: rootId,
        roleName: nameOf(rootId),
        via: 'team',
        teamName: assignments.teams.get(teamId)?.name ?? teamId,
      })
  }
  return paths
}

class DataverseRoleAnalyzerService implements RoleAnalyzerService {
  private async snapshot(
    envKey: string,
    onProgress?: (message: string) => void,
    force = false,
  ): Promise<CachedModel> {
    const orgUrl = orgUrlForEnvKey(envKey)
    const cached = cache.get(orgUrl)
    if (!force && cached && Date.now() - cached.at < MODEL_STALE_MS)
      return cached
    let inFlight = force ? undefined : loadInFlight.get(orgUrl)
    if (!inFlight) {
      inFlight = buildSnapshot(orgUrl, onProgress)
        .then((result) => {
          cache.set(orgUrl, result)
          return result
        })
        .finally(() => {
          loadInFlight.delete(orgUrl)
        })
      loadInFlight.set(orgUrl, inFlight)
    }
    return inFlight
  }

  async loadModel(
    envKey: string,
    onProgress?: (message: string) => void,
    force = false,
  ): Promise<SecurityModel> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockRoleAnalyzerService.loadModel(envKey, onProgress, force)
    return (await this.snapshot(envKey, onProgress, force)).model
  }

  async searchUsers(query: string, envKey: string): Promise<PrincipalRef[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockRoleAnalyzerService.searchUsers(query, envKey)
    const snap = await this.snapshot(envKey)
    const q = query.trim().toLowerCase()
    return [...snap.assignments.users.values()]
      .filter((u) => !q || u.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 25)
  }

  async getEffectiveRights(
    userId: string,
    envKey: string,
  ): Promise<{
    entries: EffectiveEntry[]
    roles: RoleAssignmentPath[]
  }> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockRoleAnalyzerService.getEffectiveRights(userId, envKey)
    const snap = await this.snapshot(envKey)
    const paths = rolePathsForUser(userId, snap)
    const byKey = new Map<string, EffectiveEntry>()
    for (const path of paths) {
      const matrix = snap.model.matrices.get(path.rootRoleId)
      if (!matrix) continue
      for (const [entity, actions] of matrix) {
        for (const [action, depth] of actions) {
          const key = `${entity}|${action}`
          const existing = byKey.get(key)
          if (!existing) {
            byKey.set(key, { entity, action, depth, sources: [path] })
          } else {
            if (depth > existing.depth) {
              existing.depth = depth
              existing.sources = [path, ...existing.sources]
            } else {
              existing.sources.push(path)
            }
          }
        }
      }
    }
    const entries = [...byKey.values()].sort(
      (a, b) =>
        a.entity.localeCompare(b.entity) || a.action.localeCompare(b.action),
    )
    return { entries, roles: paths }
  }

  async reverseLookup(
    entity: string,
    action: PrivilegeAction,
    envKey: string,
  ): Promise<ReverseLookupHit[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockRoleAnalyzerService.reverseLookup(entity, action, envKey)
    const snap = await this.snapshot(envKey)
    const { model, assignments } = snap
    // Roles granting the privilege at any depth.
    const granting = new Map<string, PrivilegeDepthMask>()
    for (const [rootId, matrix] of model.matrices) {
      const depth = matrix.get(entity)?.get(action)
      if (depth) granting.set(rootId, depth)
    }
    const nameOf = (rootId: string) =>
      model.roles.find((r) => r.rootRoleId === rootId)?.name ?? rootId
    const hits = new Map<string, ReverseLookupHit>()
    const add = (
      principal: PrincipalRef,
      depth: PrivilegeDepthMask,
      path: RoleAssignmentPath,
    ) => {
      const key = `${principal.type}:${principal.id}`
      const existing = hits.get(key)
      if (!existing) {
        hits.set(key, { principal, depth, paths: [path] })
      } else {
        existing.depth = maxDepth(existing.depth, depth)
        existing.paths.push(path)
      }
    }
    // Direct user assignments.
    for (const [userId, roleIds] of assignments.userRoles) {
      for (const rootId of roleIds) {
        const depth = granting.get(rootId)
        if (!depth) continue
        const user = assignments.users.get(userId)
        if (!user) continue
        add(user, depth, {
          rootRoleId: rootId,
          roleName: nameOf(rootId),
          via: 'direct',
        })
      }
    }
    // Teams with the role — the team itself is a hit, and its members
    // inherit with the team path.
    for (const [teamId, roleIds] of assignments.teamRoles) {
      for (const rootId of roleIds) {
        const depth = granting.get(rootId)
        if (!depth) continue
        const team = assignments.teams.get(teamId)
        if (!team) continue
        const path: RoleAssignmentPath = {
          rootRoleId: rootId,
          roleName: nameOf(rootId),
          via: 'team',
          teamName: team.name,
        }
        add(team, depth, path)
        for (const memberId of assignments.teamMembers.get(teamId) ?? []) {
          const member = assignments.users.get(memberId)
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

  async getHygieneReport(
    threshold: number,
    envKey: string,
  ): Promise<RoleHygieneReport> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockRoleAnalyzerService.getHygieneReport(threshold, envKey)
    const snap = await this.snapshot(envKey)
    const { model, assignments } = snap
    const assignedRoots = new Set<string>()
    for (const set of assignments.userRoles.values())
      for (const id of set) assignedRoots.add(id)
    for (const set of assignments.teamRoles.values())
      for (const id of set) assignedRoots.add(id)
    const unassignedRoles = model.roles.filter(
      (r) => !assignedRoots.has(r.rootRoleId),
    )
    const usersWithManyRoles: RoleHygieneReport['usersWithManyRoles'] = []
    for (const user of assignments.users.values()) {
      const paths = rolePathsForUser(user.id, snap)
      const roots = new Set(paths.map((p) => p.rootRoleId))
      if (roots.size > threshold)
        usersWithManyRoles.push({
          user,
          roleCount: roots.size,
          roles: [...new Set(paths.map((p) => p.roleName))].sort(),
        })
    }
    usersWithManyRoles.sort((a, b) => b.roleCount - a.roleCount)
    return { unassignedRoles, usersWithManyRoles, threshold }
  }

  /**
   * Core Role Extractor automatism. All writes go through the Dataverse
   * connector against the host org (the same connection the reads use — it
   * can call standard SDK actions per the documented action passthrough):
   *
   *   1. create the new role at the root business unit,
   *   2. add it to the working solution (AddSolutionComponent, type 20),
   *   3. AddPrivilegesRole with the consolidated depths,
   *   4. optionally RemovePrivilegeRole from each source role (which is then
   *      also added to the solution so its change is captured).
   *
   * Each step is reported independently; a failed create aborts the rest.
   * Host-env only — working solutions live in the host environment and the
   * write must be captured there.
   */
  async applyCoreRole(
    input: CoreRoleApplyInput,
    envKey: string,
  ): Promise<CoreRoleApplyResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockRoleAnalyzerService.applyCoreRole(input, envKey)
    if (!isCurrentEnvKey(envKey))
      throw new Error(
        'Core Role consolidation writes to the host environment only — switch the target environment to the host.',
      )
    const orgUrl = orgUrlForEnvKey(envKey)
    const snap = await this.snapshot(envKey)
    const steps: CoreRoleApplyStep[] = []
    const result: CoreRoleApplyResult = {
      ok: false,
      roleId: null,
      roleName: input.roleName,
      privilegesAdded: 0,
      privilegesRemoved: 0,
      steps,
    }

    // Resolve the privilege ids for the requested (entity, action) pairs.
    const resolved = input.privileges
      .map((p) => ({
        privilege: p,
        id: snap.privilegeIdByKey.get(`${p.entity}|${p.action}`),
      }))
      .filter((r): r is { privilege: (typeof input.privileges)[number]; id: string } => !!r.id)
    if (resolved.length === 0) {
      steps.push({
        label: 'Resolve privileges',
        ok: false,
        error: 'None of the selected privileges could be resolved to a privilege id.',
      })
      return result
    }

    // 1. Root business unit for the new role.
    let rootBuId = ''
    try {
      const buRows = await fetchXmlQuery(
        'businessunits',
        `<fetch count="1"><entity name="businessunit">` +
          `<attribute name="businessunitid" />` +
          `<filter><condition attribute="parentbusinessunitid" operator="null" /></filter>` +
          `</entity></fetch>`,
        orgUrl,
      )
      rootBuId = rowStr(buRows[0]?.businessunitid)
      if (!rootBuId) throw new Error('root business unit not found')
    } catch (err) {
      steps.push({
        label: 'Resolve root business unit',
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
      return result
    }

    // 2. Create the role.
    try {
      const created = await MicrosoftDataverseService.CreateRecordWithOrganization(
        'return=representation',
        'application/json',
        orgUrl,
        'roles',
        {
          name: input.roleName,
          'businessunitid@odata.bind': `/businessunits(${rootBuId})`,
        },
      )
      if (created && created.success === false)
        throw new Error(
          (created as { error?: { message?: string } }).error?.message ||
            'create rejected',
        )
      const data = created.data as Record<string, unknown> | undefined
      result.roleId =
        (typeof data?.roleid === 'string' && data.roleid) ||
        (typeof data?.id === 'string' && data.id) ||
        null
      if (!result.roleId) throw new Error('the created role returned no id')
      steps.push({ label: `Create role “${input.roleName}”`, ok: true })
    } catch (err) {
      steps.push({
        label: `Create role “${input.roleName}”`,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
      return result
    }

    // 3. Add the new role to the working solution (component type 20 = role).
    steps.push(
      await this.addRoleToSolution(
        orgUrl,
        result.roleId,
        input.workingSolutionUniqueName,
        `Add role to solution ${input.workingSolutionUniqueName}`,
      ),
    )

    // 4. Grant the consolidated privileges.
    try {
      const res = await MicrosoftDataverseService.PerformUnboundActionWithOrganization(
        orgUrl,
        'AddPrivilegesRole',
        {
          RoleId: result.roleId,
          Privileges: resolved.map((r) => ({
            Depth: PRIVILEGE_DEPTH_ENUM[r.privilege.depth] ?? 'Basic',
            PrivilegeId: r.id,
          })),
        },
      )
      if (res && res.success === false)
        throw new Error(
          (res as { error?: { message?: string } }).error?.message ||
            'AddPrivilegesRole rejected',
        )
      result.privilegesAdded = resolved.length
      steps.push({
        label: `Grant ${resolved.length} privilege${resolved.length === 1 ? '' : 's'}`,
        ok: true,
      })
    } catch (err) {
      steps.push({
        label: 'Grant privileges',
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // 5. Optionally strip the duplicates from the source roles.
    if (input.removeDuplicates) {
      for (const sourceId of input.sourceRoleIds) {
        const sourceName =
          snap.model.roles.find((r) => r.rootRoleId === sourceId)?.name ??
          sourceId
        // The modified source role must be captured in the solution too.
        steps.push(
          await this.addRoleToSolution(
            orgUrl,
            sourceId,
            input.workingSolutionUniqueName,
            `Add source role “${sourceName}” to solution`,
          ),
        )
        let removed = 0
        const errors: string[] = []
        for (const r of resolved) {
          try {
            const res =
              await MicrosoftDataverseService.PerformUnboundActionWithOrganization(
                orgUrl,
                'RemovePrivilegeRole',
                { RoleId: sourceId, PrivilegeId: r.id },
              )
            if (res && res.success === false)
              throw new Error(
                (res as { error?: { message?: string } }).error?.message ||
                  'rejected',
              )
            removed++
          } catch (err) {
            errors.push(err instanceof Error ? err.message : String(err))
          }
        }
        result.privilegesRemoved += removed
        steps.push({
          label: `Remove ${removed}/${resolved.length} privilege${resolved.length === 1 ? '' : 's'} from “${sourceName}”`,
          ok: errors.length === 0,
          error: errors[0],
        })
      }
    }

    result.ok = steps.every((s) => s.ok)
    return result
  }

  /** AddSolutionComponent for a role (component type 20) via the connector. */
  private async addRoleToSolution(
    orgUrl: string,
    roleId: string,
    solutionUniqueName: string,
    label: string,
  ): Promise<CoreRoleApplyStep> {
    try {
      const res = await MicrosoftDataverseService.PerformUnboundActionWithOrganization(
        orgUrl,
        'AddSolutionComponent',
        {
          ComponentType: 20,
          ComponentId: roleId,
          SolutionUniqueName: solutionUniqueName,
          AddRequiredComponents: false,
        },
      )
      if (res && res.success === false)
        throw new Error(
          (res as { error?: { message?: string } }).error?.message ||
            'AddSolutionComponent rejected',
        )
      return { label, ok: true }
    } catch (err) {
      return {
        label,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async getOrgStructure(envKey: string): Promise<OrgStructure> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockRoleAnalyzerService.getOrgStructure(envKey)
    const snap = await this.snapshot(envKey)
    return assembleOrgStructure(snap)
  }
}

/**
 * Build the Team & BU map structure from a cached security snapshot: BUs with
 * their user counts, teams grouped by owning BU (role names + members), and
 * the user list for the trace picker. Pure over the snapshot.
 */
function assembleOrgStructure(snap: CachedModel): OrgStructure {
  const { assignments, model } = snap
  const roleName = (rootId: string) =>
    model.roles.find((r) => r.rootRoleId === rootId)?.name ?? rootId
  const userName = (id: string) => assignments.users.get(id)?.name ?? id

  // BU user counts.
  const userCount = new Map<string, number>()
  for (const buId of assignments.userBu.values())
    userCount.set(buId, (userCount.get(buId) ?? 0) + 1)

  const businessUnits: OrgBusinessUnit[] = assignments.businessUnits.map(
    (b) => ({
      id: b.id,
      name: b.name,
      parentId: b.parentId,
      userCount: userCount.get(b.id) ?? 0,
    }),
  )

  const teamsByBu: Record<string, OrgTeam[]> = {}
  for (const [teamId, ref] of assignments.teams) {
    const meta = assignments.teamMeta.get(teamId)
    const buId = meta?.buId ?? ''
    const memberIds = [...(assignments.teamMembers.get(teamId) ?? [])]
    const team: OrgTeam = {
      id: teamId,
      name: ref.name,
      buId,
      teamType: meta?.teamType ?? 0,
      isDefault: meta?.isDefault ?? false,
      roleNames: [...(assignments.teamRoles.get(teamId) ?? [])]
        .map(roleName)
        .sort((a, b) => a.localeCompare(b)),
      memberIds,
      memberNames: memberIds.map(userName).sort((a, b) => a.localeCompare(b)),
    }
    ;(teamsByBu[buId] ??= []).push(team)
  }
  for (const list of Object.values(teamsByBu))
    list.sort(
      (a, b) =>
        b.roleNames.length - a.roleNames.length || a.name.localeCompare(b.name),
    )

  const users = [...assignments.users.values()]
    .map((u) => ({ id: u.id, name: u.name, buId: assignments.userBu.get(u.id) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { businessUnits, teamsByBu, users, loadedAt: model.loadedAt }
}

export const dataverseRoleAnalyzerService: RoleAnalyzerService =
  new DataverseRoleAnalyzerService()
