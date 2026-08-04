/**
 * A small ⓘ button that reveals explanatory text on demand.
 *
 * For the "read this once, then never again" copy that otherwise sits in a
 * permanent banner and costs vertical space on every visit. Deliberately a
 * click-popover rather than a `title` tooltip: the content is rich (several
 * sentences with emphasis), and a native tooltip neither wraps well nor stays
 * open long enough to read.
 *
 * Dismiss follows the same rules as {@link file://./SolutionSelect}: outside
 * pointer-down or Escape.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  /** Accessible name, e.g. "About the Role Comparer". */
  label: string
  children: ReactNode
}

export function InfoTip({ label, children }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span className="infotip" ref={rootRef}>
      <button
        type="button"
        className={`infotip-btn ${open ? 'infotip-btn--on' : ''}`}
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        ⓘ
      </button>
      {open && (
        <span className="infotip-pop" role="note">
          {children}
        </span>
      )}
    </span>
  )
}
