import { Checkbox, Combobox, Option, SpinButton, Tooltip, makeStyles, mergeClasses } from '@fluentui/react-components'
import { useState } from 'react'
import { DatePicker } from '@fluentui/react-datepicker-compat'
import { TimePicker } from '@fluentui/react-timepicker-compat'
import { DeleteRegular } from '@fluentui/react-icons'
import { S } from '../../strings'
import type { Weekday } from '../../types/calendar'
import { WEEKDAY_LONG, WEEKDAY_SHORT, formatDate, formatTime, parseDate, parseTime, toDateStr } from '../../utils/dates'
import { DE_CALENDAR } from '../../utils/calendarStrings'
import type { TimeSegment } from '../../utils/intents'
import { timeZoneOptionLabel, timeZoneOptions } from '../../utils/timezones'
import { Btn, Select } from '../ui'

/** Building blocks of the editor dialog: date, time, weekdays, segments, time zone. */

// Fluent's Combobox/DatePicker roots carry a 250px min-width; Griffel classes win over App.css, so sizes live here.
const useStyles = makeStyles({
  time: { minWidth: '112px', width: '112px' },
  date: { minWidth: '150px', width: '180px' },
  zone: { minWidth: '300px', width: '100%', maxWidth: '460px' },
})

const toJsDate = (date: string): Date => {
  const { y, m, d } = parseDate(date)
  return new Date(y, m - 1, d)
}
const fromJsDate = (d: Date): string => toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate())

export function DateField({ value, onChange, allowEmpty, placeholder, ariaLabel, minDate }: { value: string | null; onChange: (date: string | null) => void; allowEmpty?: boolean; placeholder?: string; ariaLabel: string; minDate?: string }) {
  const styles = useStyles()
  return (
    <DatePicker
      size="small"
      className={styles.date}
      aria-label={ariaLabel}
      value={value ? toJsDate(value) : null}
      onSelectDate={(d) => onChange(d ? fromJsDate(d) : allowEmpty ? null : value)}
      formatDate={(d) => (d ? formatDate(fromJsDate(d)) : '')}
      strings={DE_CALENDAR}
      firstDayOfWeek={1}
      placeholder={placeholder}
      allowTextInput={false}
      minDate={minDate ? toJsDate(minDate) : undefined}
      showGoToToday
    />
  )
}

const anchor = new Date(2026, 0, 5)
const toTime = (hhmm: string): Date | null => {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null
  const d = new Date(anchor)
  d.setHours(Math.floor(parseTime(hhmm) / 60), parseTime(hhmm) % 60, 0, 0)
  return d
}

export function TimeField({ value, onChange, ariaLabel, disabled }: { value: string; onChange: (time: string) => void; ariaLabel: string; disabled?: boolean }) {
  const styles = useStyles()
  // Controlled Fluent TimePicker: `selectedTime` + the text `value`; free typing keeps a local text until it parses.
  const [text, setText] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }
  const commit = (hhmm: string) => {
    if (/^\d{2}:\d{2}$/.test(hhmm) && hhmm !== value) onChange(hhmm)
  }
  return (
    <TimePicker
      size="small"
      className={mergeClasses('field-time', styles.time)}
      aria-label={ariaLabel}
      hourCycle="h23"
      increment={15}
      dateAnchor={anchor}
      selectedTime={toTime(value)}
      value={text}
      freeform
      disabled={disabled}
      onInput={(e) => setText((e.target as HTMLInputElement).value)}
      onBlur={() => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
        if (m) commit(`${m[1].padStart(2, '0')}:${m[2]}`)
        else setText(value)
      }}
      onTimeChange={(_, d) => {
        if (d.selectedTime) {
          const hhmm = formatTime(d.selectedTime.getHours() * 60 + d.selectedTime.getMinutes())
          setText(hhmm)
          commit(hhmm)
        } else if (d.selectedTimeText && /^\d{1,2}:\d{2}$/.test(d.selectedTimeText)) {
          const hhmm = d.selectedTimeText.padStart(5, '0')
          setText(hhmm)
          commit(hhmm)
        }
      }}
    />
  )
}

