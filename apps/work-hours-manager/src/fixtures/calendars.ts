import type { RawCalendar, RawCalendarRule, Weekday, WorkHourKind } from '../types/calendar'
import { addDays, parseTime } from '../utils/dates'
import { CODES_OF_KIND, WEEKLY_GROUP_DESIGNATOR, buildTree, formatPattern } from '../utils/rules'

/**
 * Synthetic calendar trees (root rule → inner calendar → leaf rules) in the
 * storage shape read live from Schulz UAT (README "Verifiziert"): weekly
 * rules rank 2 with the fixed designator, single days rank 0, holiday lists
 * as a yearly root (rank 1, extentcode 2) whose inner calendar holds one
 * dated rule per holiday, exclusive interval ends. They feed the tests and
 * the mock; no customer data.
 *
 * Builder: `makeBlock` writes one root rule plus its inner calendar,
 * `makeHolidayList` a holiday list; `rawRule` fills every column.
 */

export const fixtureId = (group: number, n: number): string => `${String(group).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`

export function rawRule(partial: Partial<RawCalendarRule> & { calendarruleid: string; _calendarid_value: string }): RawCalendarRule {
  return {
    _innercalendarid_value: null,
    name: null,
    description: null,
    pattern: null,
    starttime: null,
    endtime: null,
    duration: null,
    effort: null,
    timecode: null,
    subcode: null,
    rank: null,
    timezonecode: null,
    effectiveintervalstart: null,
    effectiveintervalend: null,
    extentcode: null,
    isselected: null,
    issimple: null,
    ismodified: null,
    isvaried: null,
    offset: null,
    groupdesignator: null,
    createdon: null,
    modifiedon: null,
    ...partial,
  }
}

export interface LeafSpec {
  kind: Exclude<WorkHourKind, 'unknown' | 'closure'>
  /** `HH:mm`; end may be `24:00` or, for multi-day all-day leaves, `24:00` with `days`. */
  start: string
  end: string
  /** Multi-day all-day leaf (time off over several days). */
  days?: number
  effort?: number | null
}

export interface BlockSpec {
  /** Seed for deterministic ids. */
  seq: number
  calendarId: string
  start: string
  /** Weekly recurrence when set; occurrence otherwise. */
  weekdays?: Weekday[]
  /** Recurrence end (date) — omitted = open end. */
  end?: string
  leaves: LeafSpec[]
  tz?: number
  description?: string | null
  groupId?: string | null
  createdOn?: string
  modifiedOn?: string
}

/** Open end as the server stores it (live: `9999-12-30T00:00:00Z`). */
export const OPEN_END = '9999-12-30T00:00:00Z'

const minutes = (spec: LeafSpec) => {
  const s = parseTime(spec.start)
  const e = spec.end === '24:00' ? 1440 : parseTime(spec.end)
  return { startMin: s, duration: e - s + ((spec.days ?? 1) - 1) * 1440 }
}

