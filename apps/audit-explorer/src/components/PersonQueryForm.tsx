import { useCallback, useEffect, useState } from 'react'
import type { UserRef } from '../types/audit'
import { auditService } from '../services/auditService'
import { QUERY_RANGES } from '../utils/format'

interface PersonQueryFormProps {
  onSubmit: (user: UserRef, sinceDays: number) => void
  /** Pre-selects a person when arriving from another mode. */
  preset?: UserRef | null
}

/** Person mode's input: a type-ahead over users plus a time window. */
export function PersonQueryForm({ onSubmit, preset }: PersonQueryFormProps) {
  const [term, setTerm] = useState('')
  const [matches, setMatches] = useState<UserRef[]>([])
  const [selected, setSelected] = useState<UserRef | null>(preset ?? null)
  const [sinceDays, setSinceDays] = useState<number>(30)
  const [searching, setSearching] = useState(false)

  const lookup = useCallback(async () => {
    const needle = term.trim()
    if (selected || needle.length < 2) {
      setMatches([])
      return
    }
    setSearching(true)
    try {
      setMatches(await auditService.findUsers(needle))
    } finally {
      setSearching(false)
    }
  }, [term, selected])

  useEffect(() => {
    // Debounced so a fast typist doesn't fire a query per keystroke.
    const timer = setTimeout(() => {
      void lookup()
    }, 250)
    return () => clearTimeout(timer)
  }, [lookup])

  const pick = (user: UserRef) => {
    setSelected(user)
    setTerm(user.name)
    setMatches([])
  }

  return (
    <form
      className="query-bar"
      onSubmit={(e) => {
        e.preventDefault()
        if (selected) onSubmit(selected, sinceDays)
      }}
    >
      <label className="query-field">
        <span className="query-label">Person</span>
        <input
          className="query-input"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            setSelected(null)
          }}
          placeholder="Start typing a name…"
          spellCheck={false}
        />
        {matches.length > 0 && (
          <ul className="typeahead">
            {matches.map((user) => (
              <li key={user.id}>
                <button type="button" onClick={() => pick(user)}>
                  <span className="avatar avatar--sm">{user.initials}</span>
                  {user.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </label>

      <div className="query-field">
        <span className="query-label">Window</span>
        <div className="chips">
          {QUERY_RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              className={`chip ${sinceDays === r.days ? 'chip--active' : ''}`}
              onClick={() => setSinceDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <button className="query-submit" type="submit" disabled={!selected}>
        Search
      </button>
      {searching && <span className="query-note">Searching users…</span>}
      {!selected && term.trim().length >= 2 && !searching && matches.length === 0 && (
        <span className="query-hint">No matching user.</span>
      )}
    </form>
  )
}
