import { useEffect, useRef, useState } from 'react'
import type { WorkingSolution } from '../types/solution'

interface Props {
  options: WorkingSolution[]
  /** Selected solution id, or '' for none. */
  value: string
  onChange: (id: string) => void
  placeholder?: string
}

/**
 * Modern replacement for a native <select> over solutions: a trigger button
 * opening a panel with an inline filter and rich option rows (title +
 * unique name + version). Closes on outside click or Escape.
 */
export function SolutionSelect({
  options,
  value,
  onChange,
  placeholder = 'Select target…',
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
          o.title.toLowerCase().includes(q) ||
          o.uniqueName.toLowerCase().includes(q),
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
        onClick={() => {
          setOpen((v) => !v)
          setQuery('')
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className="sselect-value">
            <span className="sselect-title">{selected.title}</span>
            <code>{selected.uniqueName}</code>
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
            {selected && (
              <li>
                <button
                  className="sselect-option sselect-option--clear"
                  onClick={() => pick('')}
                >
                  Clear selection
                </button>
              </li>
            )}
            {filtered.length === 0 && (
              <li className="sselect-empty">No match for “{query}”.</li>
            )}
            {filtered.map((o) => (
              <li key={o.recordId ?? o.id}>
                <button
                  className={`sselect-option ${
                    o.id === value ? 'sselect-option--active' : ''
                  }`}
                  onClick={() => pick(o.id)}
                >
                  <span className="sselect-title">{o.title}</span>
                  <code>{o.uniqueName}</code>
                  {o.version && <span className="muted">v{o.version}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
