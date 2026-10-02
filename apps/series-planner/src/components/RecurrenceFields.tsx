import { Input, Radio, RadioGroup, ToggleButton } from '@fluentui/react-components'
import type { MonthlyRule, RecurrenceRule, Ref, SeriesEnd, Weekday } from '../types/series'
import { WEEKDAY_LONG, WEEKDAY_SHORT, isValidDate, parseDate, parseTime, weekday } from '../utils/dates'
import { WEEKDAYS } from '../utils/definition'
import { describeRule } from '../utils/recurrence'
import { LookupPicker } from './LookupPicker'
import { Select } from './ui'

/** What the form edits: one segment plus the series end. */
export interface PatternForm {
  start: string
  rule: RecurrenceRule
  startTime: string
  endTime: string
  end: SeriesEnd
  resource: Ref | null
}

type Preset = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'custom'

const PRESETS: [Preset, string][] = [
  ['weekly', 'Wöchentlich'],
  ['biweekly', 'Alle 2 Wochen'],
  ['monthly', 'Monatlich'],
  ['quarterly', 'Quartalsweise'],
  ['custom', 'Benutzerdefiniert'],
]

function presetOf(rule: RecurrenceRule): Preset {
  if (rule.kind === 'weekly') return rule.interval === 1 ? 'weekly' : rule.interval === 2 ? 'biweekly' : 'custom'
  return rule.interval === 1 ? 'monthly' : rule.interval === 3 ? 'quarterly' : 'custom'
}

/** Monthly default from the start date: same day of month. */
const monthlyFrom = (start: string): MonthlyRule => ({ mode: 'day', day: isValidDate(start) ? parseDate(start).d : 1 })

function ruleForPreset(preset: Preset, rule: RecurrenceRule, start: string): RecurrenceRule {
  const weekdays: Weekday[] = rule.kind === 'weekly' && rule.weekdays.length ? rule.weekdays : [isValidDate(start) ? weekday(start) : 1]
  const monthly = rule.kind === 'monthly' ? rule.monthly : monthlyFrom(start)
  switch (preset) {
    case 'weekly':
      return { kind: 'weekly', interval: 1, weekdays }
    case 'biweekly':
      return { kind: 'weekly', interval: 2, weekdays }
    case 'monthly':
      return { kind: 'monthly', interval: 1, monthly }
    case 'quarterly':
      return { kind: 'monthly', interval: 3, monthly }
    case 'custom':
      return rule
  }
}

const NTH_OPTIONS = [
  { value: '1', label: 'ersten' },
  { value: '2', label: 'zweiten' },
  { value: '3', label: 'dritten' },
  { value: '4', label: 'vierten' },
  { value: '-1', label: 'letzten' },
]

