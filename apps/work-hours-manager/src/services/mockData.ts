import type { RawCalendar, Resource, TimeOffRequest, WorkHourTemplate, Weekday } from '../types/calendar'
import { fixtureId, makeBlock, makeCalendar, type LeafSpec } from '../fixtures/calendars'
import { addDays, startOfIsoWeek, todayIn, zonedToUtc } from '../utils/dates'
import { closureSpan, generateHolidays } from '../utils/holidays'
import { applyClosureSave, createStore, type MockCalendarStore } from '../utils/engine'

/**
 * Fictional sample data for `npm run dev` without a Power Apps host. Names,
 * org units and categories are invented (no customer data in the repo); the
 * publisher prefix of anything "ours" is `pro`. Dates are relative to the
 * current week so every finding of the diagnostics has an example.
 */

export const TZ = 'Europe/Berlin'
export const MOCK_ORG_NAME = 'Contoso Haustechnik (Mock)'

const id = (group: number, n: number) => fixtureId(group, n)
export const CLOSURE_CALENDAR_ID = id(50, 1)

const ORG_UNITS = { nord: { id: id(20, 1), name: 'Service Nord' }, sued: { id: id(20, 2), name: 'Service Süd' }, werkstatt: { id: id(20, 3), name: 'Werkstatt' } }
const CATEGORIES = { monteur: { id: id(21, 1), name: 'Monteur' }, elektriker: { id: id(21, 2), name: 'Elektriker' }, teamleiter: { id: id(21, 3), name: 'Teamleitung' }, geraet: { id: id(21, 4), name: 'Gerät' } }
const TERRITORIES = { nord: { id: id(22, 1), name: 'Region Nord' }, sued: { id: id(22, 2), name: 'Region Süd' } }

export const MOCK_TEMPLATE_IDS = { standard: id(30, 1), teilzeit: id(30, 2), frueh: id(30, 3), spaet: id(30, 4) }

const STANDARD: LeafSpec[] = [
  { kind: 'work', start: '08:00', end: '12:00' },
  { kind: 'break', start: '12:00', end: '12:30' },
  { kind: 'work', start: '12:30', end: '17:00' },
]
const FRUEH: LeafSpec[] = [
  { kind: 'work', start: '06:00', end: '10:00' },
  { kind: 'break', start: '10:00', end: '10:30' },
  { kind: 'work', start: '10:30', end: '14:30' },
]
const SPAET: LeafSpec[] = [
  { kind: 'work', start: '14:00', end: '18:00' },
  { kind: 'break', start: '18:00', end: '18:30' },
  { kind: 'work', start: '18:30', end: '22:30' },
]
const MO_FR: Weekday[] = [1, 2, 3, 4, 5]

export interface MockResourceExtras {
  /** Whether the resource's rules observe business closures (mirrors `ObserveClosure`). */
  observesClosures: boolean
  bookingsAfterToday: number
}

export interface MockState {
  store: MockCalendarStore
  resources: Resource[]
  extras: Record<string, MockResourceExtras>
  templates: WorkHourTemplate[]
  timeOff: TimeOffRequest[]
  today: string
}

