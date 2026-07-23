import { useMemo, useState } from 'react'
import {
  isBeforeDay,
  monthGrid,
  quickPicks,
  sameDay,
  toLocalInputValue,
} from '../utils/schedule'

interface Props {
  /** Local "YYYY-MM-DDTHH:mm" value (same format the old datetime-local used). */
  value: string
  onChange: (value: string) => void
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

/**
 * House-style date+time picker replacing the clunky native datetime-local
 * popup: quick-pick chips, a Monday-first month grid (past days disabled) and
 * 24h hour/minute selects. Emits the same local input format as before, so
 * the dialog's parsing/validation is untouched. The clock is read once at
 * mount (state initializers) and inside event handlers — never during render.
 */
export function SchedulePicker({ value, onChange }: Props) {
  const [today] = useState(() => new Date())
  const selected = value ? new Date(value) : null
  const valid = selected !== null && !Number.isNaN(selected.getTime())
  const [view, setView] = useState(() => {
    const base = valid ? selected! : today
    return { y: base.getFullYear(), m: base.getMonth() }
  })

  const picks = useMemo(() => quickPicks(today), [today])
  const grid = useMemo(() => monthGrid(view.y, view.m), [view])

  const emit = (d: Date) => {
    onChange(toLocalInputValue(d))
    setView({ y: d.getFullYear(), m: d.getMonth() })
  }
  const pickDay = (day: Date) => {
    emit(
      new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        valid ? selected!.getHours() : 8,
        valid ? selected!.getMinutes() : 0,
      ),
    )
  }
  const pickTime = (hours: number, minutes: number) => {
    const base = valid ? selected! : new Date()
    emit(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes))
  }

  const moveMonth = (delta: number) => {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }
  const atCurrentMonth =
    view.y === today.getFullYear() && view.m === today.getMonth()

  // Depend on the primitive minutes value — `selected` is a fresh Date each render.
  const selectedMinutes = valid ? selected!.getMinutes() : null
  const minuteOptions = useMemo(() => {
    const set = new Set(MINUTE_STEPS)
    if (selectedMinutes !== null) set.add(selectedMinutes)
    return [...set].sort((a, b) => a - b)
  }, [selectedMinutes])

  return (
    <div className="sched">
      <div className="chips sched-quick">
        {picks.map((p) => (
          <button
            key={p.label}
            className={`chip ${valid && selected!.getTime() === p.when.getTime() ? 'chip--active' : ''}`}
            onClick={() => emit(p.when)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="sched-body">
        <div className="sched-cal">
          <div className="sched-cal-head">
            <button
              className="sched-nav"
              aria-label="Previous month"
              disabled={atCurrentMonth}
              onClick={() => moveMonth(-1)}
            >
              ‹
            </button>
            <span>
              {MONTHS[view.m]} {view.y}
            </span>
            <button
              className="sched-nav"
              aria-label="Next month"
              onClick={() => moveMonth(1)}
            >
              ›
            </button>
          </div>
          <div className="sched-grid">
            {WEEKDAYS.map((w) => (
              <span key={w} className="sched-dow">
                {w}
              </span>
            ))}
            {grid.flat().map((cell) => (
              <button
                key={cell.date.getTime()}
                className={[
                  'sched-day',
                  cell.inMonth ? '' : 'sched-day--out',
                  valid && sameDay(cell.date, selected!) ? 'sched-day--sel' : '',
                  sameDay(cell.date, today) ? 'sched-day--today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={isBeforeDay(cell.date, today)}
                onClick={() => pickDay(cell.date)}
              >
                {cell.date.getDate()}
              </button>
            ))}
          </div>
        </div>
        <div className="sched-time">
          <span className="form-label">Time (24h)</span>
          <div className="sched-time-row">
            <select
              aria-label="Hour"
              value={valid ? selected!.getHours() : 8}
              onChange={(e) =>
                pickTime(Number(e.target.value), valid ? selected!.getMinutes() : 0)
              }
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}
                </option>
              ))}
            </select>
            :
            <select
              aria-label="Minutes"
              value={valid ? selected!.getMinutes() : 0}
              onChange={(e) =>
                pickTime(valid ? selected!.getHours() : 8, Number(e.target.value))
              }
            >
              {minuteOptions.map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
          {valid && (
            <span className="muted sched-selected">
              {selected!.toLocaleString(undefined, {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
