/** Formatierung & Datums-Helfer (de-DE, EUR) für das gesamte Dashboard. */

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const EUR_COMPACT = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const NUMBER = new Intl.NumberFormat('de-DE')

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const DATE_TIME = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export const fmtEur = (value: number): string => EUR.format(value)

/** Kompakte Beträge für Charts/KPIs, z. B. "1,2 Mio. €". */
export const fmtEurCompact = (value: number): string => EUR_COMPACT.format(value)

export const fmtNumber = (value: number): string => NUMBER.format(value)

export const fmtDate = (value?: string): string =>
  value ? DATE.format(new Date(value)) : '–'

export const fmtDateTime = (value?: string): string =>
  value ? DATE_TIME.format(new Date(value)) : '–'

/* ------------------------------------------------------------ Zeitfenster */

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`
}

export function isThisMonth(value: string | undefined, now: Date): boolean {
  return !!value && monthKey(new Date(value)) === monthKey(now)
}

export function isLastMonth(value: string | undefined, now: Date): boolean {
  if (!value) return false
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return monthKey(new Date(value)) === monthKey(prev)
}

/**
 * Entscheidungsfenster der Legacy-Opportunity-View: alles bis einschließlich
 * Ende des übernächsten Monats (überfällig | dieser Monat | nächste 2 Monate).
 */
export function isWithinNextMonths(
  value: string | undefined,
  now: Date,
  months: number,
): boolean {
  if (!value) return false
  const limit = new Date(now.getFullYear(), now.getMonth() + months + 1, 1)
  return new Date(value).getTime() < limit.getTime()
}

/** ISO-Kalenderwoche, z. B. für "Anzahl Termine nach Woche". */
export function isoWeek(value: string): number {
  const d = new Date(value)
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1)
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

/** Sortierschlüssel, der über Jahresgrenzen hinweg chronologisch bleibt. */
export function isoWeekSortKey(value: string): number {
  const d = new Date(value)
  return d.getFullYear() * 100 + isoWeek(value)
}
