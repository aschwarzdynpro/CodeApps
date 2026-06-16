import { useEffect, useRef, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import { KindBadge } from './KindBadge'

interface Props {
  /** Selectable solutions (already owner-scoped by the caller). */
  options: WorkingSolution[]
  /** Currently selected solution ids. */
  selected: Set<string>
  /** Toggle one solution in/out of the selection. */
  onToggle: (id: string) => void
  placeholder?: string
}

/**
 * Multi-select dropdown over working solutions: a trigger summarising the
 * count, opening a panel with an inline text filter and checkbox option rows.
 * Each row shows the kind badge, title, owner and Azure DevOps id (instead of
 * the unique name). Unlike {@link SolutionSelect} the panel stays open while
 * ticking, so several solutions can be added in one go.
 */
export function MultiSolutionSelect({
  options,
  selected,
  onToggle,
  placeholder = 'Select working solutions…',
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

  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.uniqueName.toLowerCase().includes(q) ||
          (o.devOpsId ?? '').toLowerCase().includes(q),
      )
    : options

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
        {selected.size > 0 ? (
          <span className="sselect-value">
            <span className="sselect-title">
              {selected.size} working solution{selected.size === 1 ? '' : 's'}{' '}
              selected
            </span>
          </span>
        ) : (
          <span className="sselect-placeholder">{placeholder}</span>
        )}
        <span className="sselect-caret">▾</span>
      </button>

      {open && (
        <div className="sselect-panel" role="listbox" aria-multiselectable="true">
          {options.length > 5 && (
            <input
              className="sselect-search"
              autoFocus
              type="search"
              placeholder="Filter by name or ADO id…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <ul className="sselect-options">
            {filtered.length === 0 && (
              <li className="sselect-empty">
                {options.length === 0
                  ? 'No working solutions for this owner.'
                  : `No match for “${query}”.`}
              </li>
            )}
            {filtered.map((o) => {
              const checked = selected.has(o.id)
              return (
                <li key={o.recordId ?? o.id}>
                  <label
                    className={`sselect-option msselect-option ${
                      checked ? 'sselect-option--active' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(o.id)}
                    />
                    <KindBadge kind={o.kind} />
                    <span className="sselect-title">{o.title}</span>
                    {o.owner && (
                      <span className="msselect-owner muted">{o.owner}</span>
                    )}
                    {o.devOpsId && <code>#{o.devOpsId}</code>}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
