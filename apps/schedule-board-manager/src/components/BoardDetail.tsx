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
import { exportBoard } from '../services/transferService'
import { BoardEditor } from './BoardEditor'
import { RawJsonEditor } from './RawJsonEditor'
import { DiffTable } from './DiffTable'
import { ConfirmDialog, Modal } from './Modal'
import { ShareBadge } from './BoardList'
import { SharingPanel } from './SharingPanel'
import { FilterLayoutPanel } from './FilterLayoutPanel'
import { Btn, Select } from './ui'
import { Button, Checkbox, Input, Tab as TabItem, TabList } from '@fluentui/react-components'
import { OpenRegular } from '@fluentui/react-icons'

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

  const exportPackage = () =>
    run(async (svc) => {
      const pkg = await exportBoard(svc, board)
      downloadJson(`${board.name}.board.json`, pkg)
      notify(`„${board.name}“ exportiert (${pkg.configs.length} Konfiguration${pkg.configs.length === 1 ? '' : 'en'} enthalten).`)
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
          <Btn kind="primary" onClick={() => setDialog('copy')}>
            Kopieren
          </Btn>
          <Btn
            onClick={() => setDialog('toggle')}
            disabled={board.active ? !protection.canDisable : false}
            title={!protection.canDisable ? (protection.reason ?? '') : undefined}
          >
            {board.active ? 'Deaktivieren' : 'Aktivieren'}
          </Btn>
          <Btn
            kind="danger"
            onClick={() => setDialog('delete')}
            disabled={!protection.canDelete}
            title={!protection.canDelete ? (protection.reason ?? '') : undefined}
          >
            Löschen
          </Btn>
          <Btn kind="ghost" onClick={exportPackage} disabled={busy} title="Board mit Konfigurationen und Namen aller Bezüge — importierbar in jeder Umgebung">
            Export
          </Btn>
          {formUrl ? (
            <Button as="a" appearance="subtle" href={formUrl} target="_blank" rel="noreferrer" icon={<OpenRegular />} iconPosition="after" title="Datensatz-Formular, z. B. zum Freigeben">
              Formular
            </Button>
          ) : null}
        </div>
      </header>


      {conflict ? (
        <div className="notice notice--error">
          Das Board wurde zwischenzeitlich geändert (z. B. vom Schedule Board selbst). Dein Entwurf wurde nicht gespeichert.{' '}
          <Btn
            small
            onClick={() => {
              downloadJson(`${board.name}.entwurf.json`, draft)
              setConflict(false)
              setDraftState(null)
              reload()
            }}
          >
            Entwurf exportieren und neu laden
          </Btn>
        </div>
      ) : null}

      <TabList className="tabs" selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as Tab)}>
        {(
          [
            ['edit', 'Bearbeiten'],
            ['json', 'JSON'],
            ['filter', 'Filterlayout'],
            ['sharing', 'Besitzer & Freigaben'],
            ['history', 'Verlauf'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <TabItem key={t} value={t}>
            {label}
          </TabItem>
        ))}
      </TabList>

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
            ownerId={board.ownerId}
            canAssign={protection.canAssign}
            notify={notify}
            onOwnerChanged={() => {
              reload()
              onListChanged()
            }}
          />
        ) : null}
        {tab === 'history' ? <History boardId={board.id} onRestore={restore} /> : null}
      </div>

      {changes.length > 0 ? (
        <div className="savebar">
          <span>
            {changes.length} ungespeicherte Änderung{changes.length === 1 ? '' : 'en'}
          </span>
          <Btn onClick={() => setDraftState(null)}>
            Verwerfen
          </Btn>
          <Btn kind="primary" onClick={() => setDialog('save')}>
            Vorschau &amp; Speichern
          </Btn>
        </div>
      ) : null}

      {dialog === 'save' ? (
        <Modal
          title={`Änderungen an „${board.name}“`}
          wide
          onClose={() => setDialog(null)}
          footer={
            <>
              <Btn onClick={() => setDialog(null)} disabled={busy}>
                Zurück
              </Btn>
              <Btn kind="primary" onClick={save} disabled={busy}>
                {busy ? 'Speichert …' : 'Speichern'}
              </Btn>
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
                „Export“ herunter — „Importieren“ legt es daraus wieder an.
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
          <Btn onClick={onClose} disabled={busy}>
            Abbrechen
          </Btn>
          <Btn kind="primary" onClick={() => onCopy(trimmed, shareType, appendToEnd, copyShares && shareType === SHARE_TYPE.specificPeople)} disabled={busy || trimmed === ''}>
            {busy ? 'Kopiert …' : 'Kopie anlegen'}
          </Btn>
        </>
      }
    >
      <label className="form-row">
        <span>Name der Kopie</span>
        <Input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      {duplicate ? <p className="field__hint warn">Ein Board mit diesem Namen gibt es schon.</p> : null}
      <label className="form-row">
        <span>Freigabe</span>
        <Select
          className="input"
          aria-label="Freigabe"
          value={String(shareType)}
          options={[SHARE_TYPE.everyone, SHARE_TYPE.justMe, SHARE_TYPE.specificPeople].map((v) => ({ value: String(v), label: SHARE_TYPE_LABEL[v] }))}
          onChange={(v) => setShareType(Number(v))}
        />
      </label>
      <Checkbox label="Als letzten Tab einsortieren" checked={appendToEnd} onChange={(e) => setAppendToEnd(e.target.checked)} />
      {shareType === SHARE_TYPE.specificPeople ? (
        <Checkbox label="Datensatz-Freigaben des Originals übernehmen" checked={copyShares} onChange={(e) => setCopyShares(e.target.checked)} />
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
            <Btn small onClick={() => onRestore(s.content)}>
              Als Entwurf laden
            </Btn>
            <Btn small kind="ghost" onClick={() => downloadJson(`snapshot-${s.at}.json`, s.content)}>
              Export
            </Btn>
          </span>
        </li>
      ))}
    </ul>
  )
}
