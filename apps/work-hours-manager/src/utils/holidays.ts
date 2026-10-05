import { S } from '../strings'
import type { Closure } from '../types/calendar'
import { addDays, toDateStr, weekday, zonedToUtc } from './dates'

/**
 * Public holiday rule sets (Germany nationwide + 16 states, Austria,
 * Switzerland) as pure functions — no external API. Movable feasts derive
 * from Easter Sunday (anonymous Gregorian algorithm).
 *
 * `reconcile` compares a generated year with the organization's business
 * closures: present, missing, different name, only partially covered,
 * closures the rule set doesn't know, duplicates.
 */

export interface Holiday {
  /** Stable key, e.g. `karfreitag`. */
  key: string
  name: string
  date: string
  /** `national` = whole country, `regional` = this state only. */
  scope: 'national' | 'regional'
  /** Only parts of the state observe it (e.g. Mariä Himmelfahrt in Bavaria). */
  optional?: boolean
}

export interface Ruleset {
  id: string
  /** Country code the set belongs to. */
  country: 'DE' | 'AT' | 'CH'
  label: string
}

export const RULESETS: Ruleset[] = [
  { id: 'DE', country: 'DE', label: 'Deutschland — bundesweit' },
  { id: 'DE-BW', country: 'DE', label: 'Baden-Württemberg' },
  { id: 'DE-BY', country: 'DE', label: 'Bayern' },
  { id: 'DE-BE', country: 'DE', label: 'Berlin' },
  { id: 'DE-BB', country: 'DE', label: 'Brandenburg' },
  { id: 'DE-HB', country: 'DE', label: 'Bremen' },
  { id: 'DE-HH', country: 'DE', label: 'Hamburg' },
  { id: 'DE-HE', country: 'DE', label: 'Hessen' },
  { id: 'DE-MV', country: 'DE', label: 'Mecklenburg-Vorpommern' },
  { id: 'DE-NI', country: 'DE', label: 'Niedersachsen' },
  { id: 'DE-NW', country: 'DE', label: 'Nordrhein-Westfalen' },
  { id: 'DE-RP', country: 'DE', label: 'Rheinland-Pfalz' },
  { id: 'DE-SL', country: 'DE', label: 'Saarland' },
  { id: 'DE-SN', country: 'DE', label: 'Sachsen' },
  { id: 'DE-ST', country: 'DE', label: 'Sachsen-Anhalt' },
  { id: 'DE-SH', country: 'DE', label: 'Schleswig-Holstein' },
  { id: 'DE-TH', country: 'DE', label: 'Thüringen' },
  { id: 'AT', country: 'AT', label: 'Österreich' },
  { id: 'CH', country: 'CH', label: 'Schweiz — national und verbreitet' },
]

/** Easter Sunday of `year` (Gregorian, anonymous algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
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
  return toDateStr(year, month, day)
}

/** Buß- und Bettag: the Wednesday before 23 November. */
export function bussUndBettag(year: number): string {
  let d = toDateStr(year, 11, 22)
  while (weekday(d) !== 3) d = addDays(d, -1)
  return d
}

type Def = Omit<Holiday, 'date' | 'scope'> & { date: (year: number, easter: string) => string }

const fixed = (key: string, name: string, m: number, d: number): Def => ({ key, name, date: (y) => toDateStr(y, m, d) })
const easterRel = (key: string, name: string, offset: number): Def => ({ key, name, date: (_y, e) => addDays(e, offset) })