/** One calendar event as stored: root rule in `calendarId`, inner calendar with the leaves. */
export function makeBlock(spec: BlockSpec): { root: RawCalendarRule; inner: RawCalendar } {
  const tz = spec.tz ?? 110
  const innerId = fixtureId(90, spec.seq)
  const rootId = fixtureId(91, spec.seq)
  const created = spec.createdOn ?? '2025-12-01T10:00:00Z'
  const modified = spec.modifiedOn ?? created
  const leafMinutes = spec.leaves.map(minutes)
  const first = Math.min(...leafMinutes.map((m) => m.startMin))
  const last = Math.max(...leafMinutes.map((m) => m.startMin + m.duration))
  const dominant = spec.leaves.some((l) => l.kind === 'work') ? 'work' : spec.leaves[0].kind
  const codes = CODES_OF_KIND[dominant]
  const recurring = !!spec.weekdays
  const root = rawRule({
    calendarruleid: rootId,
    _calendarid_value: spec.calendarId,
    _innercalendarid_value: innerId,
    description: spec.description ?? null,
    pattern: recurring ? formatPattern(spec.weekdays!) : null,
    starttime: recurring ? `${spec.start}T00:00:00Z` : `${spec.start}T${String(Math.floor(first / 60)).padStart(2, '0')}:${String(first % 60).padStart(2, '0')}:00Z`,
    duration: recurring ? 1440 : last - first,
    effort: null,
    timecode: codes.timeCode,
    subcode: codes.subCode,
    // Live shape (Schulz UAT): weekly rank 2 with the fixed designator, single day rank 0; the interval end is the exclusive next midnight.
    rank: recurring ? 2 : 0,
    timezonecode: tz,
    effectiveintervalstart: `${spec.start}T00:00:00Z`,
    effectiveintervalend: recurring ? (spec.end ? `${addDays(spec.end, 1)}T00:00:00Z` : OPEN_END) : `${addDays(spec.start, 1)}T00:00:00Z`,
    extentcode: 1,
    isvaried: !!spec.groupId,
    groupdesignator: spec.groupId ?? (recurring ? WEEKLY_GROUP_DESIGNATOR : null),
    createdon: created,
    modifiedon: modified,
  })
  const inner: RawCalendar = {
    calendarid: innerId,
    name: null,
    description: spec.description ?? null,
    type: -1,
    calendar_calendar_rules: spec.leaves.map((leaf, i) => {
      const m = leafMinutes[i]
      const c = CODES_OF_KIND[leaf.kind]
      return rawRule({
        calendarruleid: fixtureId(92, spec.seq * 10 + i),
        _calendarid_value: innerId,
        starttime: `${spec.start}T${String(Math.floor(m.startMin / 60)).padStart(2, '0')}:${String(m.startMin % 60).padStart(2, '0')}:00Z`,
        duration: m.duration,
        offset: m.startMin,
        effort: leaf.kind === 'work' ? (leaf.effort === undefined ? 1 : leaf.effort) : null,
        timecode: c.timeCode,
        subcode: c.subCode,
        rank: 0,
        timezonecode: tz,
        issimple: true,
        isselected: true,
        createdon: created,
        modifiedon: modified,
      })
    }),
  }
  return { root, inner }
}

/**
 * A holiday list as stored live: yearly root (rank 1, extentcode 2) → inner
 * calendar with one `FREQ=DAILY;INTERVAL=1;COUNT=1` rule per holiday
 * (TimeCode 2, SubCode 5). `utcStart` is the stored instant — live data
 * carries local midnight written from several offsets (21:00Z–23:00Z).
 */
export function makeHolidayList(seq: number, calendarId: string, holidays: { utcStart: string; days?: number }[], opts: { start?: string; end?: string; tz?: number } = {}): { root: RawCalendarRule; inner: RawCalendar } {
  const innerId = fixtureId(95, seq)
  const root = rawRule({
    calendarruleid: fixtureId(96, seq),
    _calendarid_value: calendarId,
    _innercalendarid_value: innerId,
    pattern: 'FREQ=YEARLY;INTERVAL=1',
    starttime: `${opts.start ?? '2000-01-01'}T00:00:00Z`,
    duration: 525600,
    rank: 1,
    timezonecode: opts.tz ?? 110,
    effectiveintervalend: opts.end ? `${addDays(opts.end, 1)}T00:00:00Z` : OPEN_END,
    extentcode: 2,
    groupdesignator: fixtureId(97, seq),
    createdon: '2025-03-01T08:00:00Z',
    modifiedon: '2025-03-01T08:00:00Z',
  })
  const inner: RawCalendar = {
    calendarid: innerId,
    name: null,
    description: null,
    type: 0,
    calendar_calendar_rules: holidays.map((h, i) =>
      rawRule({
        calendarruleid: fixtureId(98, seq * 100 + i),
        _calendarid_value: innerId,
        pattern: 'FREQ=DAILY;INTERVAL=1;COUNT=1',
        starttime: h.utcStart,
        duration: (h.days ?? 1) * 1440,
        timecode: 2,
        subcode: 5,
        rank: 0,
      }),
    ),
  }
  return { root, inner }
}

