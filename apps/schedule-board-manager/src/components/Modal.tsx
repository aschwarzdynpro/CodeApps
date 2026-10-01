import type { ReactNode } from 'react'
import { Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { Btn } from './ui'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  wide?: boolean
}

/** Fluent dialog with the app's title/body/footer layout; Escape and backdrop close it. */
export function Modal({ title, onClose, children, footer, wide }: ModalProps) {
  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open) onClose()
      }}
    >
      <DialogSurface className={wide ? 'dialog--wide' : undefined} aria-label={title}>
        <DialogBody>
          <DialogTitle action={<Btn kind="ghost" aria-label="Schließen" icon={<DismissRegular />} onClick={onClose} />}>{title}</DialogTitle>
          <DialogContent className="modal__body">{children}</DialogContent>
          <DialogActions>{footer}</DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

interface ConfirmProps {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ title, message, confirmLabel, danger, busy, onConfirm, onClose }: ConfirmProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose} disabled={busy}>
            Abbrechen
          </Btn>
          <Btn kind={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Läuft …' : confirmLabel}
          </Btn>
        </>
      }
    >
      {message}
    </Modal>
  )
}
