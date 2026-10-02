import { ConflictError, type AvailabilityData, type Interval, type LookupKind, type OccurrenceRecord, type Ref, type Series } from '../types/series'
import { addDays, formatDate, weekday, zonedToUtc } from '../utils/dates'
import { definitionRange } from '../utils/definition'
import { describeSeries } from '../utils/recurrence'
import type { SeriesService } from './seriesService'
import {
  MOCK_ABSENCES,
  MOCK_ACCOUNTS,
  MOCK_BOOKING_STATUSES,
  MOCK_INCIDENT_TYPES,
  MOCK_PRICE_LISTS,
  MOCK_PROJECTS,
  MOCK_RESOURCES,
  MOCK_TASKS,
  MOCK_WO_TYPES,
  TZ,
  WORK_HOURS,
  createMockState,
  holidaysOf,
  type MockBooking,
} from './mockData'

/** In-memory implementation for local development — state lives until reload. */

const state = createMockState()

const delay = <T,>(value: T, ms = 120): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms))
const clone = <T,>(v: T): T => structuredClone(v)
const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

const LISTS: Record<LookupKind, () => (Ref & { projectId?: string; status?: number })[]> = {
  project: () => MOCK_PROJECTS,
  projectTask: () => MOCK_TASKS,
  account: () => MOCK_ACCOUNTS,
  workOrderType: () => MOCK_WO_TYPES,
  incidentType: () => MOCK_INCIDENT_TYPES,
  resource: () => MOCK_RESOURCES,
  bookingStatus: () => MOCK_BOOKING_STATUSES.filter((s) => s.status !== 3),
  priceList: () => MOCK_PRICE_LISTS,
}

function findSeries(id: string): Series {
  const s = state.series.find((x) => same(x.id, id))
  if (!s) throw new Error(`Serienplan ${id} nicht gefunden.`)
  return s
}

function activeBooking(workOrderId: string): MockBooking | undefined {
  return state.bookings
    .filter((b) => b.workOrderId === workOrderId && !b.canceled)
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn))[0]
}

function toRecord(woId: string): OccurrenceRecord {
  const wo = state.workOrders.find((w) => w.id === woId)!
  const b = activeBooking(wo.id)
  return {
    key: wo.key!,
    workOrderId: wo.id,
    workOrderName: wo.name,
    bookingId: b?.id ?? null,
    start: b?.start ?? null,
    end: b?.end ?? null,
    resource: b ? (MOCK_RESOURCES.find((r) => r.id === b.resourceId) ?? null) : null,
    state: wo.state === 'scheduled' && !b ? 'unscheduled' : wo.state,
  }
}

function resourceName(id: string | null): string {
  return MOCK_RESOURCES.find((r) => same(r.id, id))?.name ?? 'Unbekannt'
}

function newBooking(series: Series, woId: string, woName: string, occ: { start: string; end: string; resourceId: string | null }): MockBooking {
  if (!occ.resourceId) throw new Error('Buchung anlegen: keine Ressource gewählt.')
  const b: MockBooking = {
    id: crypto.randomUUID(),
    workOrderId: woId,
    resourceId: occ.resourceId,
    start: occ.start,
    end: occ.end,
    name: `${woName} · ${series.name}`,
    canceled: false,
    createdOn: new Date().toISOString(),
  }
  state.bookings.push(b)
  return b
}

/** Mon–Fri working time minus absences and holidays, per day in the range. */
function workingTime(resourceId: string, from: string, to: string): Interval[] {
  const out: Interval[] = []
  const holidays = new Set<string>()
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) holidaysOf(y).forEach((h) => holidays.add(h.date))
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (weekday(d) >= 6 || holidays.has(d)) continue
    if (MOCK_ABSENCES.some((a) => a.resourceId === resourceId && d >= a.from && d <= a.to)) continue
    out.push({ start: zonedToUtc(d, WORK_HOURS.from, TZ), end: zonedToUtc(d, WORK_HOURS.to, TZ) })
  }
  return out
}