/** A business closure as the organization's closure calendar stores it: a root-only rule. */
export function makeClosure(seq: number, calendarId: string, name: string, start: string, days = 1): RawCalendarRule {
  return rawRule({
    calendarruleid: fixtureId(93, seq),
    _calendarid_value: calendarId,
    name,
    starttime: `${start}T00:00:00Z`,
    duration: days * 1440,
    timecode: 2,
    subcode: 5,
    rank: 0,
    timezonecode: 110,
    effectiveintervalstart: `${start}T00:00:00Z`,
    effectiveintervalend: `${start}T00:00:00Z`,
    extentcode: 1,
    createdon: '2025-11-15T09:00:00Z',
    modifiedon: '2025-11-15T09:00:00Z',
  })
}

export function makeCalendar(calendarId: string, name: string | null, blocks: { root: RawCalendarRule; inner: RawCalendar }[], extraRoots: RawCalendarRule[] = []): { calendar: RawCalendar; inner: RawCalendar[] } {
  return {
    calendar: { calendarid: calendarId, name, description: null, type: 0, calendar_calendar_rules: [...blocks.map((b) => b.root), ...extraRoots] },
    inner: blocks.map((b) => b.inner),
  }
}

const CAL = (n: number) => fixtureId(80, n)

const weekdayBlock = (seq: number, calendarId: string, extra: Partial<BlockSpec> = {}) =>
  makeBlock({
    seq,
    calendarId,
    start: '2026-01-05',
    weekdays: [1, 2, 3, 4, 5],
    leaves: [
      { kind: 'work', start: '08:00', end: '12:00' },
      { kind: 'break', start: '12:00', end: '12:30' },
      { kind: 'work', start: '12:30', end: '17:00' },
    ],
    ...extra,
  })

