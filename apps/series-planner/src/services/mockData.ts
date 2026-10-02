import type { Ref, Series, SeriesDefinition, SeriesSettings } from '../types/series'
import { addDays, parseDate, startOfIsoWeek, toDateStr, todayIn, zonedToUtc } from '../utils/dates'
import { definitionRange } from '../utils/definition'
import { describeSeries, expandSeries } from '../utils/recurrence'

/**
 * Fictional sample data for `npm run dev` without a Power Apps host. Names,
 * projects and customers are invented (no customer data in the repo).
 * Dates are relative to the current week so the demo always has past,
 * current and future occurrences; holidays are computed for any year.
 */

export const TZ = 'Europe/Berlin'

const id = (group: number, n: number) => `${String(group).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`

export const MOCK_RESOURCES: Ref[] = [
  { id: id(11, 1), name: 'Mara Lindqvist' },
  { id: id(11, 2), name: 'Jonas Feldmann' },
  { id: id(11, 3), name: 'Aylin Demir' },
  { id: id(11, 4), name: 'Per Andersen' },
  { id: id(11, 5), name: 'Lea Hoffmann' },
]
const [MARA, JONAS, AYLIN] = MOCK_RESOURCES

export const MOCK_ACCOUNTS: Ref[] = [
  { id: id(12, 1), name: 'Contoso Haustechnik' },
  { id: id(12, 2), name: 'Fabrikam Logistik' },
  { id: id(12, 3), name: 'Northwind Energie' },
]

export const MOCK_PROJECTS: (Ref & { customerId: string })[] = [
  { id: id(13, 1), name: 'Modernisierung Lüftung Halle 3', customerId: MOCK_ACCOUNTS[0].id },
  { id: id(13, 2), name: 'Wartungsvertrag Kälteanlagen', customerId: MOCK_ACCOUNTS[1].id },
  { id: id(13, 3), name: 'Umbau Leitstand Nord', customerId: MOCK_ACCOUNTS[2].id },
]

export const MOCK_TASKS: (Ref & { projectId: string })[] = [
  { id: id(14, 1), name: 'Montage Lüftungsgeräte', projectId: MOCK_PROJECTS[0].id },
  { id: id(14, 2), name: 'Inbetriebnahme', projectId: MOCK_PROJECTS[0].id },
  { id: id(14, 3), name: 'Quartalsinspektion', projectId: MOCK_PROJECTS[1].id },
  { id: id(14, 4), name: 'Schaltschrankbau', projectId: MOCK_PROJECTS[2].id },
]

export const MOCK_WO_TYPES: Ref[] = [
  { id: id(15, 1), name: 'Projektarbeit' },
  { id: id(15, 2), name: 'Wartung' },
  { id: id(15, 3), name: 'Inspektion' },
]

export const MOCK_INCIDENT_TYPES: Ref[] = [
  { id: id(16, 1), name: 'Jahreswartung' },
  { id: id(16, 2), name: 'Sichtprüfung' },
]

export const MOCK_PRICE_LISTS: Ref[] = [{ id: id(17, 1), name: 'Standard 2026' }]

export const MOCK_BOOKING_STATUSES: (Ref & { status: number })[] = [
  { id: id(18, 1), name: 'Geplant', status: 2 },
  { id: id(18, 2), name: 'Vorläufig', status: 1 },
  { id: id(18, 3), name: 'Abgebrochen', status: 3 },
]

// ---------------------------------------------------------------------------
// Holidays (nationwide German public holidays) and absences
// ---------------------------------------------------------------------------

/** Easter Sunday (anonymous Gregorian algorithm). */
function easter(y: number): string {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return toDateStr(y, month, day)
}

export function holidaysOf(y: number): { date: string; name: string }[] {
  const e = easter(y)
  return [
    { date: toDateStr(y, 1, 1), name: 'Neujahr' },
    { date: addDays(e, -2), name: 'Karfreitag' },
    { date: addDays(e, 1), name: 'Ostermontag' },
    { date: toDateStr(y, 5, 1), name: 'Tag der Arbeit' },
    { date: addDays(e, 39), name: 'Christi Himmelfahrt' },
    { date: addDays(e, 50), name: 'Pfingstmontag' },
    { date: toDateStr(y, 10, 3), name: 'Tag der Deutschen Einheit' },
    { date: toDateStr(y, 12, 25), name: '1. Weihnachtstag' },
    { date: toDateStr(y, 12, 26), name: '2. Weihnachtstag' },
  ]
}

const today = todayIn(TZ)
const monday0 = startOfIsoWeek(today)

/** Absences, inclusive. */
export const MOCK_ABSENCES: { resourceId: string; from: string; to: string; reason: string }[] = [
  { resourceId: MARA.id, from: addDays(monday0, 14), to: addDays(monday0, 18), reason: 'Urlaub' },
  { resourceId: JONAS.id, from: addDays(monday0, 35), to: addDays(monday0, 39), reason: 'Schulung' },
  { resourceId: AYLIN.id, from: addDays(monday0, 49), to: addDays(monday0, 60), reason: 'Urlaub' },
]

/** Working time of every mock resource: Monday to Friday. */
export const WORK_HOURS = { from: '07:00', to: '16:00' }

// ---------------------------------------------------------------------------
// Series, work orders, bookings
// ---------------------------------------------------------------------------

export interface MockWorkOrder {
  id: string
  name: string
  seriesId: string | null
  key: string | null
  state: 'unscheduled' | 'scheduled' | 'inProgress' | 'completed' | 'canceled'
}

