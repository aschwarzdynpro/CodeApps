import { addMonths, daysInMonth, MONTH_LONG, parseDate, toDateStr, weekday, WEEKDAY_SHORT, formatDateWithDay } from '../utils/dates'
import type { RowStatus } from './parts'

export interface CalendarItem {
  date: string
  status: RowStatus
  label: string
}

const MAX_MONTHS = 15

/**
 * Month grids from the first to the last item: every occurrence is a colored
 * day, holidays are marked — the series at a glance, like a wall calendar.
 */
export function CalendarOverview({ items, holidays, today }: { items: CalendarItem[]; holidays: Map<string, string>; today: string }) {
  if (items.length === 0) return null
  const dates = items.map((i) => i.date).sort()
  const first = parseDate(dates[0])
  const last = parseDate(dates[dates.length - 1])
  const months: { y: number; m: number }[] = []
  for (let k = 0; months.length < MAX_MONTHS; k++) {
    const mm = addMonths(first.y, first.m, k)
    if (mm.y * 12 + mm.m > last.y * 12 + last.m) break
    months.push(mm)
  }
  const byDate = new Map<string, CalendarItem[]>()
  for (const i of items) byDate.set(i.date, [...(byDate.get(i.date) ?? []), i])

  return (
    <div className="calendar" aria-label="Kalenderübersicht">
      {months.map(({ y, m }) => {
        const firstDay = toDateStr(y, m, 1)
        const offset = weekday(firstDay) - 1
        const dim = daysInMonth(y, m)
        return (
          <div key={`${y}-${m}`} className="calendar__month">
            <div className="calendar__title">
              {MONTH_LONG[m - 1]} {y}
            </div>
            <div className="calendar__grid">
              {WEEKDAY_SHORT.map((d) => (
                <span key={d} className="calendar__dow">
                  {d}
                </span>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {Array.from({ length: dim }, (_, i) => {
                const date = toDateStr(y, m, i + 1)
                const hits = byDate.get(date) ?? []
                const holiday = holidays.get(date)
                const status = hits[0]?.status
                const title = [formatDateWithDay(date), holiday ? `Feiertag: ${holiday}` : null, ...hits.map((h) => h.label)].filter(Boolean).join('\n')
                return (
                  <span
                    key={date}
                    title={title}
                    className={[
                      'calendar__day',
                      status ? `calendar__day--${status}` : '',
                      holiday ? 'calendar__day--holiday' : '',
                      date === today ? 'calendar__day--today' : '',
                      weekday(date) >= 6 ? 'calendar__day--weekend' : '',
                    ].join(' ')}
                  >
                    {i + 1}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
