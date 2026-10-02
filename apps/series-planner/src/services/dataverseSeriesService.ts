import { Pro_seriesplansService as SeriesApi } from '../generated/services/Pro_seriesplansService'
import { Msdyn_workordersService as WorkOrdersApi } from '../generated/services/Msdyn_workordersService'
import { BookableresourcebookingsService as BookingsApi } from '../generated/services/BookableresourcebookingsService'
import { Msdyn_resourcerequirementsService as RequirementsApi } from '../generated/services/Msdyn_resourcerequirementsService'
import { BookableresourcesService as ResourcesApi } from '../generated/services/BookableresourcesService'
import { BookingstatusesService as BookingStatusesApi } from '../generated/services/BookingstatusesService'
import { Msdyn_projectsService as ProjectsApi } from '../generated/services/Msdyn_projectsService'
import { Msdyn_projecttasksService as ProjectTasksApi } from '../generated/services/Msdyn_projecttasksService'
import { AccountsService as AccountsApi } from '../generated/services/AccountsService'
import { Msdyn_workordertypesService as WorkOrderTypesApi } from '../generated/services/Msdyn_workordertypesService'
import { Msdyn_incidenttypesService as IncidentTypesApi } from '../generated/services/Msdyn_incidenttypesService'
import { PricelevelsService as PriceListsApi } from '../generated/services/PricelevelsService'
import type { IOperationOptions, IOperationResult } from '@microsoft/power-apps/data'
import { ORG_URL } from '../config'
import {
  BOOKING_STATUS_CANCELED,
  ConflictError,
  WO_STATUS,
  type AvailabilityData,
  type BookingInfo,
  type LookupKind,
  type OccurrenceState,
  type PlannedOccurrence,
  type Ref,
  type Series,
  type SeriesDraft,
  type SeriesSettings,
  type SeriesSummary,
} from '../types/series'
import { addDays, formatDate, todayIn } from '../utils/dates'
import { definitionRange, parseDefinition, serializeDefinition } from '../utils/definition'
import { describeSeries } from '../utils/recurrence'
import { loadClosures, loadWorkingTime } from './dataverseCalendar'
import { FV, LOOKUP_TABLE, chunks, containsAll, errorText, orFilter, refOf, str, unwrap, type Row } from './dataverseCommon'
import { bindKey, lookupTo, relationsOf } from './dataverseMetadata'
import type { SeriesService, SetupCheck } from './seriesService'

/**
 * Dataverse implementation over the native Code App data sources
 * (`pac code add-data-source -a dataverse -t …`, list in the README) plus the
 * Dataverse connector for metadata and calendars.
 *
 * Per occurrence the app writes a work order (series lookup, occurrence
 * date, project, service account, type) and one booking. Field Service
 * creates the work order's resource requirement itself; the app adjusts its
 * duration and links the booking to it, so the requirement doesn't show up
 * as unscheduled on the board. Nothing is ever deleted — cancelling sets the
 * booking to a cancelled booking status and the work order to "Cancelled".
 */

type Api = { getAll: (o?: IOperationOptions) => Promise<IOperationResult<unknown>> }

// ---------------------------------------------------------------------------
// Series record (pro_seriesplan)
// ---------------------------------------------------------------------------

type SettingsKey = Exclude<keyof SeriesSettings, 'name' | 'instructions'>

/** Lookups on pro_seriesplan: column → target entity set. Navigation property = column (created so by the provisioning script). */
const SERIES_LOOKUPS: Record<SettingsKey, { column: string; set: string }> = {
  project: { column: 'pro_project_ref', set: 'msdyn_projects' },
  projectTask: { column: 'pro_projecttask_ref', set: 'msdyn_projecttasks' },
  serviceAccount: { column: 'pro_serviceaccount_ref', set: 'accounts' },
  workOrderType: { column: 'pro_workordertype_ref', set: 'msdyn_workordertypes' },
  incidentType: { column: 'pro_incidenttype_ref', set: 'msdyn_incidenttypes' },
  priceList: { column: 'pro_pricelist_ref', set: 'pricelevels' },
  bookingStatus: { column: 'pro_bookingstatus_ref', set: 'bookingstatuses' },
}
const RESOURCE_LOOKUP = { column: 'pro_resource_ref', set: 'bookableresources' }

