import { S } from '../../strings'
import type { DayResolution, Resource } from '../../types/calendar'
import { WEEKDAY_SHORT, parseDate } from '../../utils/dates'
import { DayPopover } from './DayPopover'
import { Legend, SegmentBar } from './SegmentBar'

interface Props {
  resource: Resource | null
  days: DayResolution[]
  focusFrom: string
  focusTo: string
  today: string
  fromSlots: boolean
  onShowRule: (innerCalendarId: string) => void
}

/** Six-week grid of one resource with a compact bar per day. */
export function MonthGrid({ resource, days, focusFrom, focusTo, today, fromSlots, onShowRule }: Props) {
  if (!resource) return <p className="empty">{S.calendar.pickResource}</p>
  const inMonth = days.filter((d) => d.date >= focusFrom && d.date <= focusTo)
  const total = inMonth.reduce((s, d) => s + d.workMinutes, 0) / 60
  return (
    <div className="monthgrid-wrap">
      <div className="monthgrid__title">
        <strong>{resource.name}</strong>
        <span className="muted">
          {S.calendar.total} {S.calendar.hours(total)}
        </span>
        <Legend />
      </div>
      <div className="monthgrid" role="table" aria-label={S.calendar.month}>
        {WEEKDAY_SHORT.map((w) => (
          <div key={w} className="monthgrid__head" role="columnheader">
            {w}
          </div>
        ))}
        {days.map((day) => {
          const outside = day.date < focusFrom || day.date > focusTo
          return (
            <DayPopover
              key={day.date}
              day={day}
              fromSlots={fromSlots}
              onShowRule={onShowRule}
              trigger={
                <button type="button" className={`monthcell${outside ? ' monthcell--outside' : ''}${day.date === today ? ' is-today' : ''}${day.workMinutes === 0 && !outside ? ' monthcell--off' : ''}`} role="cell" aria-label={day.date}>
                  <span className="monthcell__day">{parseDate(day.date).d}</span>
                  <SegmentBar day={day} compact />
                  <span className="monthcell__text">{day.workMinutes > 0 ? S.calendar.hours(day.workMinutes / 60) : day.reason !== 'none' ? S.reasons[day.reason] : ''}</span>
                </button>
              }
            />
          )
        })}
      </div>
    </div>
  )
}
