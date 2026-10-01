import { useId, type ReactNode } from 'react'
import { useRefData } from '../hooks/refData'
import { sameId } from '../utils/format'

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
      <input
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
    <input
      id={id}
      className="input input--narrow"
      type="number"
      value={value ?? ''}
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
    <textarea
      id={id}
      className={`${cls} input--area`}
      value={value ?? ''}
      rows={4}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    />
  ) : (
    <input
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
  return (
    <select
      id={id}
      className="input input--narrow"
      value={value === null ? '' : value ? '1' : '0'}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === '1')}
    >
      {nullable || value === null ? <option value="">nicht gesetzt</option> : null}
      <option value="1">Ja</option>
      <option value="0">Nein</option>
    </select>
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
  const options = views.filter((v) => !entity || v.entity === entity)
  const known = value ? views.find((v) => sameId(v.id, value)) : undefined
  return (
    <select
      id={id}
      className="input"
      value={known?.id ?? value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    >
      <option value="">nicht gesetzt</option>
      {value && !known ? <option value={value}>Unbekannte Ansicht ({value.slice(0, 8)}…)</option> : null}
      {known && !options.includes(known) ? (
        <option value={known.id}>
          {known.name} ({known.entity})
        </option>
      ) : null}
      {options.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
          {v.kind === 'personal' ? ' (persönlich)' : ''}
        </option>
      ))}
    </select>
  )
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
  const options = configs.filter((c) => c.type === type)
  const known = value ? configs.find((c) => sameId(c.id, value)) : undefined
  return (
    <select
      id={id}
      className="input"
      value={known?.id ?? value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    >
      <option value="">nicht gesetzt (Standard)</option>
      {value && !known ? <option value={value}>Unbekannte Konfiguration ({value.slice(0, 8)}…)</option> : null}
      {known && !options.includes(known) ? <option value={known.id}>{known.name}</option> : null}
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
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
  return (
    <select
      id={id}
      className="input"
      value={known?.id ?? value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    >
      <option value="">nicht gesetzt</option>
      {value && !known ? <option value={value}>Unbekannte Zeitzone ({value.slice(0, 8)}…)</option> : null}
      {timeZones.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
