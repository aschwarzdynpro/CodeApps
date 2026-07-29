import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  title: string
  /** Label above the input. */
  label: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Shown under the input — e.g. "this replaces an existing entry". */
  hint?: ReactNode
  /** Return a message to block submission, or null when the value is fine. */
  validate?: (value: string) => string | null
  onConfirm: (value: string) => void
  onCancel: () => void
}

/**
 * Text-input sibling of {@link ConfirmDialog}, sharing its look.
 *
 * Replaces `window.prompt`, which browsers render as a chrome dialog titled
 * with the origin — inside an embedded Code App that reads as
 * "An embedded page at …environment.api.powerplatformusercontent.com says",
 * which is both ugly and faintly alarming.
 *
 * Enter confirms, Escape and a backdrop click cancel; the input is focused and
 * its content selected on open, so typing replaces the suggestion.
 */
export function PromptDialog({
  title,
  label,
  initialValue = '',
  placeholder,
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  hint,
  validate,
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const error = validate?.(value) ?? null
  const canSubmit = value.trim() !== '' && !error

  const submit = () => {
    if (canSubmit) onConfirm(value.trim())
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="confirm-dialog prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-head">
          <span className="confirm-icon" aria-hidden="true">
            ☆
          </span>
          <h2 className="confirm-title">{title}</h2>
        </div>

        <div className="confirm-body">
          <label className="prompt-label" htmlFor="prompt-dialog-input">
            {label}
          </label>
          <input
            id="prompt-dialog-input"
            ref={inputRef}
            className="prompt-input"
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
          {error ? (
            <p className="prompt-error">{error}</p>
          ) : (
            hint && <p className="prompt-hint">{hint}</p>
          )}
        </div>

        <div className="confirm-actions">
          <button className="btn confirm-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="btn btn--primary"
            onClick={submit}
            disabled={!canSubmit}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
