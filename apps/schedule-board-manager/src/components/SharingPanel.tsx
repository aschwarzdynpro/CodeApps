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

interface Props {
  boardId: string
  boardName: string
  shareType: number
  ownerName: string
  notify: Notify
}

/**
 * Who a "Specific people" board is visible to — the record shares in
 * principalobjectaccess. Changes go out immediately (no draft): sharing is
 * not part of the board's content and has no diff to preview.
 */
export function SharingPanel({ boardId, boardName, shareType, ownerName, notify }: Props) {
  const loadShares = useCallback((svc: BoardService) => svc.listShares(boardId), [boardId])
  const { data: shares, error, loading, reload } = useLoad(boardId, loadShares)

  const [term, setTerm] = useState('')
  const [results, setResults] = useState<PrincipalRef[] | null>(null)
  const [newLevel, setNewLevel] = useState<ShareLevel>('read')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)

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

  const search = async () => {
    try {
      const svc = await getBoardService()
      setResults(await svc.searchPrincipals(term))
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const sharedIds = new Set((shares ?? []).map((s) => s.id.toLowerCase()))
  const visibleResults = (results ?? []).filter((r) => !sharedIds.has(r.id.toLowerCase()))

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
        <h3>Freigegeben für</h3>
        <p className="muted small">Besitzer: {ownerName} (sieht das Board immer).</p>
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
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            void search()
          }}
        >
          <input
            className="input"
            placeholder="Benutzer oder Team suchen (mind. 2 Zeichen) …"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <select className="input input--narrow" value={newLevel} onChange={(e) => setNewLevel(e.target.value as ShareLevel)} aria-label="Berechtigung">
            <option value="read">{SHARE_LEVEL_LABEL.read}</option>
            <option value="write">{SHARE_LEVEL_LABEL.write}</option>
          </select>
          <button className="btn" type="submit" disabled={term.trim().length < 2}>
            Suchen
          </button>
        </form>
        {results && visibleResults.length === 0 ? <p className="muted">Keine (weiteren) Treffer.</p> : null}
        {visibleResults.length > 0 ? (
          <ul className="share-list">
            {visibleResults.map((p) => (
              <li key={p.id} className="share-row">
                <PrincipalLabel p={p} />
                <button
                  className="btn btn--small btn--primary"
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
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}

function PrincipalLabel({ p }: { p: PrincipalRef }) {
  return (
    <span className="share-row__who">
      <span className={`avatar avatar--${p.type}`} aria-hidden>
        {p.type === 'team' ? '◆' : p.name.slice(0, 1).toUpperCase()}
      </span>
      <span>
        <span className="share-row__name">{p.name}</span>
        {p.detail ? <span className="share-row__detail">{p.detail}</span> : null}
      </span>
    </span>
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
        <select
          className="input input--narrow"
          value={share.level}
          disabled={busy}
          aria-label={`Berechtigung ${share.name}`}
          onChange={(e) => onLevel(e.target.value as ShareLevel)}
        >
          {share.level === 'custom' ? <option value="custom">{SHARE_LEVEL_LABEL.custom} ({share.mask})</option> : null}
          <option value="read">{SHARE_LEVEL_LABEL.read}</option>
          <option value="write">{SHARE_LEVEL_LABEL.write}</option>
        </select>
        {confirming ? (
          <>
            <button className="btn btn--small btn--danger" disabled={busy} onClick={onRevoke}>
              {busy ? 'Entfernt …' : 'Wirklich entfernen'}
            </button>
            <button className="btn btn--small" onClick={() => setConfirming(false)} disabled={busy}>
              Nein
            </button>
          </>
        ) : (
          <button className="btn btn--small btn--ghost" onClick={() => setConfirming(true)} disabled={busy}>
            Entfernen
          </button>
        )}
      </span>
    </li>
  )
}
