import { useCallback, useState } from 'react'
import {
  ConflictError,
  SHARE_TYPE,
  SHARE_TYPE_LABEL,
  type Board,
  type BoardContent,
  type BoardSummary,
} from '../types/board'
import { getBoardService, type BoardService } from '../services/boardService'
import { useLoad } from '../hooks/useLoad'
import { buildCopyContent, diffContent, isDefaultBoard, nextOrderNumber, protectionOf } from '../utils/boardRules'
import { downloadJson, listSnapshots, saveSnapshot } from '../utils/snapshots'
import { formatDate } from '../utils/format'
import { recordUrl } from '../config'
import { BoardEditor } from './BoardEditor'
import { RawJsonEditor } from './RawJsonEditor'
import { DiffTable } from './DiffTable'
import { ConfirmDialog, Modal } from './Modal'
import { ShareBadge } from './BoardList'
import { SharingPanel } from './SharingPanel'
import { FilterLayoutPanel } from './FilterLayoutPanel'

export type Notify = (text: string, kind?: 'ok' | 'error') => void

interface Props {
  boardId: string
  boards: BoardSummary[]
  defaults: BoardContent | null
  notify: Notify
  /** List changed (rename, state, create, delete). `selectId` switches the selection. */
  onListChanged: (selectId?: string | null) => void
}

type Tab = 'edit' | 'json' | 'filter' | 'sharing' | 'history'
type Dialog = 'copy' | 'delete' | 'toggle' | 'save' | null

