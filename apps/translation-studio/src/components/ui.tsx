import { useRef, useState, type ReactNode } from 'react'
import {
  Button,
  Combobox,
  Dropdown,
  Option,
  OptionGroup,
  makeStyles,
  mergeClasses,
  tokens,
  type ButtonProps,
} from '@fluentui/react-components'
import { ArrowUploadRegular } from '@fluentui/react-icons'
import { S } from '../strings'

/**
 * Thin layer over Fluent UI v9 — the library Power Apps' modern controls
 * are built on. Components use these instead of Fluent directly where the
 * app has its own conventions (button kinds, value/label option lists with
 * an empty "not set" entry).
 */

const useStyles = makeStyles({
  danger: {
    color: tokens.colorPaletteRedForeground1,
    ':hover': {
      color: tokens.colorPaletteRedForeground1,
      backgroundColor: tokens.colorPaletteRedBackground1,
      border: `${tokens.strokeWidthThin} solid ${tokens.colorPaletteRedBorder2}`,
    },
    ':hover:active': {
      color: tokens.colorPaletteRedForeground1,
      backgroundColor: tokens.colorPaletteRedBackground2,
    },
  },
  dropdown: {
    minWidth: 'unset',
    width: '100%',
  },
  listbox: {
    maxHeight: '360px',
  },
  suggestList: {
    minWidth: '300px',
  },
  // Same height as Input/Dropdown; the Combobox otherwise shrinks to its text.
  combobox: {
    minHeight: '32px',
    alignItems: 'center',
  },
})

export type ButtonKind = 'default' | 'primary' | 'danger' | 'ghost'

export type BtnProps = Omit<ButtonProps, 'appearance' | 'size'> & {
  kind?: ButtonKind
  small?: boolean
}

/** App buttons: default, primary, danger (destructive) and ghost (subtle). */
export function Btn({ kind = 'default', small, className, ...rest }: BtnProps) {
  const styles = useStyles()
  const appearance = kind === 'primary' ? 'primary' : kind === 'ghost' ? 'subtle' : 'secondary'
  return (
    <Button
      {...(rest as ButtonProps)}
      appearance={appearance}
      size={small ? 'small' : 'medium'}
      className={mergeClasses(kind === 'danger' && styles.danger, className)}
    />
  )
}

export interface SelectOption {
  value: string
  label: string
  /** Rendered as an option group heading. */
  group?: string
  disabled?: boolean
}

interface SelectProps {
  id?: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  small?: boolean
  'aria-label'?: string
}

// Fluent can't tell an option with value '' from "nothing selected".
const EMPTY = '␀'
const enc = (v: string) => (v === '' ? EMPTY : v)
const dec = (v: string) => (v === EMPTY ? '' : v)

/** Dropdown over a value/label list; '' is a normal value ("nicht gesetzt"). */
export function Select({ id, value, options, onChange, placeholder, disabled, className, small, ...aria }: SelectProps) {
  const styles = useStyles()
  const selected = options.find((o) => o.value === value)
  const groups: { name: string | undefined; items: SelectOption[] }[] = []
  for (const o of options) {
    const last = groups[groups.length - 1]
    if (last && last.name === o.group) last.items.push(o)
    else groups.push({ name: o.group, items: [o] })
  }
  const render = (o: SelectOption) => (
    <Option key={enc(o.value)} value={enc(o.value)} text={o.label} disabled={o.disabled}>
      {o.label}
    </Option>
  )
  return (
    <Dropdown
      id={id}
      aria-label={aria['aria-label']}
      className={mergeClasses(styles.dropdown, className)}
      listbox={{ className: styles.listbox }}
      value={selected?.label ?? ''}
      // Own child for the shown value: long names end in "…" on one line instead of growing the field.
      button={{ children: <span className="select__value">{selected?.label || placeholder || ''}</span>, title: selected?.label }}
      selectedOptions={selected ? [enc(selected.value)] : []}
      placeholder={placeholder}
      disabled={disabled}
      size={small ? 'small' : 'medium'}
      onOptionSelect={(_, d) => {
        if (d.optionValue !== undefined && dec(d.optionValue) !== value) onChange(dec(d.optionValue))
      }}
    >
      {groups.map((g, i) =>
        g.name ? (
          <OptionGroup key={`${g.name}-${i}`} label={g.name}>
            {g.items.map(render)}
          </OptionGroup>
        ) : (
          g.items.map(render)
        ),
      )}
    </Dropdown>
  )
}

export interface Suggestion {
  value: string
  /** Shown next to the value, e.g. the display name of a table. */
  detail?: string
}

/**
 * Free text with suggestions (replaces `<datalist>`): typing filters by value
 * and detail, picking a suggestion fills in its value.
 */
export function SuggestInput({
  value,
  suggestions,
  onChange,
  placeholder,
  className,
  limit = 50,
  'aria-label': ariaLabel,
}: {
  value: string
  suggestions: Suggestion[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  limit?: number
  'aria-label'?: string
}) {
  const styles = useStyles()
  const q = value.trim().toLowerCase()
  const exact = suggestions.some((x) => x.value.toLowerCase() === q)
  // An exact match shows the whole list again, so the user can switch.
  const hits = (q && !exact ? suggestions.filter((x) => x.value.toLowerCase().includes(q) || x.detail?.toLowerCase().includes(q)) : suggestions).slice(0, limit)
  return (
    <Combobox
      freeform
      aria-label={ariaLabel}
      className={mergeClasses(styles.dropdown, styles.combobox, className)}
      listbox={{ className: mergeClasses(styles.listbox, styles.suggestList) }}
      value={value}
      selectedOptions={exact ? [suggestions.find((x) => x.value.toLowerCase() === q)!.value] : []}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onOptionSelect={(_, d) => {
        if (d.optionValue !== undefined) onChange(d.optionValue)
      }}
    >
      {hits.map((x) => (
        <Option key={x.value} value={x.value} text={x.value}>
          <span className="suggest__value">{x.value}</span>
          {x.detail ? <span className="suggest__detail">{x.detail}</span> : null}
        </Option>
      ))}
    </Combobox>
  )
}

/** Drop zone + button instead of the browser's file input. */
export function FilePicker({
  accept,
  fileName,
  hint,
  onFile,
}: {
  accept?: string
  fileName: string | null
  hint: ReactNode
  onFile: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      className={`filedrop${over ? ' filedrop--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
    >
      <ArrowUploadRegular className="filedrop__icon" aria-hidden />
      <div className="filedrop__text">
        <strong>{fileName ?? S.file.drop}</strong>
        <span className="muted small">{hint}</span>
      </div>
      <Btn onClick={() => input.current?.click()}>{fileName ? S.file.other : S.file.choose}</Btn>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        aria-label={S.file.choose}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
