import type { IOperationResult } from '@microsoft/power-apps/data'
import { Msdyn_scheduleboardsettingesService as BoardsApi } from '../generated/services/Msdyn_scheduleboardsettingesService'
import { Msdyn_configurationsService as ConfigsApi } from '../generated/services/Msdyn_configurationsService'
import { Msdyn_bookingsetupmetadatasService as BookingSetupsApi } from '../generated/services/Msdyn_bookingsetupmetadatasService'
import { SavedqueriesService as SavedQueriesApi } from '../generated/services/SavedqueriesService'
import { UserqueriesService as UserQueriesApi } from '../generated/services/UserqueriesService'
import { TimezonedefinitionsService as TimeZonesApi } from '../generated/services/TimezonedefinitionsService'
import {
  BOARD_COLUMNS,
  BOARD_LOOKUPS,
  ConflictError,
  type Board,
  type ConfigDetail,
  type BoardContent,
  type BoardSummary,
  type ColumnValue,
  type LookupKey,
} from '../types/board'
import { changedFields, diffContent } from '../utils/boardRules'
import { VIEW_ENTITIES, type BoardService } from './boardService'
import * as sharing from './dataverseSharing'
import * as metadata from './dataverseMetadata'

/**
 * Dataverse implementation over the native Code App data sources
 * (`pac code add-data-source -a dataverse -t …`).
 *
 * The generated create/update signatures require every non-nullable column,
 * which a partial PATCH by definition doesn't have — payloads are built as
 * plain records and cast at the call site.
 */

type Row = Record<string, unknown>

const FV = '@OData.Community.Display.V1.FormattedValue'
const ENTITY_SET_CONFIG = 'msdyn_configurations'