const SUMMARY_SELECT = [
  'pro_seriesplanid',
  'pro_name',
  'statecode',
  'modifiedon',
  'pro_summary_str',
  'pro_start_dat',
  'pro_end_dat',
  '_pro_project_ref_value',
  '_pro_resource_ref_value',
]
const FULL_SELECT = [
  ...SUMMARY_SELECT,
  'versionnumber',
  'pro_definition_txt',
  'pro_instructions_txt',
  ...Object.values(SERIES_LOOKUPS).map((l) => `_${l.column}_value`).filter((c) => !SUMMARY_SELECT.includes(c)),
]

const dateOnly = (v: unknown): string | null => str(v)?.slice(0, 10) ?? null

function toSummary(r: Row): SeriesSummary {
  return {
    id: String(r.pro_seriesplanid),
    name: str(r.pro_name) ?? '(ohne Namen)',
    active: Number(r.statecode ?? 0) === 0,
    project: refOf(r, '_pro_project_ref_value'),
    resource: refOf(r, '_pro_resource_ref_value'),
    summary: str(r.pro_summary_str) ?? '',
    startDate: dateOnly(r.pro_start_dat),
    endDate: dateOnly(r.pro_end_dat),
    modifiedOn: str(r.modifiedon),
  }
}

function seriesPayload(draft: SeriesDraft, previous: Series | null): Row {
  const { settings, definition } = draft
  const range = definitionRange(definition)
  const payload: Row = {
    pro_name: settings.name.trim(),
    pro_instructions_txt: settings.instructions || null,
    pro_definition_txt: serializeDefinition(definition),
    pro_summary_str: describeSeries(definition).slice(0, 400),
    pro_start_dat: range.first,
    pro_end_dat: range.last,
  }
  const bind = (column: string, set: string, id: string | null, before: string | null | undefined) => {
    // Create: omit empty lookups. Update: send only changed ones (null clears).
    if (previous === null ? id : (id ?? '').toLowerCase() !== (before ?? '').toLowerCase()) payload[`${column}@odata.bind`] = id ? `/${set}(${id})` : null
  }
  for (const [key, l] of Object.entries(SERIES_LOOKUPS) as [SettingsKey, (typeof SERIES_LOOKUPS)[SettingsKey]][]) {
    bind(l.column, l.set, settings[key]?.id ?? null, previous?.settings[key]?.id)
  }
  bind(RESOURCE_LOOKUP.column, RESOURCE_LOOKUP.set, definition.segments[0]?.resourceId ?? null, previous?.definition.segments[0]?.resourceId)
  return payload
}

// ---------------------------------------------------------------------------
// Booking statuses
// ---------------------------------------------------------------------------

interface StatusRow extends Ref {
  status: number
}

let statusCache: Promise<StatusRow[]> | null = null

function bookingStatuses(): Promise<StatusRow[]> {
  statusCache ??= BookingStatusesApi.getAll({ select: ['bookingstatusid', 'name', 'status'], filter: 'statecode eq 0' })
    .then((res) => (unwrap(res, 'Buchungsstatus laden') as unknown as Row[]).map((r) => ({ id: String(r.bookingstatusid), name: str(r.name) ?? '', status: Number(r.status) })))
    .catch((err) => {
      statusCache = null
      throw err
    })
  return statusCache
}

async function canceledStatusIds(): Promise<Set<string>> {
  return new Set((await bookingStatuses()).filter((s) => s.status === BOOKING_STATUS_CANCELED).map((s) => s.id.toLowerCase()))
}

// ---------------------------------------------------------------------------
// Occurrences
// ---------------------------------------------------------------------------

