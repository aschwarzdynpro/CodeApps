import { useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { TileDef } from '../dashboard/types'
import { GridCell } from './DataGrid'
import { TileIcon } from './TileIcon'

/**
 * Schlankes Detail-Modal für einen Datensatz — zeigt die Felder der Kachel
 * (dieselben Spalten wie das Grid) als Formular. Kein eingebettetes
 * Model-Driven-Formular (das ließe sich aus der Code App heraus nicht
 * zuverlässig per iframe einbetten — CSP/Drittanbieter-Cookies); stattdessen
 * eine native, sofort verfügbare Ansicht plus Link ins echte Sales-Hub-Formular.
 */

interface RecordModalProps<T> {
  def: TileDef<T>
  row: T
  /** Deep-Link ins Sales-Hub-Formular (nur bei Live-Daten); öffnet neuen Tab. */
  recordHref?: string
  /** Bezugszeitpunkt für „überfällig"-Markierungen. */
  now: Date
  onClose: () => void
}

export function RecordModal<T>({ def, row, recordHref, now, onClose }: RecordModalProps<T>) {
  const closeRef = useRef<HTMLButtonElement>(null)

  // Esc schließt; Hintergrund-Scroll sperren, solange das Modal offen ist.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  // Erster Spaltenwert als Datensatz-Bezeichner in der Kopfzeile.
  const lead = String(def.columns[0]?.value(row) ?? '').trim()

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ '--tile-accent': def.accent } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={`${def.title}: ${lead || 'Details'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <span className="modal__icon">
            <TileIcon name={def.icon} />
          </span>
          <div className="modal__titles">
            <span className="modal__eyebrow">{def.title}</span>
            <h2 className="modal__title">{lead || def.title}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Schließen"
            title="Schließen"
          >
            ✕
          </button>
        </header>

        <dl className="modal__fields">
          {def.columns.map((col) => (
            <div className="modal__field" key={col.key}>
              <dt className="modal__field-label">{col.label}</dt>
              <dd className="modal__field-value">
                <GridCell column={col} row={row} now={now} />
              </dd>
            </div>
          ))}
        </dl>

        {recordHref && (
          <footer className="modal__foot">
            <a
              className="modal__open"
              href={recordHref}
              target="_blank"
              rel="noreferrer noopener"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
                <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
              </svg>
              Im Sales Hub öffnen
            </a>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
