import { useCallback, useState } from 'react'
import {
  SHARE_LEVEL_LABEL,
  SHARE_TYPE,
  SHARE_TYPE_LABEL,
  type PrincipalRef,
  type Share,
  type ShareLevel,
} from '../types/board'
import { getBoardService, type BoardService } from '../services/boardService'
import { useLoad } from '../hooks/useLoad'
import type { Notify } from './BoardDetail'
import { PrincipalLabel, PrincipalPicker } from './PrincipalPicker'
import { OwnerDialog } from './OwnerDialog'
import { Btn, Select } from './ui'

const LEVEL_OPTIONS = [
  { value: 'read', label: SHARE_LEVEL_LABEL.read },
  { value: 'write', label: SHARE_LEVEL_LABEL.write },
]

interface Props {
  boardId: string
  boardName: string
  shareType: number
  ownerName: string
  ownerId: string | null
  /** False for system boards — they stay with SYSTEM. */
  canAssign: boolean
  notify: Notify
  onOwnerChanged: () => void
}

/**
 * Who a "Specific people" board is visible to — the record shares in
 * principalobjectaccess — and who owns it. Changes go out immediately (no
 * draft): neither is part of the board's content and has no diff to preview.
 */
export function SharingPanel({ boardId, boardName, shareType, ownerName, ownerId, canAssign, notify, onOwnerChanged }: Props) {
  const loadShares = useCallback((svc: BoardService) => svc.listShares(boardId), [boardId])
  const { data: shares, error, loading, reload } = useLoad(boardId, loadShares)

  const [newLevel, setNewLevel] = useState<ShareLevel>('read')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [ownerDialog, setOwnerDialog] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const act = async (id: string, action: (svc: BoardService) => Promise<void>, done: string) => {
    setBusyId(id)
    try {
      const svc = await getBoardService()
      const reason = svc.sharingUnavailable()
      if (reason) {
        setUnavailable(reason)
        return
      }
      await action(svc)
      notify(done)
      reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const assign = async (owner: PrincipalRef) => {
    setAssigning(true)
    try {
      await (await getBoardService()).assignBoard(boardId, owner)
      setOwnerDialog(false)
      notify(`„${boardName}“ gehört jetzt ${owner.name}.`)
      onOwnerChanged()
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setAssigning(false)
    }
  }

  const sharedIds = new Set((shares ?? []).map((s) => s.id.toLowerCase()))

  return (
    <div className="sharing">
      {shareType !== SHARE_TYPE.specificPeople ? (
        <div className="notice">
          Freigabe dieses Boards: <strong>{SHARE_TYPE_LABEL[shareType] ?? shareType}</strong>. Datensatz-Freigaben bestimmen die
          Sichtbarkeit nur bei „Bestimmte Personen“ — umstellen unter Bearbeiten → Allgemein.
        </div>
      ) : null}
      {unavailable ? <div className="notice notice--error">{unavailable}</div> : null}

      <section className="sharing__block">
        <h3>Besitzer</h3>
        <div className="owner-line">
          <span>
            <strong>{ownerName}</strong> <span className="muted small">sieht das Board immer.</span>
          </span>
          {canAssign ? (
            <Btn small onClick={() => setOwnerDialog(true)}>
              Ändern
            </Btn>
          ) : (
            <span className="muted small">System-Board — Besitzer bleibt SYSTEM.</span>
          )}
        </div>
      </section>

      <section className="sharing__block">
        <h3>Freigegeben für</h3>
        {error ? <div className="notice notice--error">Freigaben konnten nicht gelesen werden: {error}</div> : null}
        {loading && !shares ? <p className="muted">Lade …</p> : null}
        {shares && shares.length === 0 ? <p className="muted">Noch mit niemandem geteilt.</p> : null}
        {shares && shares.length > 0 ? (
          <ul className="share-list">
            {shares.map((s) => (
              <ShareRow
                key={s.id}
                share={s}
                busy={busyId === s.id}
                onLevel={(level) =>
                  act(s.id, (svc) => svc.setShare(boardId, s, level, true), `${s.name}: ${SHARE_LEVEL_LABEL[level]}.`)
                }
                onRevoke={() =>
                  act(s.id, (svc) => svc.revokeShare(boardId, s), `Freigabe für ${s.name} entfernt.`)
                }
              />
            ))}
          </ul>
        ) : null}
      </section>

      <section className="sharing__block">
        <h3>Freigeben</h3>
        <PrincipalPicker
          exclude={sharedIds}
          toolbar={
            <Select
              className="input input--level"
              aria-label="Berechtigung"
              value={newLevel}
              options={LEVEL_OPTIONS}
              onChange={(v) => setNewLevel(v as ShareLevel)}
            />
          }
          action={(p) => (
            <Btn
              small
              kind="primary"
              disabled={busyId !== null}
              onClick={() =>
                act(
                  p.id,
                  (svc) => svc.setShare(boardId, p, newLevel, false),
                  `„${boardName}“ für ${p.name} freigegeben (${SHARE_LEVEL_LABEL[newLevel]}).`,
                )
              }
            >
              {busyId === p.id ? 'Gibt frei …' : 'Freigeben'}
            </Btn>
          )}
        />
      </section>

      {ownerDialog ? (
        <OwnerDialog
          board={{ name: boardName, ownerName, ownerId, shareType }}
          busy={assigning}
          onAssign={assign}
          onClose={() => setOwnerDialog(false)}
        />
      ) : null}
    </div>
  )
}

function ShareRow({
  share,
  busy,
  onLevel,
  onRevoke,
}: {
  share: Share
  busy: boolean
  onLevel: (level: ShareLevel) => void
  onRevoke: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="share-row">
      <PrincipalLabel p={share} />
      <span className="share-row__actions">
        <Select
          className="input input--level"
          small
          aria-label={`Berechtigung ${share.name}`}
          value={share.level}
          disabled={busy}
          options={[...(share.level === 'custom' ? [{ value: 'custom', label: `${SHARE_LEVEL_LABEL.custom} (${share.mask})` }] : []), ...LEVEL_OPTIONS]}
          onChange={(v) => onLevel(v as ShareLevel)}
        />
        {confirming ? (
          <>
            <Btn small kind="danger" disabled={busy} onClick={onRevoke}>
              {busy ? 'Entfernt …' : 'Wirklich entfernen'}
            </Btn>
            <Btn small onClick={() => setConfirming(false)} disabled={busy}>
              Nein
            </Btn>
          </>
        ) : (
          <Btn small kind="ghost" onClick={() => setConfirming(true)} disabled={busy}>
            Entfernen
          </Btn>
        )}
      </span>
    </li>
  )
}
