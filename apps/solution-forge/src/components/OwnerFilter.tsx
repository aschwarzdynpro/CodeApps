import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Distinct owner display names to choose from. */
  owners: string[]
  /** Selected owner, or '' for "all owners". */
  value: string
  onChange: (owner: string) => void
}

/**
 * Modern owner filter: a compact dropdown (matching the app's custom selects)
 * over the distinct working solution owners. '' means "all owners". Renders
 * nothing when no owner information is available. Closes on outside click or
 * Escape; offers an inline filter once the owner list gets long.
 */
export function OwnerFilter({ owners, value, onChange }: Props) {
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

  if (owners.length === 0) return null

  const q = query.trim().toLowerCase()
  const filtered = q
    ? owners.filter((o) => o.toLowerCase().includes(q))
    : owners

  const pick = (owner: string) => {
    onChange(owner)
    setOpen(false)
  }

  return (
    <div className="owner-select" ref={rootRef}>
      <button
        className={`owner-select-trigger ${value ? 'owner-select-trigger--active' : ''} ${
          open ? 'owner-select-trigger--open' : ''
        }`}
        onClick={() => {
          setOpen((v) => !v)
          setQuery('')
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter by owner"
      >
        <span className="owner-select-icon" aria-hidden="true">
          👤
        </span>
        <span className="owner-select-label">{value || 'All owners'}</span>
        <span className="owner-select-caret">▾</span>
      </button>

      {open && (
        <div className="sselect-panel owner-select-panel" role="listbox">
          {owners.length > 7 && (
            <input
              className="sselect-search"
              autoFocus
              type="search"
              placeholder="Filter owners…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <ul className="sselect-options">
            <li>
              <button
                className={`sselect-option ${value === '' ? 'sselect-option--active' : ''}`}
                onClick={() => pick('')}
              >
                All owners
              </button>
            </li>
            {filtered.length === 0 && (
              <li className="sselect-empty">No owner matches “{query}”.</li>
            )}
            {filtered.map((o) => (
              <li key={o}>
                <button
                  className={`sselect-option ${value === o ? 'sselect-option--active' : ''}`}
                  onClick={() => pick(o)}
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
