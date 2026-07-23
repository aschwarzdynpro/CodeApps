/**
 * Pure date helpers for the run scheduler picker. Every function takes its
 * clock/date inputs explicitly (no hidden `new Date()`), keeping them
 * unit-testable and render-safe under the React Compiler purity rules.
 */

export interface DayCell {
  /** Local date at midnight. */
  date: Date
  /** False for the leading/trailing days of the adjacent months. */
  inMonth: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local "YYYY-MM-DDTHH:mm" — the classic datetime-local input format. */
export function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Monday-first calendar: 6 weeks × 7 days covering the given month (0-based). */
export function monthGrid(year: number, month: number): DayCell[][] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const weeks: DayCell[][] = []
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(year, month, 1 - lead + w * 7 + d)
      row.push({ date, inMonth: date.getMonth() === month })
    }
    weeks.push(row)
  }
  return weeks
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Date-only comparison (for disabling past calendar cells). */
export function isBeforeDay(d: Date, ref: Date): boolean {
  return (
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() <
    new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime()
  )
}

export interface QuickPick {
  label: string
  when: Date
}

/** Quick schedule suggestions relative to `now` — all strictly in the future. */
export function quickPicks(now: Date): QuickPick[] {
  const nextHour = new Date(now)
  nextHour.setMinutes(0, 0, 0)
  nextHour.setHours(nextHour.getHours() + 1)
  const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0)
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0)
  const daysToMonday = (8 - now.getDay()) % 7 || 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMonday, 8, 0)
  const picks: QuickPick[] = [{ label: 'In 1 hour', when: nextHour }]
  if (tonight.getTime() > now.getTime()) picks.push({ label: 'Today 18:00', when: tonight })
  picks.push({ label: 'Tomorrow 08:00', when: tomorrow })
  picks.push({ label: 'Monday 08:00', when: monday })
  return picks
}
