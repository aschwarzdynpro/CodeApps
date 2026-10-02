import {
  Button,
  Dropdown,
  Option,
  OptionGroup,
  makeStyles,
  mergeClasses,
  tokens,
  type ButtonProps,
} from '@fluentui/react-components'

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