export function createMockState(now: number = Date.now()): MockState {
  const today = todayIn(TZ, now)
  const monday = startOfIsoWeek(today)
  const longAgo = addDays(monday, -7 * 40)
  const calendars: RawCalendar[] = []
  const resources: Resource[] = []
  const extras: Record<string, MockResourceExtras> = {}
  let seq = 100

  const addCalendar = (calendarId: string, name: string, blocks: ReturnType<typeof makeBlock>[]) => {
    const cal = makeCalendar(calendarId, name, blocks)
    calendars.push(cal.calendar, ...cal.inner)
  }

  const resource = (n: number, name: string, opts: Partial<Resource> & { unit?: keyof typeof ORG_UNITS; category?: keyof typeof CATEGORIES; territory?: keyof typeof TERRITORIES; observesClosures?: boolean; bookings?: number; calendar?: boolean }, blocks: (calendarId: string) => ReturnType<typeof makeBlock>[]) => {
    const resourceId = id(10, n)
    const calendarId = opts.calendar === false ? null : id(11, n)
    const r: Resource = {
      id: resourceId,
      name,
      type: opts.type ?? 'user',
      timeZoneCode: opts.timeZoneCode ?? 110,
      calendarId,
      orgUnit: opts.unit ? ORG_UNITS[opts.unit] : null,
      active: opts.active ?? true,
      categories: opts.category ? [CATEGORIES[opts.category]] : [],
      territories: opts.territory ? [TERRITORIES[opts.territory]] : [],
      userId: (opts.type ?? 'user') === 'user' ? id(12, n) : null,
      displayOnScheduleBoard: opts.displayOnScheduleBoard ?? true,
    }
    resources.push(r)
    extras[resourceId] = { observesClosures: opts.observesClosures ?? true, bookingsAfterToday: opts.bookings ?? 0 }
    if (calendarId) addCalendar(calendarId, `Kalender ${name}`, blocks(calendarId))
  }

  const weekly = (calendarId: string, leaves: LeafSpec[], extra: Partial<Parameters<typeof makeBlock>[0]> = {}) => makeBlock({ seq: seq++, calendarId, start: longAgo, weekdays: MO_FR, leaves, ...extra })

  // 1 — standard week, three days off next week (approved request below).
  resource(1, 'Mara Lindqvist', { unit: 'nord', category: 'monteur', territory: 'nord' }, (c) => [
    weekly(c, STANDARD),
    makeBlock({ seq: seq++, calendarId: c, start: addDays(monday, 7), leaves: [{ kind: 'timeoff', start: '00:00', end: '24:00', days: 3 }], description: 'Urlaub', createdOn: `${addDays(today, -20)}T08:00:00Z` }),
  ])
  // 2 — standard week plus a night shift Tue→Wed next week, stored as two occurrences.
  resource(2, 'Jonas Feldmann', { unit: 'nord', category: 'monteur', territory: 'nord' }, (c) => [
    weekly(c, STANDARD),
    makeBlock({ seq: seq++, calendarId: c, start: addDays(monday, 8), leaves: [{ kind: 'work', start: '22:00', end: '24:00' }], createdOn: `${addDays(today, -3)}T08:00:00Z` }),
    makeBlock({ seq: seq++, calendarId: c, start: addDays(monday, 9), leaves: [{ kind: 'work', start: '00:00', end: '06:00' }], createdOn: `${addDays(today, -3)}T08:00:01Z` }),
  ])
  // 3 — early shift.
  resource(3, 'Aylin Demir', { unit: 'sued', category: 'elektriker', territory: 'sued' }, (c) => [weekly(c, FRUEH)])
  // 4 — recurrence ends in 45 days (finding 5.2).
  resource(4, 'Per Andersen', { unit: 'sued', category: 'monteur', territory: 'sued' }, (c) => [weekly(c, STANDARD, { end: addDays(today, 45) })])
  // 5 — varied week: Mo/Tu 08–17, We 08–12, Th/Fr 08–16:30.
  resource(5, 'Lea Hoffmann', { unit: 'werkstatt', category: 'teamleiter' }, (c) => {
    const group = id(94, 5)
    return [
      makeBlock({ seq: seq++, calendarId: c, start: longAgo, weekdays: [1, 2], leaves: STANDARD, groupId: group }),
      makeBlock({ seq: seq++, calendarId: c, start: longAgo, weekdays: [3], leaves: [{ kind: 'work', start: '08:00', end: '12:00' }], groupId: group }),
      makeBlock({ seq: seq++, calendarId: c, start: longAgo, weekdays: [4, 5], leaves: [{ kind: 'work', start: '08:00', end: '12:00' }, { kind: 'break', start: '12:00', end: '12:30' }, { kind: 'work', start: '12:30', end: '16:30' }], groupId: group }),
    ]
  })
  // 6 — recurrence ended ten days ago (findings 5.1 and 5.2).
  resource(6, 'Tobias Brandt', { unit: 'nord', category: 'monteur', territory: 'nord' }, (c) => [weekly(c, STANDARD, { end: addDays(today, -10) })])
  // 7 — calendar without any rule (finding 5.5).
  resource(7, 'Nele Winter', { unit: 'sued', category: 'monteur', territory: 'sued' }, () => [])
  // 8 — inactive with future bookings (finding 5.4).
  resource(8, 'Oskar Lindgren', { unit: 'nord', category: 'monteur', territory: 'nord', active: false, bookings: 3 }, (c) => [weekly(c, STANDARD)])
  // 9 — rules in Paris time, resource in Berlin (finding 5.3).
  resource(9, 'Hanna Vogel', { unit: 'sued', category: 'elektriker', territory: 'sued' }, (c) => [weekly(c, STANDARD, { tz: 105 })])
  // 10 — equipment, Mo–Sa, ignores closures.
  resource(10, 'Kran 1', { type: 'equipment', unit: 'werkstatt', category: 'geraet', observesClosures: false }, (c) => [
    makeBlock({ seq: seq++, calendarId: c, start: longAgo, weekdays: [1, 2, 3, 4, 5, 6], leaves: [{ kind: 'work', start: '07:00', end: '19:00' }] }),
  ])
  // 11 — crew with capacity 3.
  resource(11, 'Montageteam Nord', { type: 'crew', unit: 'nord', territory: 'nord' }, (c) => [
    makeBlock({ seq: seq++, calendarId: c, start: longAgo, weekdays: MO_FR, leaves: [{ kind: 'work', start: '07:00', end: '16:00', effort: 3 }] }),
  ])
  // 12 — standard week with a non-working day next Thursday.
  resource(12, 'Felix Baumann', { unit: 'nord', category: 'monteur', territory: 'nord' }, (c) => [
    weekly(c, STANDARD),
    makeBlock({ seq: seq++, calendarId: c, start: addDays(monday, 10), leaves: [{ kind: 'nonwork', start: '00:00', end: '24:00' }], createdOn: `${addDays(today, -1)}T08:00:00Z` }),
  ])
  // 13 — late shift.
  resource(13, 'Sofia Marin', { unit: 'sued', category: 'monteur', territory: 'sued' }, (c) => [weekly(c, SPAET)])
  // 14 — no calendar at all (finding 5.5).
  resource(14, 'Hebebühne (Leihgerät)', { type: 'equipment', unit: 'werkstatt', category: 'geraet', calendar: false }, () => [])

  // Templates — each with its own calendar.
  const templates: WorkHourTemplate[] = [
    { id: MOCK_TEMPLATE_IDS.standard, name: 'Standard 40 h (Mo–Fr 08–17)', description: 'Mo–Fr 08:00–17:00, Pause 12:00–12:30', calendarId: id(31, 1), active: true },
    { id: MOCK_TEMPLATE_IDS.teilzeit, name: 'Teilzeit 12 h (Mo/Mi/Fr vormittags)', description: 'Mo, Mi, Fr 08:00–12:00', calendarId: id(31, 2), active: true },
    { id: MOCK_TEMPLATE_IDS.frueh, name: 'Frühschicht (Mo–Fr 06–14:30)', description: 'Mo–Fr 06:00–14:30, Pause 10:00–10:30', calendarId: id(31, 3), active: true },
    { id: MOCK_TEMPLATE_IDS.spaet, name: 'Spätschicht (Mo–Fr 14–22:30)', description: 'Mo–Fr 14:00–22:30, Pause 18:00–18:30', calendarId: id(31, 4), active: true },
  ]
  addCalendar(id(31, 1), 'Vorlage Standard', [makeBlock({ seq: seq++, calendarId: id(31, 1), start: longAgo, weekdays: MO_FR, leaves: STANDARD })])
  addCalendar(id(31, 2), 'Vorlage Teilzeit', [makeBlock({ seq: seq++, calendarId: id(31, 2), start: longAgo, weekdays: [1, 3, 5], leaves: [{ kind: 'work', start: '08:00', end: '12:00' }] })])
  addCalendar(id(31, 3), 'Vorlage Frühschicht', [makeBlock({ seq: seq++, calendarId: id(31, 3), start: longAgo, weekdays: MO_FR, leaves: FRUEH })])
  addCalendar(id(31, 4), 'Vorlage Spätschicht', [makeBlock({ seq: seq++, calendarId: id(31, 4), start: longAgo, weekdays: MO_FR, leaves: SPAET })])

  // Organization closure calendar: this year's nationwide holidays plus company holidays; next year is missing on purpose.
  calendars.push({ calendarid: CLOSURE_CALENDAR_ID, name: 'Business Closure Calendar', description: null, type: 2, calendar_calendar_rules: [] })
  const store = createStore(calendars)
  const year = Number(today.slice(0, 4))
  for (const h of generateHolidays('DE', year)) {
    const span = closureSpan(h.date, TZ)
    applyClosureSave(store, CLOSURE_CALENDAR_ID, h.name, span.start, span.end)
  }
  const ferien = closureSpan(`${year}-12-27`, TZ, 5)
  applyClosureSave(store, CLOSURE_CALENDAR_ID, 'Betriebsferien', ferien.start, ferien.end)

  const timeOff: TimeOffRequest[] = [
    { id: id(40, 1), name: 'Urlaub', resourceId: id(10, 1), start: zonedToUtc(addDays(monday, 7), '00:00', TZ), end: zonedToUtc(addDays(monday, 10), '00:00', TZ), approvedBy: { id: id(12, 5), name: 'Lea Hoffmann' }, active: true },
    { id: id(40, 2), name: 'Fortbildung', resourceId: id(10, 2), start: zonedToUtc(addDays(monday, 28), '00:00', TZ), end: zonedToUtc(addDays(monday, 30), '00:00', TZ), approvedBy: null, active: true },
  ]

  return { store, resources, extras, templates, timeOff, today }
}