export const FIXTURE_CALENDARS = {
  /** Mo–Fr 08–17 with lunch break, open end. */
  weekly: makeCalendar(CAL(1), 'Kalender Monteur', [weekdayBlock(1, CAL(1))]),
  /** Varied: Mo 08–17, Mi 11–15, one group. */
  varied: makeCalendar(CAL(2), 'Kalender Teilzeit', [
    makeBlock({ seq: 2, calendarId: CAL(2), start: '2026-01-05', weekdays: [1], leaves: [{ kind: 'work', start: '08:00', end: '17:00' }], groupId: fixtureId(94, 1) }),
    makeBlock({ seq: 3, calendarId: CAL(2), start: '2026-01-05', weekdays: [3], leaves: [{ kind: 'work', start: '11:00', end: '15:00' }], groupId: fixtureId(94, 1) }),
  ]),
  /** Weekly plus three days off (Mon–Wed, 12.–14.10.2026). */
  timeoff: makeCalendar(CAL(3), 'Kalender mit Urlaub', [
    weekdayBlock(4, CAL(3)),
    makeBlock({ seq: 5, calendarId: CAL(3), start: '2026-10-12', leaves: [{ kind: 'timeoff', start: '00:00', end: '24:00', days: 3 }], description: 'Urlaub', createdOn: '2026-09-20T08:00:00Z' }),
  ]),
  /** Weekly that ends 30.11.2026 (finding 5.2). */
  ending: makeCalendar(CAL(4), 'Kalender auslaufend', [weekdayBlock(6, CAL(4), { end: '2026-11-30' })]),
  /** Weekly plus a night shift Tue 06.10. 22:00 → Wed 07.10. 06:00 stored as two occurrences. */
  night: makeCalendar(CAL(5), 'Kalender Nachtschicht', [
    weekdayBlock(7, CAL(5)),
    makeBlock({ seq: 8, calendarId: CAL(5), start: '2026-10-06', leaves: [{ kind: 'work', start: '22:00', end: '24:00' }], createdOn: '2026-09-30T08:00:00Z' }),
    makeBlock({ seq: 9, calendarId: CAL(5), start: '2026-10-07', leaves: [{ kind: 'work', start: '00:00', end: '06:00' }], createdOn: '2026-09-30T08:00:01Z' }),
  ]),
  /** Weekly plus an orphan inner calendar and an unreadable root rule (finding 5.5). */
  orphan: (() => {
    const cal = makeCalendar(CAL(6), 'Kalender mit Resten', [weekdayBlock(10, CAL(6))], [rawRule({ calendarruleid: fixtureId(91, 999), _calendarid_value: CAL(6), rank: 0 })])
    cal.inner.push({ calendarid: fixtureId(90, 998), name: null, description: null, type: -1, calendar_calendar_rules: [rawRule({ calendarruleid: fixtureId(92, 9980), _calendarid_value: fixtureId(90, 998), offset: 480, duration: 480, timecode: 0, subcode: 1 })] })
    return cal
  })(),
  /** Weekly in Paris time (105) — the resource itself is in Berlin (finding 5.3). */
  otherZone: makeCalendar(CAL(7), 'Kalender Zeitzone', [weekdayBlock(11, CAL(7), { tz: 105 })]),
  /**
   * Shape of a real resource calendar in Schulz UAT (anonymized): the weekly
   * rule was split twice (one week Mo–Sa, a Saturday week), a holiday list
   * with offsets from 21:00Z to 23:00Z, and a single working day on the
   * 31.10.2025 holiday that wins over it.
   */
  live: makeCalendar(CAL(8), null, [
    makeBlock({ seq: 20, calendarId: CAL(8), start: '2000-01-01', end: '2025-09-02', weekdays: [1, 2, 3, 4, 5], leaves: [{ kind: 'work', start: '07:00', end: '15:00' }], modifiedOn: '2025-08-27T09:00:00Z' }),
    makeBlock({ seq: 21, calendarId: CAL(8), start: '2025-09-03', end: '2025-09-09', weekdays: [1, 2, 3, 4, 5, 6], leaves: [{ kind: 'work', start: '07:00', end: '15:00' }], modifiedOn: '2025-08-27T09:00:00Z' }),
    makeBlock({ seq: 22, calendarId: CAL(8), start: '2025-09-10', weekdays: [1, 2, 3, 4, 5], leaves: [{ kind: 'work', start: '07:00', end: '15:00' }], modifiedOn: '2025-08-27T09:00:00Z' }),
    makeBlock({ seq: 23, calendarId: CAL(8), start: '2025-09-10', end: '2025-09-10', weekdays: [6], leaves: [{ kind: 'work', start: '07:00', end: '15:00' }], modifiedOn: '2025-08-27T09:00:00Z' }),
    makeHolidayList(1, CAL(8), [
      { utcStart: '2025-04-17T22:00:00Z', days: 3.96 },
      { utcStart: '2025-05-28T21:00:00Z' },
      { utcStart: '2025-10-30T23:00:00Z' },
      { utcStart: '2025-12-24T22:00:00Z' },
    ]),
    makeBlock({ seq: 24, calendarId: CAL(8), start: '2025-10-31', leaves: [{ kind: 'work', start: '07:00', end: '15:00' }] }),
  ]),
  /** Organization closure calendar with the 2026 nationwide holidays (root-only rules). */
  closures: {
    calendar: {
      calendarid: CAL(50),
      name: 'Business Closure Calendar',
      description: null,
      type: 2,
      calendar_calendar_rules: [
        makeClosure(1, CAL(50), 'Neujahr', '2026-01-01'),
        makeClosure(2, CAL(50), 'Karfreitag', '2026-04-03'),
        makeClosure(3, CAL(50), 'Ostermontag', '2026-04-06'),
        makeClosure(4, CAL(50), 'Tag der Arbeit', '2026-05-01'),
        makeClosure(5, CAL(50), 'Christi Himmelfahrt', '2026-05-14'),
        makeClosure(6, CAL(50), 'Pfingstmontag', '2026-05-25'),
        makeClosure(7, CAL(50), 'Tag der Deutschen Einheit', '2026-10-03'),
        makeClosure(8, CAL(50), 'Weihnachten', '2026-12-25', 2),
      ],
    } as RawCalendar,
    inner: [] as RawCalendar[],
  },
}

export type FixtureKey = keyof typeof FIXTURE_CALENDARS

export const treeOf = (key: FixtureKey) => buildTree(FIXTURE_CALENDARS[key].calendar, FIXTURE_CALENDARS[key].inner)