export function BoardDetail({ boardId, boards, defaults, notify, onListChanged }: Props) {
  const loadBoard = useCallback((svc: BoardService) => svc.getBoard(boardId), [boardId])
  const { data: board, error, loading, reload } = useLoad(boardId, loadBoard)

  const [tab, setTab] = useState<Tab>('edit')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  // Draft is bound to one loaded version; a reload after save discards it.
  const [draftState, setDraftState] = useState<{ key: string; content: BoardContent } | null>(null)
  const [jsonEpoch, setJsonEpoch] = useState(0)

  if (error) return <div className="notice notice--error">Board konnte nicht geladen werden: {error}</div>
  if (!board) return <div className="loading">Lade Board …</div>

  const versionKey = `${board.id}:${board.version ?? ''}`
  const draft = draftState?.key === versionKey ? draftState.content : board.content
  const setDraft = (content: BoardContent) => setDraftState({ key: versionKey, content })
  const changes = diffContent(board.content, draft)
  const protection = protectionOf(board)
  const formUrl = recordUrl('msdyn_scheduleboardsetting', board.id)

  const run = async (action: (svc: BoardService) => Promise<void>) => {
    setBusy(true)
    try {
      await action(await getBoardService())
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflict(true)
        setDialog(null)
      } else {
        notify(err instanceof Error ? err.message : String(err), 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async (svc) => {
      saveSnapshot(board.id, 'Vor dem Speichern', board.content)
      await svc.updateBoard(board, draft)
      setDialog(null)
      setDraftState(null)
      notify(`„${board.name}“ gespeichert (${changes.length} Änderung${changes.length === 1 ? '' : 'en'}).`)
      reload()
      onListChanged()
    })

  const toggle = () =>
    run(async (svc) => {
      await svc.setActive(board.id, !board.active)
      setDialog(null)
      notify(board.active ? `„${board.name}“ deaktiviert.` : `„${board.name}“ aktiviert.`)
      reload()
      onListChanged()
    })

  const remove = () =>
    run(async (svc) => {
      await svc.deleteBoard(board.id)
      setDialog(null)
      notify(`„${board.name}“ gelöscht.`)
      onListChanged(null)
    })

  const restore = (content: BoardContent) => {
    setDraft(content)
    setJsonEpoch((n) => n + 1)
    setTab('edit')
    notify('Stand als Entwurf geladen — prüfen und speichern.')
  }

  return (
    <section className="detail">
      <header className="detail__header">
        <div>
          <h1 className="detail__title">
            {board.name}
            {loading ? <span className="muted small"> · aktualisiere …</span> : null}
          </h1>
          <div className="detail__meta">
            <ShareBadge shareType={board.shareType} />
            <span className={`badge ${board.active ? 'badge--ok' : 'badge--inactive'}`}>{board.active ? 'Aktiv' : 'Inaktiv'}</span>
            <span>Besitzer: {board.ownerName}</span>
            <span>Geändert: {formatDate(board.modifiedOn)}</span>
            {protection.reason ? <span className="badge badge--lock" title={protection.reason}>geschützt</span> : null}
          </div>
        </div>
        <div className="detail__actions">
          <button className="btn btn--primary" onClick={() => setDialog('copy')}>
            Kopieren
          </button>
          <button
            className="btn"
            onClick={() => setDialog('toggle')}
            disabled={board.active ? !protection.canDisable : false}
            title={!protection.canDisable ? (protection.reason ?? '') : undefined}
          >
            {board.active ? 'Deaktivieren' : 'Aktivieren'}
          </button>
          <button
            className="btn btn--danger"
            onClick={() => setDialog('delete')}
            disabled={!protection.canDelete}
            title={!protection.canDelete ? (protection.reason ?? '') : undefined}
          >
            Löschen
          </button>
          <button className="btn btn--ghost" onClick={() => downloadJson(`${board.name}.board.json`, board)}>
            Export
          </button>
          {formUrl ? (
            <a className="btn btn--ghost" href={formUrl} target="_blank" rel="noreferrer" title="Datensatz-Formular, z. B. zum Freigeben">
              Formular ↗
            </a>
          ) : null}
        </div>
      </header>


      {conflict ? (
        <div className="notice notice--error">
          Das Board wurde zwischenzeitlich geändert (z. B. vom Schedule Board selbst). Dein Entwurf wurde nicht gespeichert.{' '}
          <button
            className="btn btn--small"
            onClick={() => {
              downloadJson(`${board.name}.entwurf.json`, draft)
              setConflict(false)
              setDraftState(null)
              reload()
            }}
          >
            Entwurf exportieren und neu laden
          </button>
        </div>
      ) : null}

      <nav className="tabs" role="tablist">
        {(
          [
            ['edit', 'Bearbeiten'],
            ['json', 'JSON'],
            ['filter', 'Filterlayout'],
            ['sharing', 'Freigaben'],
            ['history', 'Verlauf'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' tab--active' : ''}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="detail__body">
        {tab === 'edit' ? (
          <BoardEditor
            draft={draft}
            original={board.content}
            defaults={isDefaultBoard(board) ? null : defaults}
            protection={protection}
            onChange={setDraft}
          />
        ) : null}
        {tab === 'json' ? <RawJsonEditor key={`${versionKey}#${jsonEpoch}`} draft={draft} onChange={setDraft} /> : null}
        {tab === 'filter' ? (
          <FilterLayoutPanel
            board={board}
            boards={boards}
            defaults={isDefaultBoard(board) ? null : defaults}
            notify={notify}
            onBoardChanged={() => {
              reload()
              onListChanged()
            }}
          />
        ) : null}
        {tab === 'sharing' ? (
          <SharingPanel
            boardId={board.id}
            boardName={board.name}
            shareType={board.shareType}
            ownerName={board.ownerName}
            notify={notify}
          />
        ) : null}
        {tab === 'history' ? <History boardId={board.id} onRestore={restore} /> : null}
      </div>

      {changes.length > 0 ? (
        <div className="savebar">
          <span>
            {changes.length} ungespeicherte Änderung{changes.length === 1 ? '' : 'en'}
          </span>
          <button className="btn" onClick={() => setDraftState(null)}>
            Verwerfen
          </button>
          <button className="btn btn--primary" onClick={() => setDialog('save')}>
            Vorschau &amp; Speichern
          </button>
        </div>
      ) : null}

      {dialog === 'save' ? (
        <Modal
          title={`Änderungen an „${board.name}“`}
          wide
          onClose={() => setDialog(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDialog(null)} disabled={busy}>
                Zurück
              </button>
              <button className="btn btn--primary" onClick={save} disabled={busy}>
                {busy ? 'Speichert …' : 'Speichern'}
              </button>
            </>
          }
        >
          <p className="muted">Geschrieben werden nur diese Felder. Der bisherige Stand wird vorher im Verlauf gesichert.</p>
          <DiffTable changes={changes} />
        </Modal>
      ) : null}

      {dialog === 'copy' ? (
        <CopyDialog
          board={board}
          boards={boards}
          busy={busy}
          onClose={() => setDialog(null)}
          onCopy={(name, shareType, appendToEnd, copyShares) =>
            run(async (svc) => {
              const content = buildCopyContent(board, { name, shareType, appendToEnd }, nextOrderNumber(boards))
              const id = await svc.createBoard(content)
              let note = ''
              if (copyShares) {
                // The copy exists either way; a failed share is reported, not rolled back.
                const shares = await svc.listShares(board.id)
                const failed: string[] = []
                for (const s of shares) {
                  try {
                    await svc.setShare(id, s, s.level === 'write' ? 'write' : 'read', false)
                  } catch {
                    failed.push(s.name)
                  }
                }
                note = failed.length
                  ? ` Freigaben: ${shares.length - failed.length} übernommen, fehlgeschlagen für ${failed.join(', ')}.`
                  : ` ${shares.length} Freigabe(n) übernommen.`
              }
              setDialog(null)
              notify(`Kopie „${name}“ angelegt.${note}`, note.includes('fehlgeschlagen') ? 'error' : 'ok')
              onListChanged(id)
            })
          }
        />
      ) : null}

      {dialog === 'toggle' ? (
        <ConfirmDialog
          title={board.active ? 'Board deaktivieren' : 'Board aktivieren'}
          message={
            board.active
              ? `„${board.name}“ verschwindet als Tab aus dem Schedule Board. Es bleibt erhalten und kann wieder aktiviert werden.`
              : `„${board.name}“ erscheint wieder als Tab im Schedule Board.`
          }
          confirmLabel={board.active ? 'Deaktivieren' : 'Aktivieren'}
          busy={busy}
          onConfirm={toggle}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === 'delete' ? (
        <ConfirmDialog
          title="Board löschen"
          message={
            <>
              <p>
                „{board.name}“ wird endgültig gelöscht. Disponenten, die das Board nutzen, verlieren den Tab.
              </p>
              <p className="muted">
                Deaktivieren ist umkehrbar, Löschen nicht. Wer das Board später wiederherstellen will, lädt es vorher über
                „Export“ herunter.
              </p>
            </>
          }
          confirmLabel="Endgültig löschen"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </section>
  )
}

function CopyDialog({
  board,
  boards,
  busy,
  onClose,
  onCopy,
}: {
  board: Board
  boards: BoardSummary[]
  busy: boolean
  onClose: () => void
  onCopy: (name: string, shareType: number, appendToEnd: boolean, copyShares: boolean) => void
}) {
  const [name, setName] = useState(`${board.name} (Kopie)`)
  const [shareType, setShareType] = useState<number>(
    board.shareType === SHARE_TYPE.system ? SHARE_TYPE.everyone : board.shareType,
  )
  const [appendToEnd, setAppendToEnd] = useState(true)
  const [copyShares, setCopyShares] = useState(board.shareType === SHARE_TYPE.specificPeople)
  const trimmed = name.trim()
  const duplicate = boards.some((b) => b.name.trim().toLowerCase() === trimmed.toLowerCase())
  const lookupCount = Object.values(board.content.lookups).filter(Boolean).length

  return (
    <Modal
      title={`„${board.name}“ kopieren`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button className="btn btn--primary" onClick={() => onCopy(trimmed, shareType, appendToEnd, copyShares && shareType === SHARE_TYPE.specificPeople)} disabled={busy || trimmed === ''}>
            {busy ? 'Kopiert …' : 'Kopie anlegen'}
          </button>
        </>
      }
    >
      <label className="form-row">
        <span>Name der Kopie</span>
        <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      {duplicate ? <p className="field__hint warn">Ein Board mit diesem Namen gibt es schon.</p> : null}
      <label className="form-row">
        <span>Freigabe</span>
        <select className="input" value={shareType} onChange={(e) => setShareType(Number(e.target.value))}>
          {[SHARE_TYPE.everyone, SHARE_TYPE.justMe, SHARE_TYPE.specificPeople].map((v) => (
            <option key={v} value={v}>
              {SHARE_TYPE_LABEL[v]}
            </option>
          ))}
        </select>
      </label>
      <label className="form-check">
        <input type="checkbox" checked={appendToEnd} onChange={(e) => setAppendToEnd(e.target.checked)} />
        <span>Als letzten Tab einsortieren</span>
      </label>
      {shareType === SHARE_TYPE.specificPeople ? (
        <label className="form-check">
          <input type="checkbox" checked={copyShares} onChange={(e) => setCopyShares(e.target.checked)} />
          <span>Datensatz-Freigaben des Originals übernehmen</span>
        </label>
      ) : null}
      <p className="muted small">
        Übernommen werden alle Spalten, Settings- und Filter-JSON sowie {lookupCount} von 3 Konfigurations-Verknüpfungen
        (Filterlayout, Zellenvorlage, Ressourcenabfrage). Besitzer der Kopie bist du.
      </p>
    </Modal>
  )
}

function History({ boardId, onRestore }: { boardId: string; onRestore: (content: BoardContent) => void }) {
  const snapshots = listSnapshots(boardId)
  if (snapshots.length === 0) {
    return <p className="muted">Noch keine Sicherungen. Vor jedem Speichern legt die App hier (in diesem Browser) den vorherigen Stand ab.</p>
  }
  return (
    <ul className="history">
      {snapshots.map((s) => (
        <li key={s.at}>
          <span>
            {formatDate(s.at)} · {s.label}
          </span>
          <span className="history__actions">
            <button className="btn btn--small" onClick={() => onRestore(s.content)}>
              Als Entwurf laden
            </button>
            <button className="btn btn--small btn--ghost" onClick={() => downloadJson(`snapshot-${s.at}.json`, s.content)}>
              Export
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}