export function RecurrenceFields({
  value,
  onChange,
  startLabel = 'Beginn',
  lockStart = false,
}: {
  value: PatternForm
  onChange: (next: PatternForm) => void
  startLabel?: string
  /** "This and all following": the segment starts at the chosen occurrence. */
  lockStart?: boolean
}) {
  const { rule } = value
  const preset = presetOf(rule)
  const set = (patch: Partial<PatternForm>) => onChange({ ...value, ...patch })
  const setRule = (next: RecurrenceRule) => set({ rule: next })
  const duration = parseTime(value.endTime) - parseTime(value.startTime)

  return (
    <div className="pattern">
      <div className="pattern__row">
        <span className="pattern__label">Rhythmus</span>
        <div className="segmented" role="group" aria-label="Rhythmus">
          {PRESETS.map(([p, label]) => (
            <ToggleButton
              key={p}
              size="small"
              appearance={preset === p ? 'primary' : 'secondary'}
              checked={preset === p}
              onClick={() => setRule(ruleForPreset(p, rule, value.start))}
            >
              {label}
            </ToggleButton>
          ))}
        </div>
      </div>

      {preset === 'custom' ? (
        <div className="pattern__row">
          <span className="pattern__label">Alle</span>
          <div className="pattern__inline">
            <Input
              type="number"
              size="small"
              className="input--narrow"
              aria-label="Intervall"
              min={1}
              max={52}
              value={String(rule.interval)}
              onChange={(e) => setRule({ ...rule, interval: Math.max(1, Math.min(52, Math.trunc(Number(e.target.value) || 1))) })}
            />
            <Select
              small
              aria-label="Einheit"
              className="input--unit"
              value={rule.kind}
              options={[
                { value: 'weekly', label: 'Wochen' },
                { value: 'monthly', label: 'Monate' },
              ]}
              onChange={(v) =>
                setRule(
                  v === 'weekly'
                    ? { kind: 'weekly', interval: rule.interval, weekdays: [isValidDate(value.start) ? weekday(value.start) : 1] }
                    : { kind: 'monthly', interval: rule.interval, monthly: monthlyFrom(value.start) },
                )
              }
            />
          </div>
        </div>
      ) : null}

      {rule.kind === 'weekly' ? (
        <div className="pattern__row">
          <span className="pattern__label">Wochentage</span>
          <div className="segmented" role="group" aria-label="Wochentage">
            {WEEKDAYS.map((d) => {
              const on = rule.weekdays.includes(d)
              return (
                <ToggleButton
                  key={d}
                  size="small"
                  appearance={on ? 'primary' : 'secondary'}
                  checked={on}
                  title={WEEKDAY_LONG[d - 1]}
                  onClick={() => setRule({ ...rule, weekdays: on ? rule.weekdays.filter((x) => x !== d) : [...rule.weekdays, d].sort((a, b) => a - b) })}
                >
                  {WEEKDAY_SHORT[d - 1]}
                </ToggleButton>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="pattern__row">
          <span className="pattern__label">Tag</span>
          <RadioGroup
            layout="vertical"
            value={rule.monthly.mode}
            onChange={(_, d) =>
              setRule({
                ...rule,
                monthly: d.value === 'day' ? monthlyFrom(value.start) : { mode: 'weekday', nth: 1, weekday: isValidDate(value.start) ? weekday(value.start) : 1 },
              })
            }
          >
            <div className="pattern__inline">
              <Radio value="day" label="Am" />
              <Input
                type="number"
                size="small"
                className="input--narrow"
                aria-label="Tag im Monat"
                min={1}
                max={31}
                disabled={rule.monthly.mode !== 'day'}
                value={rule.monthly.mode === 'day' ? String(rule.monthly.day) : ''}
                onChange={(e) => setRule({ ...rule, monthly: { mode: 'day', day: Math.max(1, Math.min(31, Math.trunc(Number(e.target.value) || 1))) } })}
              />
              <span>. des Monats</span>
            </div>
            <div className="pattern__inline">
              <Radio value="weekday" label="Am" />
              <Select
                small
                aria-label="Welcher"
                className="input--unit"
                disabled={rule.monthly.mode !== 'weekday'}
                value={rule.monthly.mode === 'weekday' ? String(rule.monthly.nth) : '1'}
                options={NTH_OPTIONS}
                onChange={(v) => rule.monthly.mode === 'weekday' && setRule({ ...rule, monthly: { ...rule.monthly, nth: Number(v) as 1 | 2 | 3 | 4 | -1 } })}
              />
              <Select
                small
                aria-label="Wochentag"
                className="input--unit"
                disabled={rule.monthly.mode !== 'weekday'}
                value={rule.monthly.mode === 'weekday' ? String(rule.monthly.weekday) : '1'}
                options={WEEKDAYS.map((d) => ({ value: String(d), label: WEEKDAY_LONG[d - 1] }))}
                onChange={(v) => rule.monthly.mode === 'weekday' && setRule({ ...rule, monthly: { ...rule.monthly, weekday: Number(v) as Weekday } })}
              />
            </div>
          </RadioGroup>
        </div>
      )}

      <div className="pattern__row">
        <span className="pattern__label">Zeitfenster</span>
        <div className="pattern__inline">
          <Input type="time" size="small" aria-label="Von" value={value.startTime} onChange={(e) => set({ startTime: e.target.value })} />
          <span>bis</span>
          <Input type="time" size="small" aria-label="Bis" value={value.endTime} onChange={(e) => set({ endTime: e.target.value })} />
          <span className={duration > 0 ? 'muted small' : 'warn small'}>
            {duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')} Std.` : 'Ende muss nach dem Beginn liegen'}
          </span>
        </div>
      </div>

      <div className="pattern__row">
        <span className="pattern__label">{startLabel}</span>
        <div className="pattern__inline">
          <Input type="date" size="small" aria-label={startLabel} value={value.start} disabled={lockStart} onChange={(e) => set({ start: e.target.value })} />
        </div>
      </div>

      <div className="pattern__row">
        <span className="pattern__label">Ende</span>
        <RadioGroup
          layout="vertical"
          value={value.end.kind}
          onChange={(_, d) => set({ end: d.value === 'date' ? { kind: 'date', date: value.start } : { kind: 'count', count: 10 } })}
        >
          <div className="pattern__inline">
            <Radio value="date" label="Am" />
            <Input
              type="date"
              size="small"
              aria-label="Enddatum"
              disabled={value.end.kind !== 'date'}
              value={value.end.kind === 'date' ? value.end.date : ''}
              onChange={(e) => set({ end: { kind: 'date', date: e.target.value } })}
            />
          </div>
          <div className="pattern__inline">
            <Radio value="count" label="Nach" />
            <Input
              type="number"
              size="small"
              className="input--narrow"
              aria-label="Anzahl Termine"
              min={1}
              max={260}
              disabled={value.end.kind !== 'count'}
              value={value.end.kind === 'count' ? String(value.end.count) : ''}
              onChange={(e) => set({ end: { kind: 'count', count: Math.max(1, Math.min(260, Math.trunc(Number(e.target.value) || 1))) } })}
            />
            <span>Terminen</span>
          </div>
        </RadioGroup>
      </div>

      <div className="pattern__row">
        <span className="pattern__label">Ressource</span>
        <div className="pattern__wide">
          <LookupPicker kind="resource" aria-label="Ressource" value={value.resource} onChange={(r) => set({ resource: r })} placeholder="Ressource suchen …" />
        </div>
      </div>

      <p className="pattern__summary">{describeRule(rule)}</p>
    </div>
  )
}
