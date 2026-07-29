import { useLayoutEffect, useRef, useState } from 'react'
import {
  signatureAt,
  suggest,
  type SuggestContext,
  type Suggestion,
} from '../utils/odataSuggest'

/**
 * Textarea with metadata-driven completion.
 *
 * All the thinking lives in `utils/odataSuggest` (pure, unit-tested); this
 * component only tracks the caret, renders the popup and applies the
 * replacement range a suggestion carries. That split is what lets the same
 * engine serve the raw query line and, later, any single-purpose field.
 *
 * No Monaco/CodeMirror on purpose — the Code Apps player only serves files
 * referenced from `index.html` (gotcha #10), and an editor library would add
 * megabytes plus web workers to a bundle we deliberately keep small.
 */
interface Props {
  value: string
  onChange: (value: string) => void
  /** Enter with the popup closed — used to run/apply the query. */
  onSubmit?: () => void
  ctx: SuggestContext
  rows?: number
  className?: string
  ariaLabel?: string
}

const ICONS: Record<Suggestion['kind'], string> = {
  table: '▦',
  column: '▪',
  lookup: '↗',
  operator: '=',
  function: 'ƒ',
  value: '"',
  keyword: '#',
}

export function QueryInput({
  value,
  onChange,
  onSubmit,
  ctx,
  rows = 2,
  className = '',
  ariaLabel,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)
  const [signature, setSignature] = useState<string | null>(null)
  /** Caret to restore after a completion was applied. */
  const pendingCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (pendingCaret.current === null) return
    const input = inputRef.current
    const caret = pendingCaret.current
    pendingCaret.current = null
    if (!input) return
    input.focus()
    input.setSelectionRange(caret, caret)
  })

  /** Recompute suggestions for the current caret. `force` opens on Ctrl+Space. */
  const refresh = (text: string, caret: number, force = false) => {
    setSignature(signatureAt(text, caret))
    const next = suggest(text, caret, ctx)
    setItems(next)
    setActive(0)
    if (force) setOpen(next.length > 0)
    else if (next.length === 0) setOpen(false)
  }

  const accept = (suggestion: Suggestion) => {
    const next =
      value.slice(0, suggestion.replaceFrom) +
      suggestion.insert +
      value.slice(suggestion.replaceTo)
    pendingCaret.current = suggestion.replaceFrom + suggestion.insert.length
    setOpen(false)
    setItems([])
    onChange(next)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.ctrlKey && event.code === 'Space') {
      event.preventDefault()
      const input = event.currentTarget
      refresh(input.value, input.selectionStart, true)
      return
    }
    if (open && items.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((i) => (i + 1) % items.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((i) => (i - 1 + items.length) % items.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        accept(items[active])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmit?.()
    }
  }

  return (
    <div className={`qinput ${className}`}>
      <textarea
        ref={inputRef}
        className="qinput-area"
        spellCheck={false}
        rows={rows}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => {
          onChange(e.target.value)
          refresh(e.target.value, e.target.selectionStart)
          setOpen(true)
        }}
        onKeyUp={(e) => {
          // Arrow/Home/End move the caret without changing the text.
          if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')
            refresh(e.currentTarget.value, e.currentTarget.selectionStart)
        }}
        onClick={(e) =>
          refresh(e.currentTarget.value, e.currentTarget.selectionStart)
        }
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />

      {signature && !open && (
        <div className="qinput-signature">
          <code>{signature}</code>
        </div>
      )}

      {open && items.length > 0 && (
        <ul className="qinput-popup" role="listbox">
          {items.slice(0, 40).map((item, index) => (
            <li key={`${item.kind}:${item.label}:${index}`}>
              <button
                className={`qinput-item ${index === active ? 'qinput-item--active' : ''}`}
                // mousedown fires before blur, so the click is not swallowed.
                onMouseDown={(e) => {
                  e.preventDefault()
                  accept(item)
                }}
                onMouseEnter={() => setActive(index)}
              >
                <span className="qinput-icon" aria-hidden="true">
                  {ICONS[item.kind]}
                </span>
                <span className="qinput-label">{item.label}</span>
                {item.detail && (
                  <span className="qinput-detail">{item.detail}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