const NEUJAHR = fixed('neujahr', 'Neujahr', 1, 1)
const DREIKOENIG = fixed('heilige-drei-koenige', 'Heilige Drei Könige', 1, 6)
const KARFREITAG = easterRel('karfreitag', 'Karfreitag', -2)
const OSTERSONNTAG = easterRel('ostersonntag', 'Ostersonntag', 0)
const OSTERMONTAG = easterRel('ostermontag', 'Ostermontag', 1)
const TAG_DER_ARBEIT = fixed('tag-der-arbeit', 'Tag der Arbeit', 5, 1)
const HIMMELFAHRT = easterRel('christi-himmelfahrt', 'Christi Himmelfahrt', 39)
const PFINGSTSONNTAG = easterRel('pfingstsonntag', 'Pfingstsonntag', 49)
const PFINGSTMONTAG = easterRel('pfingstmontag', 'Pfingstmontag', 50)
const FRONLEICHNAM = easterRel('fronleichnam', 'Fronleichnam', 60)
const MARIAE_HIMMELFAHRT = fixed('mariae-himmelfahrt', 'Mariä Himmelfahrt', 8, 15)
const WELTKINDERTAG = fixed('weltkindertag', 'Weltkindertag', 9, 20)
const EINHEIT = fixed('tag-der-deutschen-einheit', 'Tag der Deutschen Einheit', 10, 3)
const REFORMATIONSTAG = fixed('reformationstag', 'Reformationstag', 10, 31)
const ALLERHEILIGEN = fixed('allerheiligen', 'Allerheiligen', 11, 1)
const BUSSTAG: Def = { key: 'buss-und-bettag', name: 'Buß- und Bettag', date: (y) => bussUndBettag(y) }
const FRAUENTAG = fixed('internationaler-frauentag', 'Internationaler Frauentag', 3, 8)
const WEIHNACHTEN_1 = fixed('erster-weihnachtstag', '1. Weihnachtstag', 12, 25)
const WEIHNACHTEN_2 = fixed('zweiter-weihnachtstag', '2. Weihnachtstag', 12, 26)

const DE_NATIONAL: Def[] = [NEUJAHR, KARFREITAG, OSTERMONTAG, TAG_DER_ARBEIT, HIMMELFAHRT, PFINGSTMONTAG, EINHEIT, WEIHNACHTEN_1, WEIHNACHTEN_2]

const DE_REGIONAL: Record<string, (Def & { optional?: boolean })[]> = {
  'DE-BW': [DREIKOENIG, FRONLEICHNAM, ALLERHEILIGEN],
  'DE-BY': [DREIKOENIG, FRONLEICHNAM, { ...MARIAE_HIMMELFAHRT, optional: true }, ALLERHEILIGEN],
  'DE-BE': [FRAUENTAG],
  'DE-BB': [OSTERSONNTAG, PFINGSTSONNTAG, REFORMATIONSTAG],
  'DE-HB': [REFORMATIONSTAG],
  'DE-HH': [REFORMATIONSTAG],
  'DE-HE': [FRONLEICHNAM],
  'DE-MV': [FRAUENTAG, REFORMATIONSTAG],
  'DE-NI': [REFORMATIONSTAG],
  'DE-NW': [FRONLEICHNAM, ALLERHEILIGEN],
  'DE-RP': [FRONLEICHNAM, ALLERHEILIGEN],
  'DE-SL': [FRONLEICHNAM, MARIAE_HIMMELFAHRT, ALLERHEILIGEN],
  'DE-SN': [REFORMATIONSTAG, BUSSTAG],
  'DE-ST': [DREIKOENIG, REFORMATIONSTAG],
  'DE-SH': [REFORMATIONSTAG],
  'DE-TH': [WELTKINDERTAG, REFORMATIONSTAG],
}

const AT: Def[] = [
  NEUJAHR,
  DREIKOENIG,
  OSTERMONTAG,
  fixed('staatsfeiertag', 'Staatsfeiertag', 5, 1),
  HIMMELFAHRT,
  PFINGSTMONTAG,
  FRONLEICHNAM,
  MARIAE_HIMMELFAHRT,
  fixed('nationalfeiertag', 'Nationalfeiertag', 10, 26),
  ALLERHEILIGEN,
  fixed('mariae-empfaengnis', 'Mariä Empfängnis', 12, 8),
  fixed('christtag', 'Christtag', 12, 25),
  fixed('stefanitag', 'Stefanitag', 12, 26),
]

const CH: (Def & { optional?: boolean })[] = [
  NEUJAHR,
  { ...KARFREITAG, optional: true },
  { ...OSTERMONTAG, optional: true },
  easterRel('auffahrt', 'Auffahrt', 39),
  { ...PFINGSTMONTAG, optional: true },
  fixed('bundesfeier', 'Bundesfeier', 8, 1),
  fixed('weihnachten', 'Weihnachtstag', 12, 25),
  { ...fixed('stephanstag', 'Stephanstag', 12, 26), optional: true },
]

