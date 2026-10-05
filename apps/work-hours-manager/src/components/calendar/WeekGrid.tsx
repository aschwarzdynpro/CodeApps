import { S } from '../../strings'
import type { DayResolution, Resource } from '../../types/calendar'
import { WEEKDAY_SHORT, eachDay, formatDayMonth, weekday } from '../../utils/dates'
import { DayPopover, type DayActions } from './DayPopover'
import { Legend, SegmentBar } from './SegmentBar'

export interface WeekRow {
  resource: Resource
  days: DayResolution[]
  fromSlots: boolean
  hours: number
}

interface Props {
  from: string
  to: string
  rows: WeekRow[]
  today: string
  focusedId: string | null
  onFocus: (id: string) => void
  onShowRule: (resourceId: string, innerCalendarId: string) => void
  actionsFor?: (resourceId: string) => DayActions | null
}

/** Resource × day grid with a 24-hour bar per cell. */
export function WeekGrid({ from, to, rows, today, focusedId, onFocus, onShowRule, actionsFor }: Props) {
  const dates = eachDay(from, to)
  if (rows.length === 0) return <p className="empty">{S.calendar.noResources}</p>
  return (
    <div className="weekgrid-wrap">
      <Legend />
      <div className="weekgrid" style={{ gridTemplateColumns: `220px repeat(${dates.length}, minmax(120px, 1fr)) 90px` }} role="table" aria-label={S.calendar.week}>
        <div className="weekgrid__head weekgrid__name" role="columnheader" />
        {dates.map((d) => (
          <div key={d} className={`weekgrid__head${d === today ? ' is-today' : ''}${weekday(d) >= 6 ? ' is-weekend' : ''}`} role="columnheader">
            <span>{WEEKDAY_SHORT[weekday(d) - 1]}</span> <span className="muted">{formatDayMonth(d)}</span>
          </div>
        ))}
        <div className="weekgrid__head weekgrid__sum" role="columnheader">
          {S.calendar.total}
        </div>
        {rows.map((row) => (
          <div key={row.resource.id} className={`weekgrid__row${focusedId === row.resource.id ? ' is-focused' : ''}`} role="row">
            <button type="button" className="weekgrid__name" onClick={() => onFocus(row.resource.id)} title={S.resources.showDetails} role="rowheader">
              <span className="weekgrid__resname">{row.resource.name}</span>
              <span className="muted small">{row.resource.orgUnit?.name ?? S.resourceTypes[row.resource.type]}</span>
            </button>
            {row.days.map((day) => (
              <div key={day.date} className={`weekgrid__cell${day.date === today ? ' is-today' : ''}${weekday(day.date) >= 6 ? ' is-weekend' : ''}`} role="cell">
                <DayPopover
                  day={day}
                  fromSlots={row.fromSlots}
                  onShowRule={(inner) => onShowRule(row.resource.id, inner)}
                  actions={actionsFor?.(row.resource.id) ?? null}
                  trigger={
                    <button type="button" className={`daycell${day.workMinutes === 0 ? ' daycell--off' : ''}`} aria-label={`${formatDayMonth(day.date)} ${row.resource.name}`}>
                      <SegmentBar day={day} />
                      <span className="daycell__text">{day.workMinutes > 0 ? S.calendar.hours(day.workMinutes / 60) : day.reason !== 'none' ? S.reasons[day.reason] : '–'}</span>
                    </button>
                  }
                />
              </div>
            ))}
            <div className={`weekgrid__sum${row.hours === 0 ? ' text-danger' : ''}`} role="cell">
              {S.calendar.hours(row.hours)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
