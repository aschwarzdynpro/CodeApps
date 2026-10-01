import { useId, type ReactNode } from 'react'
import { useRefData } from '../hooks/refData'
import { sameId } from '../utils/format'
import { Select, type SelectOption } from './ui'
import { Input, Textarea } from '@fluentui/react-components'

/**
 * Form controls. Every control distinguishes "not set" (null — the board
 * inherits from the Default board / product default) from an explicit value,
 * and shows the inherited value as a hint where one is known.
 */

interface FieldProps {
  label: string
  hint?: ReactNode
  changed?: boolean
  children: (id: string) => ReactNode
}

export function Field({ label, hint, changed, children }: FieldProps) {
  const id = useId()
  return (
    <div className={`field${changed ? ' field--changed' : ''}`}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="field__control">{children(id)}</div>
      {hint ? <div className="field__hint">{hint}</div> : null}
    </div>
  )
}

const HEX = /^[0-9a-f]{6}$/i

/** Colors are stored as 6-digit hex without '#'. */
export function ColorInput({
  id,
  value,
  onChange,
}: {
  id: string
  value: string | null
  onChange: (v: string | null) => void
}) {
  const normalized = value?.replace(/^#/, '') ?? ''
  const valid = HEX.test(normalized)
  const hadHash = value?.startsWith('#') ?? false
  return (
    <div className="color-input">
      <input
        type="color"
        aria-label="Farbe wählen"
        value={valid ? `#${normalized}` : '#ffffff'}
        onChange={(e) => onChange((hadHash ? '#' : '') + e.target.value.slice(1).toUpperCase())}
      />
      <Input
        id={id}
        className={`input input--mono${normalized && !valid ? ' input--invalid' : ''}`}
        value={value ?? ''}
        placeholder="nicht gesetzt"
        maxLength={7}
        onChange={(e) => onChange(e.target.value.trim() === '' ? null : e.target.value.trim())}
      />
    </div>
  )
}

export function IntInput({
  id,
  value,
  onChange,
  min,
  max,
}: {
  id: string
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  max?: number
}) {
  return (
    <Input
      id={id}
      className="input input--narrow"
      type="number"
      value={value === null ? '' : String(value)}
      min={min}
      max={max}
      placeholder="—"
      onChange={(e) => onChange(e.target.value === '' ? null : Math.trunc(Number(e.target.value)))}
    />
  )
}

export function TextInput({
  id,
  value,
  onChange,
  multiline,
  mono,
}: {
  id: string
  value: string | null
  onChange: (v: string | null) => void
  multiline?: boolean
  mono?: boolean
}) {
  const cls = `input${mono ? ' input--mono' : ''}`
  return multiline ? (
    <Textarea
      id={id}
      className={`${cls} input--area`}
      value={value ?? ''}
      rows={4}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    />
  ) : (
    <Input
      id={id}
      className={cls}
      value={value ?? ''}
      placeholder="nicht gesetzt"
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    />
  )
}

/** Tri-state for nullable booleans: not set / yes / no. */
export function BoolSelect({
  id,
  value,
  onChange,
  nullable = true,
}: {
  id: string
  value: boolean | null
  onChange: (v: boolean | null) => void
  nullable?: boolean
}) {
  const options: SelectOption[] = [
    ...(nullable || value === null ? [{ value: '', label: 'nicht gesetzt' }] : []),
    { value: '1', label: 'Ja' },
    { value: '0', label: 'Nein' },
  ]
  return (
    <Select
      id={id}
      className="input input--narrow"
      value={value === null ? '' : value ? '1' : '0'}
      options={options}
      onChange={(v) => onChange(v === '' ? null : v === '1')}
    />
  )
}

/**
 * View picker filtered to one table. A stored ID that is not in the list
 * (deleted view, other user's personal view, or another table) is kept as an
 * explicit "unknown" option — never silently replaced.
 */
export function ViewSelect({
  id,
  entity,
  value,
  onChange,
}: {
  id: string
  entity?: string
  value: string | null
  onChange: (v: string | null) => void
}) {
  const { views } = useRefData()
  const list = views.filter((v) => !entity || v.entity === entity)
  const known = value ? views.find((v) => sameId(v.id, value)) : undefined
  const options: SelectOption[] = [
    { value: '', label: 'nicht gesetzt' },
    ...(value && !known ? [{ value, label: `Unbekannte Ansicht (${value.slice(0, 8)}…)` }] : []),
    ...(known && !list.includes(known) ? [{ value: known.id, label: `${known.name} (${known.entity})` }] : []),
    ...list.map((v) => ({
      value: v.id,
      label: `${v.name}${v.kind === 'personal' ? ' (persönlich)' : ''}`,
      group: v.kind === 'personal' ? 'Persönliche Ansichten' : 'Systemansichten',
    })),
  ]
  return <Select id={id} className="input" value={known?.id ?? value ?? ''} options={options} onChange={(v) => onChange(v === '' ? null : v)} />
}

export function ConfigSelect({
  id,
  type,
  value,
  onChange,
}: {
  id: string
  type: number
  value: string | null
  onChange: (v: string | null) => void
}) {
  const { configs } = useRefData()
  const list = configs.filter((c) => c.type === type)
  const known = value ? configs.find((c) => sameId(c.id, value)) : undefined
  const options: SelectOption[] = [
    { value: '', label: 'nicht gesetzt (Standard)' },
    ...(value && !known ? [{ value, label: `Unbekannte Konfiguration (${value.slice(0, 8)}…)` }] : []),
    ...(known && !list.includes(known) ? [{ value: known.id, label: known.name }] : []),
    ...list.map((c) => ({ value: c.id, label: c.name })),
  ]
  return <Select id={id} className="input" value={known?.id ?? value ?? ''} options={options} onChange={(v) => onChange(v === '' ? null : v)} />
}

export function TimeZoneSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: string | null
  onChange: (v: string | null) => void
}) {
  const { timeZones } = useRefData()
  const known = value ? timeZones.find((t) => sameId(t.id, value)) : undefined
  const options: SelectOption[] = [
    { value: '', label: 'nicht gesetzt' },
    ...(value && !known ? [{ value, label: `Unbekannte Zeitzone (${value.slice(0, 8)}…)` }] : []),
    ...timeZones.map((t) => ({ value: t.id, label: t.name })),
  ]
  return <Select id={id} className="input" value={known?.id ?? value ?? ''} options={options} onChange={(v) => onChange(v === '' ? null : v)} />
}
