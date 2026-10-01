import { useState } from 'react'
import { SHARE_TYPE, type BoardSummary, type PrincipalRef } from '../types/board'
import { Modal } from './Modal'
import { PrincipalLabel, PrincipalPicker } from './PrincipalPicker'
import { Btn } from './ui'

/** What an owner change does and doesn't touch — shown before every assign. */
export function OwnerNotes({ justMe }: { justMe: boolean }) {
  return (
    <ul className="muted small">
      {justMe ? <li>Bei „Nur ich“ sieht nur der Besitzer das Board — der bisherige Besitzer verliert es aus seiner Liste.</li> : null}
      <li>Datensatz-Freigaben bleiben bestehen.</li>
      <li>Filterlayout, Zellvorlage und Ressourcenabfrage sind eigene Datensätze und behalten ihren Besitzer.</li>
      <li>Braucht das Recht „Zuweisen“ auf Schedule Board Settings.</li>
    </ul>
  )
}

interface Props {
  board: Pick<BoardSummary, 'name' | 'ownerName' | 'ownerId' | 'shareType'>
  busy: boolean
  onAssign: (owner: PrincipalRef) => void
  onClose: () => void
}

/** Pick the new owner of one board, then confirm. */
export function OwnerDialog({ board, busy, onAssign, onClose }: Props) {
  const [chosen, setChosen] = useState<PrincipalRef | null>(null)
  const exclude = new Set(board.ownerId ? [board.ownerId.toLowerCase()] : [])

  return (
    <Modal
      title={`Besitzer von „${board.name}“ ändern`}
      onClose={onClose}
      wide
      footer={
        <>
          <Btn onClick={onClose} disabled={busy}>
            Abbrechen
          </Btn>
          {chosen ? (
            <>
              <Btn onClick={() => setChosen(null)} disabled={busy}>
                Andere Person
              </Btn>
              <Btn kind="primary" onClick={() => onAssign(chosen)} disabled={busy}>
                {busy ? 'Ändert …' : 'Besitzer ändern'}
              </Btn>
            </>
          ) : null}
        </>
      }
    >
      {chosen ? (
        <div className="owner-change">
          <span>
            Bisher: <strong>{board.ownerName}</strong>
          </span>
          <span className="owner-change__arrow" aria-hidden>
            →
          </span>
          <PrincipalLabel p={chosen} />
        </div>
      ) : (
        <PrincipalPicker
          exclude={exclude}
          owners
          autoFocus
          action={(p) => (
            <Btn small kind="primary" onClick={() => setChosen(p)}>
              Auswählen
            </Btn>
          )}
        />
      )}
      <OwnerNotes justMe={board.shareType === SHARE_TYPE.justMe} />
    </Modal>
  )
}
