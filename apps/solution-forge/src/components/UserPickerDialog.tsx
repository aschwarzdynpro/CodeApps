import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { UserRef } from '../types/solution'

interface Props {
  title: string
  /** Optional context line under the title (e.g. target environment). */
  hint?: ReactNode
  /** Cross-env user search — the parent binds this to the chosen environment. */
  search: (query: string) => Promise<UserRef[]>
  onPick: (user: UserRef) => void
  onClose: () => void
}

/**
 * Modal user picker for choosing a new flow owner. Debounced search over the
 * target environment's enabled users (an empty query lists the first users);
 * reuses the `.link-result-list` search-result styling.
 */
export function UserPickerDialog({
  title,
  hint,
  search,
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  // Latest search fn without making it an effect dependency (its identity can
  // change each parent render, but the target env is fixed while open).
  const searchRef = useRef(search)
  useEffect(() => {
    searchRef.current = search
  })

  // Initial list on mount (empty query → first users). No synchronous setState
  // in the effect body — state is only set in the async callbacks.
  useEffect(() => {
    let cancelled = false
    searchRef
      .current('')
      .then((r) => {
        if (!cancelled) setResults(r)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced keystroke search (runs in the change handler, not an effect).
  const runSearch = (v: string) => {
    setQuery(v)
    setLoading(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      searchRef
        .current(v)
        .then((r) => {
          setResults(r)
          setError(null)
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : String(err)),
        )
        .finally(() => setLoading(false))
    }, 300)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {hint && <p className="muted track-panel-hint">{hint}</p>}
        <input
          className="search merge-source-search"
          type="search"
          placeholder="Search a user by name or email…"
          value={query}
          onChange={(e) => runSearch(e.target.value)}
        />
        {loading && <div className="state">Searching…</div>}
        {!loading && error && <div className="state state--error">{error}</div>}
        {!loading && !error && results.length === 0 && (
          <div className="state">No users found.</div>
        )}
        <ul className="link-result-list">
          {results.map((u) => (
            <li key={u.id}>
              <button className="link-result" onClick={() => onPick(u)}>
                <span className="link-result-title">{u.name}</span>
                {u.username && <code>{u.username}</code>}
                <span className="link-result-action">Select</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