function stateOf(systemStatus: number, booked: boolean): OccurrenceState {
  if (systemStatus === WO_STATUS.canceled) return 'canceled'
  if (systemStatus === WO_STATUS.completed || systemStatus === WO_STATUS.posted) return 'completed'
  if (systemStatus === WO_STATUS.inProgress) return 'inProgress'
  return booked ? 'scheduled' : 'unscheduled'
}

/** Navigation properties on work order / booking (metadata, else the usual casing). */
const WO = 'msdyn_workorder'
const BOOKING = 'bookableresourcebooking'

async function requirementOf(workOrderId: string): Promise<string | null> {
  const res = await RequirementsApi.getAll({ select: ['msdyn_resourcerequirementid'], filter: `_msdyn_workorder_value eq ${workOrderId}`, top: 1 })
  const rows = res.success ? (res.data as unknown as Row[]) : []
  return rows[0] ? String(rows[0].msdyn_resourcerequirementid) : null
}

async function statusForNewBookings(series: Series): Promise<string> {
  const id = series.settings.bookingStatus?.id ?? (await dataverseSeriesService.defaultBookingStatus())?.id
  if (!id) throw new Error('Kein Buchungsstatus für neue Buchungen gefunden — im Serienplan einen wählen.')
  return id
}

async function createBooking(series: Series, workOrderId: string, workOrderName: string, occ: PlannedOccurrence): Promise<string> {
  if (!occ.resourceId) throw new Error('keine Ressource gewählt')
  const requirementId = await requirementOf(workOrderId)
  if (requirementId) {
    // The work order's requirement carries a default duration — align it so nothing stays "unscheduled".
    const adjusted = await RequirementsApi.update(requirementId, { msdyn_duration: occ.durationMinutes, msdyn_fromdate: occ.start, msdyn_todate: occ.end } as never)
    if (!adjusted.success) console.warn('[series] requirement not adjusted', adjusted.error)
  }
  const payload: Row = {
    name: `${workOrderName} · ${series.name}`.slice(0, 100),
    starttime: occ.start,
    endtime: occ.end,
    duration: occ.durationMinutes,
    bookingtype: 1,
    [await bindKey(BOOKING, 'resource', 'Resource')]: `/bookableresources(${occ.resourceId})`,
    [await bindKey(BOOKING, 'bookingstatus', 'BookingStatus')]: `/bookingstatuses(${await statusForNewBookings(series)})`,
    [await bindKey(BOOKING, 'msdyn_workorder', 'msdyn_WorkOrder')]: `/msdyn_workorders(${workOrderId})`,
  }
  if (requirementId) payload[await bindKey(BOOKING, 'msdyn_resourcerequirement', 'msdyn_ResourceRequirement')] = `/msdyn_resourcerequirements(${requirementId})`
  const created = unwrap(await BookingsApi.create(payload as never), 'Buchung anlegen') as unknown as Row
  return String(created.bookableresourcebookingid)
}

// ---------------------------------------------------------------------------
// Lookups for pickers
// ---------------------------------------------------------------------------

const LOOKUPS: Record<LookupKind, { api: Api; id: string; name: string; filter?: string }> = {
  project: { api: ProjectsApi, id: 'msdyn_projectid', name: 'msdyn_subject', filter: 'statecode eq 0' },
  projectTask: { api: ProjectTasksApi, id: 'msdyn_projecttaskid', name: 'msdyn_subject', filter: 'statecode eq 0' },
  account: { api: AccountsApi, id: 'accountid', name: 'name', filter: 'statecode eq 0' },
  workOrderType: { api: WorkOrderTypesApi, id: 'msdyn_workordertypeid', name: 'msdyn_name', filter: 'statecode eq 0' },
  incidentType: { api: IncidentTypesApi, id: 'msdyn_incidenttypeid', name: 'msdyn_name', filter: 'statecode eq 0' },
  resource: { api: ResourcesApi, id: 'bookableresourceid', name: 'name', filter: 'statecode eq 0' },
  bookingStatus: { api: BookingStatusesApi, id: 'bookingstatusid', name: 'name', filter: `statecode eq 0 and status ne ${BOOKING_STATUS_CANCELED}` },
  priceList: { api: PriceListsApi, id: 'pricelevelid', name: 'name', filter: 'statecode eq 0' },
}

