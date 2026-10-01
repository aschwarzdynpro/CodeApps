import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { PrincipalRef } from '../types/board'
import type { BoardService } from '../services/boardService'
import { useLoad } from '../hooks/useLoad'
import { SEARCH_LIMIT, searchWords } from '../utils/principalSearch'
import { Input } from '@fluentui/react-components'

interface Props {
  /** Lower-cased ids not to offer (already shared, current owner). */
  exclude: Set<string>
  /** Only principals that can own records — hides access teams. */
  owners?: boolean
  /** Extra controls next to the search box (e.g. the share level). */
  toolbar?: ReactNode
  autoFocus?: boolean
  /** The button(s) shown on each hit. */
  action: (p: PrincipalRef) => ReactNode
}

/**
 * Live user/team search: queries 250 ms after the last keystroke, from two
 * characters; several words narrow the result ("jör bus").
 */
export function PrincipalPicker({ exclude, owners = false, toolbar, autoFocus, action }: Props) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250)
    return () => clearTimeout(t)
  }, [term])
  const searchKey = searchWords(debounced).length > 0 ? `${owners ? 'owner' : 'any'}:${debounced}` : null
  const loadResults = useCallback((svc: BoardService) => svc.searchPrincipals(debounced, { owners }), [debounced, owners])
  const { data: results, error, loading: searching } = useLoad(searchKey, loadResults)

  const visible = searchKey ? (results ?? []).filter((r) => !exclude.has(r.id.toLowerCase())) : []
  const userHits = (results ?? []).filter((r) => r.type === 'user').length
  const typing = term.trim() !== debounced

  return (
    <div className="principal-picker">
      <div className="toolbar">
        <Input
          className="input"
          placeholder="Benutzer oder Team suchen – z. B. „jör bus“ …"
          value={term}
          autoComplete="off"
          autoFocus={autoFocus}
          aria-label="Benutzer oder Team suchen"
          onChange={(e) => setTerm(e.target.value)}
        />
        {toolbar}
        {searchKey && (searching || typing) ? <span className="muted small">sucht …</span> : null}
      </div>
      {term.trim() !== '' && searchWords(term).length === 0 ? <p className="muted small">Mindestens 2 Zeichen eingeben.</p> : null}
      {error ? <div className="notice notice--error">Suche fehlgeschlagen: {error}</div> : null}
      {searchKey && results && !searching && !typing && visible.length === 0 ? <p className="muted">Keine (weiteren) Treffer.</p> : null}
      {userHits >= SEARCH_LIMIT ? (
        <p className="muted small">Mehr als {SEARCH_LIMIT} Benutzer gefunden – weiter eintippen, z. B. den Nachnamen („jör bus“).</p>
      ) : null}
      {visible.length > 0 ? (
        <ul className="share-list">
          {visible.map((p) => (
            <li key={p.id} className="share-row">
              <PrincipalLabel p={p} />
              {action(p)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function PrincipalLabel({ p }: { p: PrincipalRef }) {
  return (
    <span className="share-row__who">
      <span className={`avatar avatar--${p.type}`} aria-hidden>
        {p.type === 'team' ? '◆' : p.name.slice(0, 1).toUpperCase()}
      </span>
      <span>
        <span className="share-row__name">{p.name}</span>
        {p.detail ? <span className="share-row__detail">{p.detail}</span> : null}
      </span>
    </span>
  )
}
