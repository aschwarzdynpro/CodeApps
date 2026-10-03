import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

interface SplitterProps {
  /** The pane it sizes sits to its left (explorer) or to its right (details). */
  side: 'left' | 'right'
  value: number
  min: number
  max: number
  label: string
  className?: string
  /** While dragging: the width to show (cheap, no React state). */
  onPreview: (px: number) => void
  /** Drag ended or a key was pressed: the width to keep. */
  onCommit: (px: number) => void
  onReset: () => void
}

/**
 * Drag handle between two panes. Pointer drag previews the width and commits
 * it on release; arrow keys (Shift: bigger steps) commit right away, Enter or
 * a double click restores the default.
 */
export function Splitter({ side, value, min, max, label, className, onPreview, onCommit, onReset }: SplitterProps) {
  const drag = useRef<{ x: number; value: number; last: number } | null>(null)
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)))
  const sign = side === 'left' ? 1 : -1

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, value, last: value }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    d.last = clamp(d.value + sign * (e.clientX - d.x))
    onPreview(d.last)
  }
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (d.last !== d.value) onCommit(d.last)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      onCommit(clamp(value + (e.key === 'ArrowRight' ? step : -step) * sign))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onReset()
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={label}
      className={`split ${className ?? ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  )
}