const toRefs = (rows: Row[], id: string, name: string): Ref[] => rows.map((r) => ({ id: String(r[id]), name: str(r[name]) ?? String(r[id]) }))

// ---------------------------------------------------------------------------

export const dataverseSeriesService: SeriesService = {
  source: 'dataverse',

  async listSeries() {
    const rows = unwrap(await SeriesApi.getAll({ select: SUMMARY_SELECT, orderBy: ['pro_name asc'] }), 'Serienpläne laden') as unknown as Row[]
    return rows.map(toSummary)
  },

  async getSeries(id) {
    const r = unwrap(await SeriesApi.get(id, { select: FULL_SELECT }), 'Serienplan laden') as unknown as Row
    const parsed = parseDefinition(str(r.pro_definition_txt))
    if (!parsed.ok) throw new Error(`Serienplan „${str(r.pro_name) ?? id}“: ${parsed.error}`)
    const settings: SeriesSettings = {
      name: str(r.pro_name) ?? '',
      instructions: str(r.pro_instructions_txt) ?? '',
      project: refOf(r, '_pro_project_ref_value'),
      projectTask: refOf(r, '_pro_projecttask_ref_value'),
      serviceAccount: refOf(r, '_pro_serviceaccount_ref_value'),
      workOrderType: refOf(r, '_pro_workordertype_ref_value'),
      incidentType: refOf(r, '_pro_incidenttype_ref_value'),
      priceList: refOf(r, '_pro_pricelist_ref_value'),
      bookingStatus: refOf(r, '_pro_bookingstatus_ref_value'),
    }
    return { ...toSummary(r), settings, definition: parsed.value, version: r.versionnumber == null ? null : Number(r.versionnumber) }
  },

  async createSeries(draft) {
    const created = unwrap(await SeriesApi.create(seriesPayload(draft, null) as never), 'Serienplan anlegen') as unknown as Row
    return String(created.pro_seriesplanid)
  },

  async updateSeries(original, draft) {
    if (original.version !== null) {
      const now = unwrap(await SeriesApi.get(original.id, { select: ['versionnumber'] }), 'Version lesen') as unknown as Row
      if (now.versionnumber != null && Number(now.versionnumber) !== original.version) throw new ConflictError()
    }
    unwrap(await SeriesApi.update(original.id, seriesPayload(draft, original) as never), 'Serienplan speichern')
    return dataverseSeriesService.getSeries(original.id)
  },

  async setActive(id, active) {
    unwrap(await SeriesApi.update(id, { statecode: active ? 0 : 1, statuscode: active ? 1 : 2 } as never), active ? 'Aktivieren' : 'Deaktivieren')
  },

  async listOccurrences(seriesId) {
    const wos = unwrap(
      await WorkOrdersApi.getAll({ select: ['msdyn_workorderid', 'msdyn_name', 'msdyn_systemstatus', 'pro_occurrence_dat'], filter: `_pro_seriesplan_ref_value eq ${seriesId}` }),
      'Arbeitsaufträge laden',
    ) as unknown as Row[]
    const canceled = await canceledStatusIds()
    const bookings: Row[] = []
    for (const ids of chunks(wos.map((w) => String(w.msdyn_workorderid)))) {
      const res = await BookingsApi.getAll({
        select: ['bookableresourcebookingid', 'starttime', 'endtime', 'createdon', '_resource_value', '_bookingstatus_value', '_msdyn_workorder_value'],
        filter: orFilter('_msdyn_workorder_value', ids),
      })
      bookings.push(...(unwrap(res, 'Buchungen laden') as unknown as Row[]))
    }
    return wos
      .filter((w) => dateOnly(w.pro_occurrence_dat))
      .map((w) => {
        const woId = String(w.msdyn_workorderid).toLowerCase()
        const active = bookings
          .filter((b) => str(b._msdyn_workorder_value)?.toLowerCase() === woId && !canceled.has((str(b._bookingstatus_value) ?? '').toLowerCase()))
          .sort((a, b) => (str(b.createdon) ?? '').localeCompare(str(a.createdon) ?? ''))[0]
        return {
          key: dateOnly(w.pro_occurrence_dat)!,
          workOrderId: String(w.msdyn_workorderid),
          workOrderName: str(w.msdyn_name) ?? '',
          bookingId: active ? String(active.bookableresourcebookingid) : null,
          start: active ? str(active.starttime) : null,
          end: active ? str(active.endtime) : null,
          resource: active ? refOf(active, '_resource_value') : null,
          state: stateOf(Number(w.msdyn_systemstatus), !!active),
        }
      })
      .sort((a, b) => a.key.localeCompare(b.key))
  },

  async createOccurrence(series, occ) {
    const s = series.settings
    if (!s.project || !s.serviceAccount || !s.workOrderType) throw new Error('Projekt, Dienstkonto und Arbeitsauftragstyp müssen gesetzt sein.')
    const project = await lookupTo(WO, 'msdyn_project')
    if (!project) throw new Error('Der Arbeitsauftrag hat kein Projektfeld — ist die Integration Field Service ↔ Project Operations aktiv?')
    const payload: Row = {
      pro_occurrence_dat: occ.key,
      msdyn_workordersummary: `${series.name} – ${formatDate(occ.date)}`,
      msdyn_timefrompromised: occ.start,
      msdyn_timetopromised: occ.end,
      [await bindKey(WO, 'pro_seriesplan_ref', 'pro_seriesplan_ref')]: `/pro_seriesplans(${series.id})`,
      [`${project.nav}@odata.bind`]: `/msdyn_projects(${s.project.id})`,
      [await bindKey(WO, 'msdyn_serviceaccount', 'msdyn_ServiceAccount')]: `/accounts(${s.serviceAccount.id})`,
      [await bindKey(WO, 'msdyn_workordertype', 'msdyn_WorkOrderType')]: `/msdyn_workordertypes(${s.workOrderType.id})`,
    }
    if (s.instructions) payload.msdyn_instructions = s.instructions
    if (s.incidentType) payload[await bindKey(WO, 'msdyn_primaryincidenttype', 'msdyn_PrimaryIncidentType')] = `/msdyn_incidenttypes(${s.incidentType.id})`
    if (s.priceList) payload[await bindKey(WO, 'msdyn_pricelist', 'msdyn_PriceList')] = `/pricelevels(${s.priceList.id})`
    if (s.projectTask) {
      const task = await lookupTo(WO, 'msdyn_projecttask')
      if (!task) throw new Error('Der Arbeitsauftrag hat kein Feld für die Projektaufgabe.')
      payload[`${task.nav}@odata.bind`] = `/msdyn_projecttasks(${s.projectTask.id})`
    }
    const created = unwrap(await WorkOrdersApi.create(payload as never), 'Arbeitsauftrag anlegen') as unknown as Row
    const workOrderId = String(created.msdyn_workorderid)
    const workOrderName = str(created.msdyn_name) ?? workOrderId.slice(0, 8)
    let bookingId: string
    try {
      bookingId = await createBooking(series, workOrderId, workOrderName, occ)
    } catch (err) {
      // The work order stays (unscheduled); "Abgleichen" books it later.
      throw new Error(`Arbeitsauftrag ${workOrderName} angelegt, Buchung fehlgeschlagen: ${errorText(err)}`)
    }
    return {
      key: occ.key,
      workOrderId,
      workOrderName,
      bookingId,
      start: occ.start,
      end: occ.end,
      resource: occ.resourceId ? { id: occ.resourceId, name: '' } : null,
      state: 'scheduled',
    }
  },

  async updateOccurrence(series, record, occ) {
    if (!record.bookingId) {
      await createBooking(series, record.workOrderId, record.workOrderName, occ)
    } else {
      if (!occ.resourceId) throw new Error('Buchung ändern: keine Ressource gewählt.')
      const payload: Row = {
        starttime: occ.start,
        endtime: occ.end,
        duration: occ.durationMinutes,
        [await bindKey(BOOKING, 'resource', 'Resource')]: `/bookableresources(${occ.resourceId})`,
      }
      unwrap(await BookingsApi.update(record.bookingId, payload as never), `Buchung ${record.workOrderName} ändern`)
    }
    // Time promised follows the occurrence; a linked project task may own these fields — not fatal.
    const promised = await WorkOrdersApi.update(record.workOrderId, { msdyn_timefrompromised: occ.start, msdyn_timetopromised: occ.end } as never)
    if (!promised.success) console.warn('[series] time promised not updated', promised.error)
  },

  async cancelOccurrence(record) {
    if (record.bookingId) {
      const status = (await bookingStatuses()).find((s) => s.status === BOOKING_STATUS_CANCELED)
      if (!status) throw new Error('Kein Buchungsstatus „Abgebrochen“ (status = 3) gefunden.')
      unwrap(
        await BookingsApi.update(record.bookingId, { [await bindKey(BOOKING, 'bookingstatus', 'BookingStatus')]: `/bookingstatuses(${status.id})` } as never),
        `Buchung ${record.workOrderName} abbrechen`,
      )
    }
    unwrap(await WorkOrdersApi.update(record.workOrderId, { msdyn_systemstatus: WO_STATUS.canceled } as never), `Arbeitsauftrag ${record.workOrderName} abbrechen`)
  },

  async loadAvailability(resourceIds, from, to) {
    const ids = [...new Set(resourceIds.map((r) => r.toLowerCase()))]
    const unavailable: string[] = []
    const result: AvailabilityData = { closures: null, workingTime: {}, bookings: [], unavailable }
    if (ids.length === 0) return result

    const canceled = await canceledStatusIds()
    for (const chunk of chunks(ids)) {
      const res = await BookingsApi.getAll({
        select: ['bookableresourcebookingid', 'name', 'starttime', 'endtime', '_resource_value', '_bookingstatus_value', '_msdyn_workorder_value'],
        filter: `${orFilter('_resource_value', chunk)} and starttime lt ${to} and endtime gt ${from}`,
      })
      for (const r of unwrap(res, 'Buchungen der Ressourcen laden') as unknown as Row[]) {
        if (canceled.has((str(r._bookingstatus_value) ?? '').toLowerCase())) continue
        result.bookings.push({
          id: String(r.bookableresourcebookingid),
          resourceId: str(r._resource_value) ?? '',
          start: str(r.starttime) ?? from,
          end: str(r.endtime) ?? from,
          name: str(r[`_msdyn_workorder_value${FV}`]) ?? str(r.name) ?? 'Buchung',
          workOrderId: str(r._msdyn_workorder_value),
        } satisfies BookingInfo)
      }
    }

    try {
      const rows = unwrap(await ResourcesApi.getAll({ select: ['bookableresourceid', '_calendarid_value'], filter: orFilter('bookableresourceid', ids) }), 'Ressourcen laden') as unknown as Row[]
      const byCalendar = new Map(rows.filter((r) => str(r._calendarid_value)).map((r) => [String(r._calendarid_value).toLowerCase(), String(r.bookableresourceid).toLowerCase()]))
      const slots = await loadWorkingTime([...byCalendar.keys()], from, to)
      for (const [calendarId, resourceId] of byCalendar) result.workingTime[resourceId] = slots.get(calendarId) ?? []
    } catch (err) {
      unavailable.push(`Arbeitszeiten/Abwesenheiten nicht lesbar (${errorText(err)})`)
    }
    try {
      result.closures = await loadClosures(from, to)
    } catch (err) {
      unavailable.push(`Feiertage nicht lesbar (${errorText(err)})`)
    }
    return result
  },

  async search(kind, term, context) {
    const l = LOOKUPS[kind]
    const filter = [l.filter, containsAll(l.name, term), kind === 'projectTask' && context?.projectId ? `_msdyn_project_value eq ${context.projectId}` : null]
      .filter(Boolean)
      .join(' and ')
    const res = await l.api.getAll({ select: [l.id, l.name], filter: filter || undefined, orderBy: [`${l.name} asc`], top: 25 })
    return toRefs(unwrap(res, 'Suche') as Row[], l.id, l.name)
  },

  async resolveRefs(kind, ids) {
    if (ids.length === 0) return []
    const l = LOOKUPS[kind]
    const out: Ref[] = []
    for (const chunk of chunks(ids)) {
      const res = await l.api.getAll({ select: [l.id, l.name], filter: orFilter(l.id, chunk) })
      out.push(...toRefs(unwrap(res, 'Namen laden') as Row[], l.id, l.name))
    }
    return out
  },

  async projectDefaults(projectId) {
    const r = unwrap(await ProjectsApi.get(projectId, { select: ['_msdyn_customer_value'] }), 'Projekt laden') as unknown as Row
    const isAccount = str(r[`_msdyn_customer_value${LOOKUP_TABLE}`]) === 'account'
    return { serviceAccount: isAccount ? refOf(r, '_msdyn_customer_value') : null }
  },

  async defaultBookingStatus() {
    const committed = (await bookingStatuses()).filter((s) => s.status === 2)
    const hit = committed.find((s) => /^(scheduled|geplant)$/i.test(s.name.trim())) ?? committed[0]
    return hit ? { id: hit.id, name: hit.name } : null
  },

  async checkSetup() {
    const checks: SetupCheck[] = []
    const check = async (label: string, run: () => Promise<string>) => {
      try {
        checks.push({ label, ok: true, detail: await run() })
      } catch (err) {
        checks.push({ label, ok: false, detail: errorText(err) })
      }
    }
    await check('Org-URL', async () => {
      if (!ORG_URL) throw new Error('VITE_ORG_URL fehlt — ohne sie gehen Metadaten, Arbeitszeiten und Feiertage nicht.')
      return ORG_URL
    })
    await check('Tabelle Serienplan', async () => {
      unwrap(await SeriesApi.getAll({ select: ['pro_seriesplanid'], top: 1 }), 'pro_seriesplan')
      return 'pro_seriesplan lesbar'
    })
    await check('Serie am Arbeitsauftrag', async () => {
      const rel = (await relationsOf(WO)).find((r) => r.attribute === 'pro_seriesplan_ref')
      if (!rel) throw new Error('Spalte pro_seriesplan_ref fehlt am Arbeitsauftrag (scripts/provision-schema.ps1).')
      return `pro_seriesplan_ref (${rel.nav}), Termin in pro_occurrence_dat`
    })
    await check('Projekt am Arbeitsauftrag', async () => {
      const rel = await lookupTo(WO, 'msdyn_project')
      if (!rel) throw new Error('Kein Lookup auf msdyn_project — Integration Field Service ↔ Project Operations aktivieren.')
      const task = await lookupTo(WO, 'msdyn_projecttask')
      return `${rel.attribute} (${rel.nav})${task ? `, Aufgabe ${task.attribute}` : ', ohne Projektaufgabe'}`
    })
    await check('Buchungsstatus', async () => {
      const s = await dataverseSeriesService.defaultBookingStatus()
      const cancel = (await bookingStatuses()).find((x) => x.status === BOOKING_STATUS_CANCELED)
      if (!s || !cancel) throw new Error('Status „Geplant“ (2) oder „Abgebrochen“ (3) fehlt.')
      return `neu: ${s.name}, Absage: ${cancel.name}`
    })
    await check('Feiertage', async () => {
      const today = todayIn('Europe/Berlin')
      const list = await loadClosures(`${today}T00:00:00Z`, `${addDays(today, 365)}T00:00:00Z`)
      return list.length ? `${list.length} Geschäftsschließungen im nächsten Jahr, z. B. ${list[0].name}` : 'Keine Geschäftsschließungen gepflegt'
    })
    return checks
  },
}