export function rulesetById(id: string): Ruleset | null {
  return RULESETS.find((r) => r.id === id) ?? null
}

/** Holidays of `year` for a rule set, sorted by date; `regional` marks the state-specific ones. */
export function generateHolidays(rulesetId: string, year: number): Holiday[] {
  const easter = easterSunday(year)
  const make = (defs: (Def & { optional?: boolean })[], scope: Holiday['scope']): Holiday[] =>
    defs.map((d) => ({ key: d.key, name: d.name, date: d.date(year, easter), scope, ...(d.optional ? { optional: true } : {}) }))
  let out: Holiday[]
  if (rulesetId === 'AT') out = make(AT, 'national')
  else if (rulesetId === 'CH') out = make(CH, 'national')
  else if (rulesetId === 'DE') out = make(DE_NATIONAL, 'national')
  else if (DE_REGIONAL[rulesetId]) out = [...make(DE_NATIONAL, 'national'), ...make(DE_REGIONAL[rulesetId], 'regional')]
  else out = []
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// ---------------------------------------------------------------------------
// Reconciliation with the organization's business closures
// ---------------------------------------------------------------------------

export type MatchStatus = 'ok' | 'missing' | 'nameDiffers' | 'partial'

export interface HolidayMatch {
  holiday: Holiday
  closure: Closure | null
  status: MatchStatus
}

export interface Reconciliation {
  matches: HolidayMatch[]
  /** Closures of the year the rule set doesn't know (company holidays, bridging days …). */
  extra: Closure[]
  /** Several closures covering the same day. */
  duplicates: Closure[][]
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Closure covers the local day [00:00, 24:00) of `date` in `tz` fully (`full`) or partly. */
function coverage(c: Closure, date: string, tz: string): 'full' | 'partial' | 'none' {
  const dayStart = Date.parse(zonedToUtc(date, '00:00', tz))
  const dayEnd = Date.parse(zonedToUtc(addDays(date, 1), '00:00', tz))
  const s = Date.parse(c.start)
  const e = Date.parse(c.end)
  if (e <= dayStart || s >= dayEnd) return 'none'
  return s <= dayStart && e >= dayEnd ? 'full' : 'partial'
}

/** Compares the generated holidays of a year with the closures that touch the year. */
export function reconcile(holidays: Holiday[], closures: Closure[], year: number, tz: string): Reconciliation {
  const used = new Set<string>()
  const matches: HolidayMatch[] = holidays.map((h) => {
    const candidates = closures.map((c) => ({ c, cov: coverage(c, h.date, tz) })).filter((x) => x.cov !== 'none')
    if (candidates.length === 0) return { holiday: h, closure: null, status: 'missing' }
    const sameName = candidates.find((x) => normalize(x.c.name) === normalize(h.name)) ?? candidates[0]
    used.add(sameName.c.id)
    const status: MatchStatus = sameName.cov === 'partial' ? 'partial' : normalize(sameName.c.name) === normalize(h.name) ? 'ok' : 'nameDiffers'
    return { holiday: h, closure: sameName.c, status }
  })
  const inYear = closures.filter((c) => c.start.slice(0, 4) === String(year) || c.end.slice(0, 4) === String(year))
  const extra = inYear.filter((c) => !used.has(c.id))
  const duplicates: Closure[][] = []
  const byDay = new Map<string, Closure[]>()
  for (const c of inYear) {
    const day = c.start.slice(0, 10)
    const list = byDay.get(day) ?? []
    list.push(c)
    byDay.set(day, list)
  }
  for (const list of byDay.values()) if (list.length > 1) duplicates.push(list)
  return { matches, extra, duplicates }
}

export const matchLabel = (status: MatchStatus): string => S.holidays.status[status]

/** Closure payload for a holiday: whole local day in `tz` (what `msdyn_BusinessClosureSave` expects as Start/End). */
export function closureSpan(date: string, tz: string, days = 1): { start: string; end: string } {
  return { start: zonedToUtc(date, '00:00', tz), end: zonedToUtc(addDays(date, days), '00:00', tz) }
}
