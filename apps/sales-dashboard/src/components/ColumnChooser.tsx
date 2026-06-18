import { useEffect, useRef, useState } from 'react'

/**
 * Spalten-Konfigurator einer Liste: Spalten ein-/ausblenden (hinzufügen /
 * entfernen) und per ↑/↓ verschieben. Selbstständiges Popover (Button + Panel),
 * schließt bei Klick außerhalb und mit Esc. Die Reihenfolge der sichtbaren
 * Spalten wird über `visibleKeys` nach außen gegeben und dort persistiert.
 */

interface ColumnInfo {
  key: string
  label: string
}

interface ColumnChooserProps {
  /** Alle verfügbaren Spalten der Liste (Reihenfolge = Standardreihenfolge). */
  all: ColumnInfo[]
  /** Aktuell angezeigte Spalten, in Anzeigereihenfolge. */
  visibleKeys: string[]
  onChange: (visibleKeys: string[]) => void
  onReset: () => void
}

export function ColumnChooser({ all, visibleKeys, onChange, onReset }: ColumnChooserProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const labelOf = (key: string) => all.find((c) => c.key === key)?.label ?? key
  const visible = visibleKeys.filter((k) => all.some((c) => c.key === k))
  const hidden = all.filter((c) => !visible.includes(c.key))

  const move = (index: number, dir: -1 | 1) => {
    const next = [...visible]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const remove = (key: string) => onChange(visible.filter((k) => k !== key))
  const add = (key: string) => onChange([...visible, key])

  return (
    <div className="colchooser" ref={rootRef}>
      <button
        type="button"
        className={`colchooser__button${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Spalten anpassen"
        aria-label="Spalten anpassen"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="6" height="16" rx="1" />
          <rect x="11" y="4" width="6" height="16" rx="1" />
          <path d="M21 4v16" />
        </svg>
      </button>

      {open && (
        <div className="colchooser__panel" role="dialog" aria-label="Spalten anpassen">
          <div className="colchooser__head">
            <span>Spalten</span>
            <button type="button" className="colchooser__reset" onClick={onReset}>
              Zurücksetzen
            </button>
          </div>

          <p className="colchooser__group">Angezeigt</p>
          <ul className="colchooser__list">
            {visible.map((key, i) => (
              <li className="colchooser__item" key={key}>
                <span className="colchooser__name">{labelOf(key)}</span>
                <span className="colchooser__actions">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    title="Nach oben"
                    aria-label={`${labelOf(key)} nach oben`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === visible.length - 1}
                    title="Nach unten"
                    aria-label={`${labelOf(key)} nach unten`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(key)}
                    disabled={visible.length === 1}
                    title="Entfernen"
                    aria-label={`${labelOf(key)} entfernen`}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>

          {hidden.length > 0 && (
            <>
              <p className="colchooser__group">Verfügbar</p>
              <ul className="colchooser__list">
                {hidden.map((col) => (
                  <li className="colchooser__item colchooser__item--hidden" key={col.key}>
                    <span className="colchooser__name">{col.label}</span>
                    <span className="colchooser__actions">
                      <button
                        type="button"
                        onClick={() => add(col.key)}
                        title="Hinzufügen"
                        aria-label={`${col.label} hinzufügen`}
                      >
                        +
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
