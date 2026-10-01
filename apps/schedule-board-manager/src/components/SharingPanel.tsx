import { useCallback, useEffect, useState } from 'react'
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
import { SEARCH_LIMIT, searchWords } from '../utils/principalSearch'

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
  // Live search: query 250 ms after the last keystroke, not on every key.
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250)
    return () => clearTimeout(t)
  }, [term])
  const searchKey = searchWords(debounced).length > 0 ? `q:${debounced}` : null
  const loadResults = useCallback((svc: BoardService) => svc.searchPrincipals(debounced), [debounced])
  const { data: results, error: searchError, loading: searching } = useLoad(searchKey, loadResults)
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

  const sharedIds = new Set((shares ?? []).map((s) => s.id.toLowerCase()))
  const visibleResults = searchKey ? (results ?? []).filter((r) => !sharedIds.has(r.id.toLowerCase())) : []
  const userHits = (results ?? []).filter((r) => r.type === 'user').length
  const typing = term.trim() !== debounced

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
        <div className="toolbar">
          <input
            className="input"
            placeholder="Benutzer oder Team suchen – z. B. „jör bus“ …"
            value={term}
            autoComplete="off"
            aria-label="Benutzer oder Team suchen"
            onChange={(e) => setTerm(e.target.value)}
          />
          <select className="input input--narrow" value={newLevel} onChange={(e) => setNewLevel(e.target.value as ShareLevel)} aria-label="Berechtigung">
            <option value="read">{SHARE_LEVEL_LABEL.read}</option>
            <option value="write">{SHARE_LEVEL_LABEL.write}</option>
          </select>
          {searchKey && (searching || typing) ? <span className="muted small">sucht …</span> : null}
        </div>
        {term.trim() !== '' && searchWords(term).length === 0 ? <p className="muted small">Mindestens 2 Zeichen eingeben.</p> : null}
        {searchError ? <div className="notice notice--error">Suche fehlgeschlagen: {searchError}</div> : null}
        {searchKey && results && !searching && !typing && visibleResults.length === 0 ? <p className="muted">Keine (weiteren) Treffer.</p> : null}
        {userHits >= SEARCH_LIMIT ? (
          <p className="muted small">Mehr als {SEARCH_LIMIT} Benutzer gefunden – weiter eintippen, z. B. den Nachnamen („jör bus“).</p>
        ) : null}
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
