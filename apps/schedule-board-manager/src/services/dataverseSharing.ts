import { MicrosoftDataverseService as Dv } from '../generated/services/MicrosoftDataverseService'
import { SystemusersService } from '../generated/services/SystemusersService'
import { TeamsService } from '../generated/services/TeamsService'
import { ORG_URL } from '../config'
import { SEARCH_LIMIT, rankPrincipals, searchWords } from '../utils/principalSearch'
import {
  levelOfMask,
  type PrincipalRef,
  type Share,
  type ShareLevel,
} from '../types/board'

/**
 * Record sharing for schedule boards via the Dataverse connector
 * (`shared_commondataserviceforapps`), bound to a **user** connection: every
 * GrantAccess/ModifyAccess/RevokeAccess runs with the signed-in user's
 * privileges. A service-principal connection would let any app user share
 * any board with the SP's rights — deliberately not used here.
 *
 * Parameter shapes for the connector's "Perform an unbound action":
 * top-level entity parameters (`Target`, `Revokee`) as `entityset(id)`
 * strings, complex types (`PrincipalAccess`) as objects whose embedded
 * entity carries `@odata.type`. Entity parameters fall back to the object
 * form once if the string form is rejected; the working form is remembered.
 */

type Row = Record<string, unknown>

const BOARD_SET = 'msdyn_scheduleboardsettinges'
const PRINCIPAL_TEAM = 9

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function errorText(result: { success: boolean; error?: { message?: string } }): string {
  return result.error?.message ?? 'unbekannter Fehler'
}

function entityRef(form: 'string' | 'object', set: string, logical: string, idField: string, id: string): unknown {
  return form === 'string'
    ? `${set}(${id})`
    : { '@odata.type': `Microsoft.Dynamics.CRM.${logical}`, [idField]: id }
}

function principalEntity(p: PrincipalRef): Row {
  return p.type === 'user'
    ? { '@odata.type': 'Microsoft.Dynamics.CRM.systemuser', systemuserid: p.id }
    : { '@odata.type': 'Microsoft.Dynamics.CRM.team', teamid: p.id }
}

function accessMask(level: ShareLevel): string {
  return level === 'write' ? 'ReadAccess,WriteAccess' : 'ReadAccess'
}

/** Which form of entity parameter the connector accepted last time. */
let entityForm: 'string' | 'object' = 'string'

async function perform(action: string, build: (form: 'string' | 'object') => Row): Promise<void> {
  const first = entityForm
  const res = await Dv.PerformUnboundActionWithOrganization(ORG_URL, action, build(first))
  if (res.success) return
  const second = first === 'string' ? 'object' : 'string'
  const retry = await Dv.PerformUnboundActionWithOrganization(ORG_URL, action, build(second))
  if (retry.success) {
    entityForm = second
    return
  }
  console.warn(`[sharing] ${action} failed in both parameter forms`, res.error, retry.error)
  throw new Error(`${action}: ${errorText(res)}`)
}

export function sharingUnavailable(): string | null {
  return ORG_URL
    ? null
    : 'Freigaben brauchen die Org-URL der Umgebung (VITE_ORG_URL in .env beim Build).'
}

export async function listShares(boardId: string): Promise<Share[]> {
  // principalobjectaccess is only reachable via FetchXML (documented approach).
  const fetchXml =
    `<fetch>` +
    `<entity name="principalobjectaccess">` +
    `<attribute name="principalid" />` +
    `<attribute name="principaltypecode" />` +
    `<attribute name="accessrightsmask" />` +
    `<filter>` +
    `<condition attribute="objectid" operator="eq" value="${boardId}" />` +
    `<condition attribute="accessrightsmask" operator="gt" value="0" />` +
    `</filter>` +
    `</entity></fetch>`
  const result = await Dv.ListRecordsWithOrganization(
    ORG_URL,
    'principalobjectaccessset',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    fetchXml,
  )
  if (!result.success) throw new Error(`Freigaben lesen: ${errorText(result)}`)
  const rows = ((result.data as { value?: Row[] } | undefined)?.value ?? []).filter((r) => str(r.principalid))

  const userIds = rows.filter((r) => Number(r.principaltypecode) !== PRINCIPAL_TEAM).map((r) => str(r.principalid))
  const teamIds = rows.filter((r) => Number(r.principaltypecode) === PRINCIPAL_TEAM).map((r) => str(r.principalid))
  const [users, teams] = await Promise.all([usersByIds(userIds), teamsByIds(teamIds)])

  return rows.map((r) => {
    const id = str(r.principalid)
    const isTeam = Number(r.principaltypecode) === PRINCIPAL_TEAM
    const known = (isTeam ? teams : users).get(id.toLowerCase())
    const mask = Number(r.accessrightsmask ?? 0)
    return {
      id,
      type: isTeam ? 'team' : 'user',
      name: known?.name ?? `${isTeam ? 'Team' : 'Benutzer'} ${id.slice(0, 8)}…`,
      detail: known?.detail,
      level: levelOfMask(mask),
      mask,
    }
  })
}

