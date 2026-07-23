import { useEffect, useRef, useState } from 'react'

export interface SearchSelectOption {
  id: string
  label: string
  /** Secondary line (e.g. the logical name) — rendered as <code>. */
  sub?: string
  /** Trailing muted hint (e.g. "default"). */
  hint?: string
}

interface Props {
  options: SearchSelectOption[]
  /** Selected option id, or '' for none. */
  value: string
  onChange: (id: string) => void
  placeholder?: string
  /** While the option list loads — disables the trigger. */
  loading?: boolean
  disabled?: boolean
}

/**
 * Generic sibling of {@link SolutionSelect} (same `.sselect*` look): a trigger
 * button opening a filterable panel of `{label, sub}` rows. Used by the
 * Transfer Hub for the table and saved-view pickers, where the options are
 * plain refs rather than working solutions. Closes on outside click / Escape.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  loading = false,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selected = options.find((o) => o.id === value) ?? null
  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          (o.sub ?? '').toLowerCase().includes(q),
      )
    : options

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div className="sselect" ref={rootRef}>
      <button
        className={`sselect-trigger ${open ? 'sselect-trigger--open' : ''}`}
        disabled={disabled || loading}
        onClick={() => {
          setOpen((v) => !v)
          setQuery('')
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {loading ? (
          <span className="sselect-placeholder">Loading…</span>
        ) : selected ? (
          <span className="sselect-value">
            <span className="sselect-title">{selected.label}</span>
            {selected.sub && <code>{selected.sub}</code>}
          </span>
        ) : (
          <span className="sselect-placeholder">{placeholder}</span>
        )}
        <span className="sselect-caret">▾</span>
      </button>

      {open && (
        <div className="sselect-panel" role="listbox">
          {options.length > 5 && (
            <input
              className="sselect-search"
              autoFocus
              type="search"
              placeholder="Filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <ul className="sselect-options">
            {filtered.length === 0 && (
              <li className="sselect-empty">
                {options.length === 0 ? 'No options.' : `No match for “${query}”.`}
              </li>
            )}
            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  className={`sselect-option ${o.id === value ? 'sselect-option--active' : ''}`}
                  onClick={() => pick(o.id)}
                >
                  <span className="sselect-title">{o.label}</span>
                  {o.sub && <code>{o.sub}</code>}
                  {o.hint && <span className="muted">{o.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