export const mockSeriesService: SeriesService = {
  source: 'mock',

  listSeries: () =>
    delay(
      state.series
        .map(({ id, name, active, project, resource, summary, startDate, endDate, modifiedOn }) => ({ id, name, active, project, resource, summary, startDate, endDate, modifiedOn }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ),

  getSeries: (id) => {
    try {
      return delay(clone(findSeries(id)))
    } catch (err) {
      return Promise.reject(err)
    }
  },

  createSeries: (draft) => {
    const id = crypto.randomUUID()
    const range = definitionRange(draft.definition)
    state.series.push({
      id,
      name: draft.settings.name,
      active: true,
      project: draft.settings.project,
      resource: MOCK_RESOURCES.find((r) => same(r.id, draft.definition.segments[0].resourceId)) ?? null,
      summary: describeSeries(draft.definition),
      startDate: range.first,
      endDate: range.last,
      modifiedOn: new Date().toISOString(),
      settings: clone(draft.settings),
      definition: clone(draft.definition),
      version: 1,
    })
    return delay(id)
  },

  updateSeries: (original, draft) => {
    const s = findSeries(original.id)
    if (original.version !== null && s.version !== original.version) return Promise.reject(new ConflictError())
    const range = definitionRange(draft.definition)
    Object.assign(s, {
      name: draft.settings.name,
      project: draft.settings.project,
      resource: MOCK_RESOURCES.find((r) => same(r.id, draft.definition.segments[0].resourceId)) ?? null,
      summary: describeSeries(draft.definition),
      startDate: range.first,
      endDate: range.last,
      modifiedOn: new Date().toISOString(),
      settings: clone(draft.settings),
      definition: clone(draft.definition),
      version: (s.version ?? 0) + 1,
    })
    return delay(clone(s))
  },

  setActive: (id, active) => {
    findSeries(id).active = active
    return delay(undefined)
  },

  listOccurrences: (seriesId) =>
    delay(
      state.workOrders
        .filter((w) => same(w.seriesId, seriesId))
        .map((w) => toRecord(w.id))
        .sort((a, b) => a.key.localeCompare(b.key)),
    ),

  createOccurrence: (series, occ) => {
    if (!series.settings.project) return Promise.reject(new Error('Arbeitsauftrag anlegen: kein Projekt gewählt.'))
    const wo = { id: crypto.randomUUID(), name: `WO-0${state.nextWorkOrder++}`, seriesId: series.id, key: occ.key, state: 'scheduled' as const }
    state.workOrders.push(wo)
    newBooking(series, wo.id, wo.name, occ)
    return delay(toRecord(wo.id), 60)
  },

  updateOccurrence: (series, record, occ) => {
    const b = record.bookingId ? state.bookings.find((x) => x.id === record.bookingId) : undefined
    if (b) {
      if (!occ.resourceId) return Promise.reject(new Error('Buchung ändern: keine Ressource gewählt.'))
      Object.assign(b, { start: occ.start, end: occ.end, resourceId: occ.resourceId })
    } else {
      newBooking(series, record.workOrderId, record.workOrderName, occ)
      const wo = state.workOrders.find((w) => w.id === record.workOrderId)
      if (wo) wo.state = 'scheduled'
    }
    return delay(undefined, 60)
  },

  cancelOccurrence: (record) => {
    const wo = state.workOrders.find((w) => w.id === record.workOrderId)
    if (wo) wo.state = 'canceled'
    state.bookings.filter((b) => b.workOrderId === record.workOrderId).forEach((b) => (b.canceled = true))
    return delay(undefined, 60)
  },

  loadAvailability: (resourceIds, from, to) => {
    const fromDate = addDays(from.slice(0, 10), -1)
    const toDate = addDays(to.slice(0, 10), 1)
    const closures: AvailabilityData['closures'] = []
    for (let y = Number(fromDate.slice(0, 4)); y <= Number(toDate.slice(0, 4)); y++) {
      for (const h of holidaysOf(y)) {
        if (h.date >= fromDate && h.date <= toDate) closures.push({ name: h.name, start: zonedToUtc(h.date, '00:00', TZ), end: zonedToUtc(addDays(h.date, 1), '00:00', TZ) })
      }
    }
    const ids = resourceIds.map((r) => r.toLowerCase())
    return delay({
      closures,
      workingTime: Object.fromEntries(ids.map((r) => [r, workingTime(MOCK_RESOURCES.find((x) => same(x.id, r))?.id ?? r, fromDate, toDate)])),
      bookings: state.bookings
        .filter((b) => !b.canceled && ids.includes(b.resourceId.toLowerCase()) && b.start < to && b.end > from)
        .map((b) => ({ id: b.id, resourceId: b.resourceId, start: b.start, end: b.end, name: b.name, workOrderId: b.workOrderId })),
      unavailable: [],
    })
  },

  search: (kind, term, context) => {
    const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const list = LISTS[kind]().filter((r) => (kind !== 'projectTask' || !context?.projectId || same(r.projectId, context.projectId)) && words.every((w) => r.name.toLowerCase().includes(w)))
    return delay(list.map(({ id, name }) => ({ id, name })).slice(0, 25))
  },

  resolveRefs: (kind, ids) => delay(LISTS[kind]().filter((r) => ids.some((i) => same(i, r.id))).map(({ id, name }) => ({ id, name }))),

  projectDefaults: (projectId) => {
    const p = MOCK_PROJECTS.find((x) => same(x.id, projectId))
    return delay({ serviceAccount: MOCK_ACCOUNTS.find((a) => a.id === p?.customerId) ?? null })
  },

  defaultBookingStatus: () => delay({ id: MOCK_BOOKING_STATUSES[0].id, name: MOCK_BOOKING_STATUSES[0].name }),

  checkSetup: () =>
    delay([
      { label: 'Datenquelle', ok: true, detail: `Mock-Daten im Speicher (Stand ${formatDate(new Date().toISOString().slice(0, 10))}) — nichts wird nach Dataverse geschrieben.` },
      { label: 'Ressourcen', ok: true, detail: MOCK_RESOURCES.map((r) => r.name).join(', ') },
      { label: 'Arbeitszeit', ok: true, detail: `Mo–Fr ${WORK_HOURS.from}–${WORK_HOURS.to}, ohne Feiertage und Abwesenheiten (${MOCK_ABSENCES.length} Beispiele)` },
      { label: 'Abwesende', ok: true, detail: MOCK_ABSENCES.map((a) => `${resourceName(a.resourceId)} ${formatDate(a.from)}–${formatDate(a.to)} (${a.reason})`).join('; ') },
    ]),
}
