import { Badge, Popover, PopoverSurface, PopoverTrigger, Tag } from '@fluentui/react-components'
import { type ReactElement } from 'react'
import { S } from '../../strings'
import type { DayResolution, DaySegment } from '../../types/calendar'
import { formatDateWithDay, formatDuration } from '../../utils/dates'
import { Btn } from '../ui'
import { spanLabel } from '../../utils/format'

const ORIGIN_COLOR: Record<DaySegment['origin']['kind'], 'brand' | 'informative' | 'warning' | 'danger' | 'subtle' | 'important'> = {
  recurrence: 'brand',
  occurrence: 'important',
  break: 'subtle',
  timeoff: 'warning',
  nonwork: 'subtle',
  closure: 'danger',
  slot: 'informative',
}

export interface DayActions {
  /** Opens the editor for this day: an occurrence block directly, a recurrence as "edit day". */
  editDay: (innerCalendarId: string, date: string) => void
  create: (kind: 'work' | 'timeoff', date: string) => void
}

interface Props {
  day: DayResolution
  trigger: ReactElement
  /** Whether working time came from `msdyn_LoadCalendars` (true) or from the rules. */
  fromSlots: boolean
  onShowRule?: (innerCalendarId: string) => void
  actions?: DayActions | null
}

/** Resolution of one day: every segment with its time span and origin. */
export function DayPopover({ day, trigger, fromSlots, onShowRule, actions }: Props) {
  const workRule = day.segments.find((s) => s.kind === 'work' && s.origin.innerCalendarId && (s.origin.kind === 'recurrence' || s.origin.kind === 'occurrence'))?.origin.innerCalendarId ?? null
  return (
    <Popover withArrow positioning="above-start" size="small">
      <PopoverTrigger disableButtonEnhancement>{trigger}</PopoverTrigger>
      <PopoverSurface className="daypop" aria-label={formatDateWithDay(day.date)}>
        <div className="daypop__head">
          <strong>{formatDateWithDay(day.date)}</strong>
          <span className="muted">
            {day.workMinutes > 0 ? `${S.calendar.total} ${formatDuration(day.workMinutes)}${day.capacityHours * 60 !== day.workMinutes ? ` · ${S.resources.capacity(day.capacityHours)}` : ''}` : S.calendar.noWork}
          </span>
        </div>
        {day.workMinutes === 0 && day.reason !== 'none' ? <Badge appearance="tint" color={day.reason === 'closure' ? 'danger' : day.reason === 'timeoff' ? 'warning' : 'subtle'}>{S.reasons[day.reason]}</Badge> : null}
        <ul className="daypop__list">
          {day.segments.map((s, i) => (
            <li key={i} className="daypop__row">
              <span className={`legend__swatch seg--${s.kind}`} />
              <span className="daypop__span">{spanLabel(s)}</span>
              <span className="daypop__kind">{S.segments[s.kind]}</span>
              <Tag size="extra-small" appearance="brand" className={`origin-tag origin-tag--${ORIGIN_COLOR[s.origin.kind]}`} title={s.origin.label}>
                {S.origins[s.origin.kind]}
              </Tag>
              <span className="daypop__origin muted small" title={s.origin.label}>
                {s.origin.label}
              </span>
              {onShowRule && s.origin.innerCalendarId && s.kind !== 'closure' ? (
                <Btn kind="ghost" small onClick={() => onShowRule(s.origin.innerCalendarId!)} title={S.calendar.showRule}>
                  {S.calendar.rule}
                </Btn>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="daypop__foot">
          <span className="muted small">{fromSlots ? S.calendar.fromSlots : S.calendar.derived}</span>
          {actions ? (
            <span className="daypop__actions">
              {workRule ? (
                <Btn small onClick={() => actions.editDay(workRule, day.date)}>
                  {S.calendar.editDay}
                </Btn>
              ) : (
                <Btn small onClick={() => actions.create('work', day.date)}>
                  {S.calendar.addWork}
                </Btn>
              )}
              <Btn small onClick={() => actions.create('timeoff', day.date)}>
                {S.calendar.addAbsence}
              </Btn>
            </span>
          ) : null}
        </div>
      </PopoverSurface>
    </Popover>
  )
}
