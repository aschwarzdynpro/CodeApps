import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Danger styling (e.g. a production write) — red accent + warning icon. */
  danger?: boolean
  /** While the confirmed action runs — disables the buttons, shows a spinner. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A modern confirmation dialog: centred card with an icon badge, title, body and
 * a Cancel / Confirm footer. Escape or a backdrop click cancels; the confirm
 * button is focused on open; a `danger` variant styles destructive/production
 * actions in red. Replaces `window.confirm` for the comparer turn-on/off writes.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        className={`confirm-dialog ${danger ? 'confirm-dialog--danger' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-head">
          <span className="confirm-icon" aria-hidden="true">
            {danger ? '⚠' : '⏻'}
          </span>
          <h2 className="confirm-title">{title}</h2>
        </div>
        <div className="confirm-body">{message}</div>
        <div className="confirm-actions">
          <button
            className="btn confirm-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={`btn ${danger ? 'confirm-go--danger' : 'btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