function orFilter(field: string, ids: string[]): string {
  return ids.map((id) => `${field} eq ${id}`).join(' or ')
}

async function usersByIds(ids: string[]): Promise<Map<string, PrincipalRef>> {
  const map = new Map<string, PrincipalRef>()
  if (ids.length === 0) return map
  const res = await SystemusersService.getAll({
    select: ['systemuserid', 'fullname', 'internalemailaddress'],
    filter: orFilter('systemuserid', ids),
  })
  if (res.success) {
    for (const r of res.data as unknown as Row[]) {
      const id = str(r.systemuserid)
      map.set(id.toLowerCase(), { id, type: 'user', name: str(r.fullname) || id, detail: str(r.internalemailaddress) || undefined })
    }
  }
  return map
}

async function teamsByIds(ids: string[]): Promise<Map<string, PrincipalRef>> {
  const map = new Map<string, PrincipalRef>()
  if (ids.length === 0) return map
  const res = await TeamsService.getAll({ select: ['teamid', 'name', 'teamtype'], filter: orFilter('teamid', ids) })
  if (res.success) {
    for (const r of res.data as unknown as Row[]) {
      const id = str(r.teamid)
      map.set(id.toLowerCase(), { id, type: 'team', name: str(r.name) || id, detail: teamDetail(r.teamtype) })
    }
  }
  return map
}

/** teamtype: 0 owner team, 1 access team, 2/3 Entra security/Microsoft 365 group. */
const TEAM_ACCESS = 1

function teamDetail(teamtype: unknown): string {
  const t = Number(teamtype)
  return t === TEAM_ACCESS ? 'Zugriffsteam' : t === 2 || t === 3 ? 'Team (Entra-Gruppe)' : 'Team'
}

export async function searchPrincipals(term: string, options?: { owners?: boolean }): Promise<PrincipalRef[]> {
  const words = searchWords(term).map((w) => w.replace(/'/g, "''"))
  if (words.length === 0) return []
  const userFilter = words.map((w) => `(contains(fullname,'${w}') or contains(internalemailaddress,'${w}'))`).join(' and ')
  const teamFilter =
    words.map((w) => `contains(name,'${w}')`).join(' and ') + (options?.owners ? ` and teamtype ne ${TEAM_ACCESS}` : '')
  const [users, teams] = await Promise.all([
    SystemusersService.getAll({
      select: ['systemuserid', 'fullname', 'internalemailaddress'],
      // accessmode 3/4/5 = non-interactive, support, delegated admin — not dispatchers.
      filter: `${userFilter} and isdisabled eq false and accessmode ne 3 and accessmode ne 4 and accessmode ne 5`,
      orderBy: ['fullname asc'],
      top: SEARCH_LIMIT,
    }),
    TeamsService.getAll({
      select: ['teamid', 'name', 'teamtype'],
      filter: teamFilter,
      orderBy: ['name asc'],
      top: 10,
    }),
  ])
  if (!users.success) throw new Error(`Benutzer suchen: ${errorText(users)}`)
  const out: PrincipalRef[] = (users.data as unknown as Row[]).map((r) => ({
    id: str(r.systemuserid),
    type: 'user',
    name: str(r.fullname),
    detail: str(r.internalemailaddress) || undefined,
  }))
  if (teams.success) {
    for (const r of teams.data as unknown as Row[]) out.push({ id: str(r.teamid), type: 'team', name: str(r.name), detail: teamDetail(r.teamtype) })
  }
  return rankPrincipals(out, term)
}

export async function setShare(boardId: string, principal: PrincipalRef, level: ShareLevel, existing: boolean): Promise<void> {
  // GrantAccess only adds rights; lowering "write" to "read" needs ModifyAccess,
  // which replaces the mask of an existing share.
  await perform(existing ? 'ModifyAccess' : 'GrantAccess', (form) => ({
    Target: entityRef(form, BOARD_SET, 'msdyn_scheduleboardsetting', 'msdyn_scheduleboardsettingid', boardId),
    PrincipalAccess: { Principal: principalEntity(principal), AccessMask: accessMask(level) },
  }))
}

export async function revokeShare(boardId: string, principal: PrincipalRef): Promise<void> {
  await perform('RevokeAccess', (form) => ({
    Target: entityRef(form, BOARD_SET, 'msdyn_scheduleboardsetting', 'msdyn_scheduleboardsettingid', boardId),
    Revokee:
      principal.type === 'user'
        ? entityRef(form, 'systemusers', 'systemuser', 'systemuserid', principal.id)
        : entityRef(form, 'teams', 'team', 'teamid', principal.id),
  }))
}
