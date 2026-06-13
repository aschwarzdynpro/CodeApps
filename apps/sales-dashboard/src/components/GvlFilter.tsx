import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { UserRef } from '../types/sales'

/**
 * Suchfeld zur Auswahl der GVL (Gebietsverkaufsleiter), aus deren Sicht das
 * Dashboard gefiltert wird. Tippt der Nutzer ≥ 2 Zeichen, erscheint eine
 * Trefferliste; eine Auswahl filtert das Dashboard, das "✕" setzt auf den
 * Standard (angemeldeter Benutzer) zurück.
 *
 * Eigenständige, abhängigkeitsfreie Combobox: die Kandidatenliste (Live:
 * Territory-Manager; Demo: geseedete GVL) wird beim ersten Fokus einmal
 * geladen, der Tippfilter läuft clientseitig.
 */

/** Ab dieser Eingabelänge wird die Trefferliste angezeigt. */
const MIN_QUERY = 2

interface GvlFilterProps {
  /** Aktuell gewählte GVL oder `null` für den Standard. */
  selected: UserRef | null
  /** Name des angemeldeten Benutzers — der Standard, als Platzhalter-Hinweis. */
  defaultName: string
  /** Lädt die GVL-Kandidaten (einmalig, beim ersten Fokus). */
  loadCandidates: () => Promise<UserRef[]>
  /** Auswahl geändert: eine GVL oder `null` (zurücksetzen auf Standard). */
  onChange: (gvl: UserRef | null) => void
}

export function GvlFilter({
  selected,
  defaultName,
  loadCandidates,
  onChange,
}: GvlFilterProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const [candidates, setCandidates] = useState<UserRef[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  // Externe Änderungen der Auswahl (z. B. Reset beim Demo↔Live-Wechsel) ins
  // Eingabefeld spiegeln — als "prev value"-Muster während des Renderns statt
  // per Effect (vermeidet kaskadierende Renders).
  const [prevSelected, setPrevSelected] = useState(selected)
  if (selected !== prevSelected) {
    setPrevSelected(selected)
    setQuery(selected?.name ?? '')
  }

  const ensureCandidates = () => {
    if (loaded || loading) return
    setLoading(true)
    loadCandidates()
      .then((list) => setCandidates(list))
      .catch(() => setCandidates([]))
      .finally(() => {
        setLoaded(true)
        setLoading(false)
      })
  }

  const trimmed = query.trim()
  const showList = open && trimmed.length >= MIN_QUERY
  const matches = useMemo(() => {
    if (trimmed.length < MIN_QUERY) return []
    const q = trimmed.toLowerCase()
    return candidates.filter((c) => c.name.toLowerCase().includes(q))
  }, [candidates, trimmed])

  // Aktiven Eintrag stets in Reichweite der aktuellen Trefferliste halten
  // (abgeleitet statt per Effect) — -1, wenn es keine Treffer gibt.
  const activeOption = matches.length ? Math.min(activeIndex, matches.length - 1) : -1

  // Klick außerhalb schließt und verwirft eine angefangene Suche.
  useEffect(() => {
    if (!open) return
    const onDocPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(selected?.name ?? '')
      }
    }
    document.addEventListener('mousedown', onDocPointer)
    return () => document.removeEventListener('mousedown', onDocPointer)
  }, [open, selected])

  const choose = (gvl: UserRef) => {
    onChange(gvl)
    setQuery(gvl.name)
    setOpen(false)
    inputRef.current?.blur()
  }

  const clear = () => {
    onChange(null)
    setQuery('')
    setOpen(true)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setActiveIndex(Math.min(activeOption + 1, Math.max(matches.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(Math.max(activeOption - 1, 0))
    } else if (e.key === 'Enter') {
      if (showList && matches[activeOption]) {
        e.preventDefault()
        choose(matches[activeOption])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery(selected?.name ?? '')
    }
  }

  const showClear = selected !== null || query.length > 0

  return (
    <div className="gvl-filter" ref={rootRef}>
      <span className="gvl-filter__caption">GVL</span>
      <div className="gvl-filter__field">
      <div className={`gvl-filter__control${open ? ' is-open' : ''}`}>
        <svg
          className="gvl-filter__icon"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="gvl-filter__input"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && activeOption >= 0
              ? `${listboxId}-opt-${activeOption}`
              : undefined
          }
          placeholder={`GVL suchen … (Standard: ${defaultName})`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActiveIndex(0)
            ensureCandidates()
          }}
          onFocus={() => {
            setOpen(true)
            ensureCandidates()
          }}
          onKeyDown={onKeyDown}
        />
        {showClear && (
          <button
            type="button"
            className="gvl-filter__clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            title="Auf Standard zurücksetzen"
            aria-label="GVL-Auswahl zurücksetzen"
          >
            ✕
          </button>
        )}
      </div>

      {showList && (
        <ul className="gvl-filter__list" id={listboxId} role="listbox">
          {loading && !loaded ? (
            <li className="gvl-filter__hint" aria-disabled="true">
              Lädt …
            </li>
          ) : matches.length === 0 ? (
            <li className="gvl-filter__hint" aria-disabled="true">
              Keine Treffer
            </li>
          ) : (
            matches.map((gvl, i) => (
              <li
                key={gvl.id}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === activeOption}
                className={`gvl-filter__option${i === activeOption ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(gvl)}
              >
                {gvl.name}
              </li>
            ))
          )}
        </ul>
      )}
      </div>
    </div>
  )
}