export interface MockBooking {
  id: string
  workOrderId: string | null
  resourceId: string
  start: string
  end: string
  name: string
  canceled: boolean
  createdOn: string
}

export interface MockState {
  series: Series[]
  workOrders: MockWorkOrder[]
  bookings: MockBooking[]
  nextWorkOrder: number
}

function settings(name: string, projectIdx: number, taskIdx: number | null, typeIdx: number, instructions: string): SeriesSettings {
  const project = MOCK_PROJECTS[projectIdx]
  return {
    name,
    project: { id: project.id, name: project.name },
    projectTask: taskIdx === null ? null : { id: MOCK_TASKS[taskIdx].id, name: MOCK_TASKS[taskIdx].name },
    serviceAccount: MOCK_ACCOUNTS.find((a) => a.id === project.customerId) ?? null,
    workOrderType: MOCK_WO_TYPES[typeIdx],
    incidentType: null,
    priceList: MOCK_PRICE_LISTS[0],
    bookingStatus: MOCK_BOOKING_STATUSES[0],
    instructions,
  }
}

function makeSeries(seriesId: string, s: SeriesSettings, def: SeriesDefinition, modifiedOn: string): Series {
  const range = definitionRange(def)
  const resourceId = def.segments[0].resourceId
  return {
    id: seriesId,
    name: s.name,
    active: true,
    project: s.project,
    resource: MOCK_RESOURCES.find((r) => r.id === resourceId) ?? null,
    summary: describeSeries(def),
    startDate: range.first,
    endDate: range.last,
    modifiedOn,
    settings: s,
    definition: def,
    version: 1,
  }
}

export function createMockState(): MockState {
  const state: MockState = { series: [], workOrders: [], bookings: [], nextWorkOrder: 1001 }
  const now = Date.now()

  const ventilation: SeriesDefinition = {
    version: 1,
    timeZone: TZ,
    end: { kind: 'date', date: addDays(monday0, 7 * 15) },
    segments: [
      { from: addDays(monday0, -28), rule: { kind: 'weekly', interval: 1, weekdays: [1] }, startTime: '08:00', durationMinutes: 240, resourceId: MARA.id },
    ],
    overrides: { [addDays(monday0, 28)]: { resourceId: JONAS.id } },
    skips: { [addDays(monday0, 14)]: { reason: 'Urlaub Mara Lindqvist' } },
  }
  const { y, m } = parseDate(today)
  const inspection: SeriesDefinition = {
    version: 1,
    timeZone: TZ,
    end: { kind: 'count', count: 4 },
    segments: [
      {
        from: toDateStr(y, m, 1),
        rule: { kind: 'monthly', interval: 3, monthly: { mode: 'weekday', nth: 1, weekday: 1 } },
        startTime: '07:30',
        durationMinutes: 120,
        resourceId: JONAS.id,
      },
    ],
    overrides: {},
    skips: {},
  }

  const series = [
    makeSeries(id(20, 1), settings('Wartung Lüftung Halle 3', 0, 0, 0, 'Zugang über Tor 2, Schlüssel beim Pförtner.'), ventilation, new Date(now - 86_400_000 * 3).toISOString()),
    makeSeries(id(20, 2), settings('Inspektion Kälteanlagen', 1, 2, 2, 'Prüfprotokoll Kälteanlage ausfüllen.'), inspection, new Date(now - 86_400_000 * 20).toISOString()),
  ]
  state.series = series

  // Materialize: past occurrences done, skipped ones cancelled, one moved by hand on the board.
  const movedByHand = addDays(monday0, 56)
  for (const s of series) {
    for (const e of expandSeries(s.definition)) {
      const o = e.occurrence
      const past = Date.parse(o.end) < now
      const wo: MockWorkOrder = {
        id: crypto.randomUUID(),
        name: `WO-0${state.nextWorkOrder++}`,
        seriesId: s.id,
        key: e.key,
        state: e.skipped ? 'canceled' : past ? 'completed' : 'scheduled',
      }
      state.workOrders.push(wo)
      let start = o.start
      let end = o.end
      if (e.key === movedByHand) {
        start = new Date(Date.parse(start) + 86_400_000).toISOString()
        end = new Date(Date.parse(end) + 86_400_000).toISOString()
      }
      state.bookings.push({
        id: crypto.randomUUID(),
        workOrderId: wo.id,
        resourceId: o.resourceId!,
        start,
        end,
        name: `${wo.name} · ${s.name}`,
        canceled: !!e.skipped,
        createdOn: s.modifiedOn!,
      })
    }
  }

  // Other work of the same people — conflicts the planner should show.
  for (let w = 0; w < 8; w++) {
    const tuesday = addDays(monday0, 7 * w + 1)
    state.bookings.push(otherBooking(JONAS.id, tuesday, '10:00', '14:00', 'WO-00871 · Störung Kühlturm'))
  }
  state.bookings.push(otherBooking(MARA.id, addDays(monday0, 42), '09:00', '11:00', 'WO-00902 · Notdienst Sprinkleranlage'))
  return state
}

function otherBooking(resourceId: string, date: string, from: string, to: string, name: string): MockBooking {
  return {
    id: crypto.randomUUID(),
    workOrderId: null,
    resourceId,
    start: zonedToUtc(date, from, TZ),
    end: zonedToUtc(date, to, TZ),
    name,
    canceled: false,
    createdOn: new Date().toISOString(),
  }
}