function unwrap<T>(result: IOperationResult<T>, what: string): T {
  if (!result.success) {
    const msg = result.error?.message ?? 'unbekannter Fehler'
    throw new Error(`${what}: ${msg}`)
  }
  return result.data
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

const SUMMARY_SELECT = [
  'msdyn_scheduleboardsettingid',
  'msdyn_tabname',
  'msdyn_sharetype',
  'msdyn_ordernumber',
  'statecode',
  '_ownerid_value',
  'modifiedon',
  ...BOARD_LOOKUPS.map((l) => l.valueKey),
]

const FULL_SELECT = [
  ...SUMMARY_SELECT,
  ...BOARD_COLUMNS.map((c) => c.key).filter((k) => !SUMMARY_SELECT.includes(k)),
  'msdyn_settings',
  'msdyn_filtervalues',
  'versionnumber',
]

function lookupsOf(row: Row): Record<LookupKey, string | null> {
  const lookups = {} as Record<LookupKey, string | null>
  for (const lk of BOARD_LOOKUPS) lookups[lk.key] = str(row[lk.valueKey])
  return lookups
}

function toSummary(row: Row): BoardSummary {
  return {
    id: String(row.msdyn_scheduleboardsettingid),
    name: str(row.msdyn_tabname) ?? '(ohne Namen)',
    shareType: Number(row.msdyn_sharetype),
    active: Number(row.statecode) === 0,
    order: Number(row.msdyn_ordernumber ?? 0),
    ownerName: str(row[`_ownerid_value${FV}`]) ?? str(row.owneridname) ?? '—',
    ownerId: str(row._ownerid_value),
    modifiedOn: str(row.modifiedon),
    lookups: lookupsOf(row),
  }
}

function toBoard(row: Row): Board {
  const columns: Record<string, ColumnValue> = {}
  for (const col of BOARD_COLUMNS) {
    const v = row[col.key]
    columns[col.key] = v === undefined ? null : (v as ColumnValue)
  }
  const lookups = lookupsOf(row)
  const lookupNames = {} as Record<LookupKey, string | null>
  for (const lk of BOARD_LOOKUPS) lookupNames[lk.key] = str(row[`${lk.valueKey}${FV}`])
  const version = row.versionnumber
  return {
    ...toSummary(row),
    content: {
      columns,
      lookups,
      settings: str(row.msdyn_settings),
      filterValues: str(row.msdyn_filtervalues),
    },
    lookupNames,
    version: version === undefined || version === null ? null : Number(version),
  }
}

function toConfig(r: Row): ConfigDetail {
  return {
    id: String(r.msdyn_configurationid),
    name: str(r.msdyn_name) ?? String(r.msdyn_configurationid),
    type: r.msdyn_type === undefined || r.msdyn_type === null ? null : Number(r.msdyn_type),
    value: str(r.msdyn_value) ?? '',
    version: r.versionnumber === undefined || r.versionnumber === null ? null : Number(r.versionnumber),
  }
}

function bind(id: string | null): string | null {
  return id ? `/${ENTITY_SET_CONFIG}(${id})` : null
}

/** Full payload for a create — nulls are omitted so defaults apply. */
function createPayload(content: BoardContent): Row {
  const payload: Row = {}
  for (const col of BOARD_COLUMNS) {
    const v = content.columns[col.key]
    if (v !== null && v !== undefined) payload[col.key] = v
  }
  for (const lk of BOARD_LOOKUPS) {
    const id = content.lookups[lk.key]
    if (id) payload[`${lk.navProperty}@odata.bind`] = bind(id)
  }
  if (content.settings !== null) payload.msdyn_settings = content.settings
  if (content.filterValues !== null) payload.msdyn_filtervalues = content.filterValues
  return payload
}

async function currentVersion(id: string): Promise<number | null> {
  const row = unwrap(await BoardsApi.get(id, { select: ['versionnumber'] }), 'Version lesen') as unknown as Row
  return row.versionnumber === undefined || row.versionnumber === null ? null : Number(row.versionnumber)
}

async function update(id: string, payload: Row, what: string): Promise<void> {
  unwrap(await BoardsApi.update(id, payload as never), what)
}

function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

export const dataverseBoardService: BoardService = {
  source: 'dataverse',

  async listBoards() {
    const rows = unwrap(
      await BoardsApi.getAll({ select: SUMMARY_SELECT, orderBy: ['msdyn_ordernumber asc', 'msdyn_tabname asc'] }),
      'Boards laden',
    ) as unknown as Row[]
    return rows.map(toSummary)
  },

  async getBoard(id) {
    const row = unwrap(await BoardsApi.get(id, { select: FULL_SELECT }), 'Board laden') as unknown as Row
    return toBoard(row)
  },

  async createBoard(content) {
    const created = unwrap(
      await BoardsApi.create(createPayload(content) as never),
      'Board anlegen',
    ) as unknown as Row
    return String(created.msdyn_scheduleboardsettingid)
  },

  async updateBoard(original, next) {
    const changes = diffContent(original.content, next)
    if (changes.length === 0) return
    const fields = changedFields(changes)

    // No If-Match in the generated client — compare row versions instead.
    // The window between check and PATCH is small; the schedule board writes
    // settings on user interaction, not continuously.
    if (original.version !== null) {
      const now = await currentVersion(original.id)
      if (now !== null && now !== original.version) throw new ConflictError()
    }

    const payload: Row = {}
    for (const key of fields.columns) payload[key] = next.columns[key] ?? null
    for (const key of fields.lookups) {
      const lk = BOARD_LOOKUPS.find((l) => l.key === key)!
      payload[`${lk.navProperty}@odata.bind`] = bind(next.lookups[key])
    }
    if (fields.settings) payload.msdyn_settings = next.settings
    if (fields.filterValues) payload.msdyn_filtervalues = next.filterValues
    await update(original.id, payload, 'Board speichern')
  },

  async deleteBoard(id) {
    await BoardsApi.delete(id)
  },

  async setActive(id, active) {
    await update(id, { statecode: active ? 0 : 1, statuscode: active ? 1 : 2 }, active ? 'Aktivieren' : 'Deaktivieren')
  },

  async setOrder(updates) {
    for (const u of updates) {
      await update(u.id, { msdyn_ordernumber: u.order }, 'Reihenfolge speichern')
    }
  },

  async assignBoard(id, owner) {
    // PATCH on ownerid is the Web API form of AssignRequest.
    const set = owner.type === 'team' ? 'teams' : 'systemusers'
    await update(id, { 'ownerid@odata.bind': `/${set}(${owner.id})` }, 'Besitzer ändern')
  },

  async listConfigurations() {
    const rows = unwrap(
      await ConfigsApi.getAll({
        select: ['msdyn_configurationid', 'msdyn_name', 'msdyn_type'],
        filter: 'statecode eq 0',
        orderBy: ['msdyn_name asc'],
      }),
      'Konfigurationen laden',
    ) as unknown as Row[]
    return rows.map((r) => ({
      id: String(r.msdyn_configurationid),
      name: str(r.msdyn_name) ?? String(r.msdyn_configurationid),
      type: r.msdyn_type === undefined || r.msdyn_type === null ? null : Number(r.msdyn_type),
    }))
  },

  async listViews() {
    const entityFilter = VIEW_ENTITIES.map((e) => `returnedtypecode eq ${quote(e)}`).join(' or ')
    const options = {
      select: ['name', 'returnedtypecode'],
      filter: `(${entityFilter}) and statecode eq 0`,
      orderBy: ['name asc'],
    }
    const [system, personal] = await Promise.all([
      SavedQueriesApi.getAll({ ...options, select: ['savedqueryid', ...options.select] }),
      UserQueriesApi.getAll({ ...options, select: ['userqueryid', ...options.select] }),
    ])
    const sys = (unwrap(system, 'Systemansichten laden') as unknown as Row[]).map((r) => ({
      id: String(r.savedqueryid),
      name: str(r.name) ?? '',
      entity: String(r.returnedtypecode),
      kind: 'system' as const,
    }))
    // Personal views are best effort — a missing privilege must not break the editor.
    const pers = personal.success
      ? (personal.data as unknown as Row[]).map((r) => ({
          id: String(r.userqueryid),
          name: str(r.name) ?? '',
          entity: String(r.returnedtypecode),
          kind: 'personal' as const,
        }))
      : []
    return [...sys, ...pers]
  },

  async getConfiguration(id) {
    const r = unwrap(
      await ConfigsApi.get(id, { select: ['msdyn_configurationid', 'msdyn_name', 'msdyn_type', 'msdyn_value', 'versionnumber'] }),
      'Konfiguration laden',
    ) as unknown as Row
    return toConfig(r)
  },

  async updateConfiguration(original, value) {
    const now = unwrap(await ConfigsApi.get(original.id, { select: ['versionnumber'] }), 'Version lesen') as unknown as Row
    const v = now.versionnumber === undefined || now.versionnumber === null ? null : Number(now.versionnumber)
    if (original.version !== null && v !== null && v !== original.version) throw new ConflictError('Die Konfiguration wurde zwischenzeitlich geändert.')
    unwrap(await ConfigsApi.update(original.id, { msdyn_value: value } as never), 'Konfiguration speichern')
  },

  async createConfiguration(name, type, value) {
    const created = unwrap(
      await ConfigsApi.create({ msdyn_name: name, msdyn_type: type, msdyn_value: value } as never),
      'Konfiguration anlegen',
    ) as unknown as Row
    return String(created.msdyn_configurationid)
  },

  async listBookingSetups() {
    const rows = unwrap(
      await BookingSetupsApi.getAll({ select: ['msdyn_bookingsetupmetadataid', 'msdyn_entitylogicalname'] }),
      'Schedule-Typen laden',
    ) as unknown as Row[]
    return rows.map((r) => ({
      id: String(r.msdyn_bookingsetupmetadataid),
      entity: str(r.msdyn_entitylogicalname) ?? '',
    }))
  },

  async listTimeZones() {
    const rows = unwrap(
      await TimeZonesApi.getAll({ select: ['timezonedefinitionid', 'userinterfacename', 'bias'], orderBy: ['bias desc'] }),
      'Zeitzonen laden',
    ) as unknown as Row[]
    return rows.map((r) => ({
      id: String(r.timezonedefinitionid),
      name: str(r.userinterfacename) ?? String(r.timezonedefinitionid),
    }))
  },

  sharingUnavailable: sharing.sharingUnavailable,
  listShares: sharing.listShares,
  searchPrincipals: sharing.searchPrincipals,
  setShare: sharing.setShare,
  revokeShare: sharing.revokeShare,
  listTables: metadata.listTables,
  getTableInfo: metadata.getTableInfo,
}