export function WeekdayPicker({ value, onChange, disabled }: { value: Weekday[]; onChange: (days: Weekday[]) => void; disabled?: boolean }) {
  return (
    <div className="weekdays" role="group" aria-label={S.editor.weekdays}>
      {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => (
        <Checkbox
          key={d}
          size="medium"
          label={WEEKDAY_SHORT[d - 1]}
          title={WEEKDAY_LONG[d - 1]}
          checked={value.includes(d)}
          disabled={disabled}
          onChange={(_, data) => onChange(data.checked ? [...value, d].sort((a, b) => a - b) : value.filter((x) => x !== d))}
        />
      ))}
    </div>
  )
}

const KIND_OPTIONS = [
  { value: 'work', label: S.kinds.work },
  { value: 'break', label: S.kinds.break },
]

export function SegmentsEditor({ segments, onChange, disabled }: { segments: TimeSegment[]; onChange: (segments: TimeSegment[]) => void; disabled?: boolean }) {
  const update = (i: number, patch: Partial<TimeSegment>) => onChange(segments.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const last = segments[segments.length - 1]
  const nextStart = last ? (last.end === '24:00' ? '00:00' : last.end) : '08:00'
  return (
    <div className="segments">
      {segments.map((seg, i) => (
        <div key={i} className="segment-row">
          <div className="w-120">
            <Select small value={seg.kind} options={KIND_OPTIONS} onChange={(v) => update(i, { kind: v as TimeSegment['kind'] })} aria-label={S.editor.kind} disabled={disabled} />
          </div>
          <span className="muted small">{S.editor.from}</span>
          <TimeField value={seg.start} onChange={(start) => update(i, { start })} ariaLabel={`${S.editor.from} ${i + 1}`} disabled={disabled} />
          <span className="muted small">{S.editor.to}</span>
          <TimeField value={seg.end === '24:00' ? '23:59' : seg.end} onChange={(end) => update(i, { end })} ariaLabel={`${S.editor.to} ${i + 1}`} disabled={disabled || seg.end === '24:00'} />
          <Tooltip content="Bis Mitternacht (24:00)" relationship="label">
            <Checkbox size="medium" label="24:00" checked={seg.end === '24:00'} disabled={disabled} onChange={(_, d) => update(i, { end: d.checked ? '24:00' : '17:00' })} />
          </Tooltip>
          <Btn kind="ghost" small icon={<DeleteRegular />} aria-label={S.editor.remove} onClick={() => onChange(segments.filter((_, j) => j !== i))} disabled={disabled} />
        </div>
      ))}
      <div className="segment-actions">
        <Btn small onClick={() => onChange([...segments, { kind: 'work', start: nextStart, end: formatTime(Math.min(parseTime(nextStart) + 240, 1439)) }])} disabled={disabled}>
          {S.editor.addWork}
        </Btn>
        <Btn small onClick={() => onChange([...segments, { kind: 'break', start: nextStart, end: formatTime(Math.min(parseTime(nextStart) + 30, 1439)) }])} disabled={disabled}>
          {S.editor.addBreak}
        </Btn>
      </div>
    </div>
  )
}

const spinValue = (value: number | null | undefined, display: string | undefined, fallback: number): number => {
  const n = value ?? (display !== undefined ? Number(display) : NaN)
  return Number.isFinite(n) ? Math.max(1, Math.round(n)) : fallback
}

export function EffortField({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return <SpinButton size="small" className="w-120" min={1} max={999} value={value} disabled={disabled} aria-label={S.editor.effort} onChange={(_, d) => onChange(spinValue(d.value, d.displayValue, value))} />
}

export function DaysField({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return <SpinButton size="small" className="w-120" min={1} max={1830} value={value} disabled={disabled} aria-label={S.editor.days} onChange={(_, d) => onChange(spinValue(d.value, d.displayValue, value))} />
}

export function TimeZoneField({ value, onChange, disabled }: { value: number; onChange: (code: number) => void; disabled?: boolean }) {
  const styles = useStyles()
  const zones = timeZoneOptions()
  const current = zones.find((z) => z.code === value)
  return (
    <Combobox size="small" className={styles.zone} aria-label={S.editor.timeZone} disabled={disabled} value={current ? timeZoneOptionLabel(current) : String(value)} selectedOptions={[String(value)]} onOptionSelect={(_, d) => d.optionValue && onChange(Number(d.optionValue))}>
      {zones.map((z) => (
        <Option key={z.code} value={String(z.code)} text={timeZoneOptionLabel(z)}>
          {timeZoneOptionLabel(z)}
        </Option>
      ))}
    </Combobox>
  )
}
