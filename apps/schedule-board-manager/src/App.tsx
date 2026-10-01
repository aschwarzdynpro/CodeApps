import { useCallback, useState } from 'react'
import './App.css'
import { usePower } from './PowerProvider'
import type { BoardService } from './services/boardService'
import { useLoad } from './hooks/useLoad'
import { EMPTY_REF_DATA, RefDataContext, loadRefData } from './hooks/refData'
import { BoardList } from './components/BoardList'
import { BoardDetail, type Notify } from './components/BoardDetail'
import { CompareView, type BulkPreset } from './components/CompareView'
import { BulkView } from './components/BulkView'
import { ImportView } from './components/ImportView'
import { getBoardService } from './services/boardService'
import { isDefaultBoard } from './utils/boardRules'

type View = 'boards' | 'compare' | 'bulk' | 'import'

const listBoards = (svc: BoardService) => svc.listBoards()

export default function App() {
  const { ready, mode } = usePower()
  const [view, setView] = useState<View>('boards')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bulkPreset, setBulkPreset] = useState<BulkPreset | null>(null)
  const [bulkEpoch, setBulkEpoch] = useState(0)
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error'; id: number } | null>(null)

  const boardsRes = useLoad(ready ? 'boards' : null, listBoards)
  const refRes = useLoad(ready ? 'ref' : null, loadRefData)
  const boards = boardsRes.data ?? []

  const defaultId = boards.find(isDefaultBoard)?.id ?? null
  const loadDefault = useCallback((svc: BoardService) => svc.getBoard(defaultId!), [defaultId])
  const defaultRes = useLoad(defaultId, loadDefault)

  const notify: Notify = useCallback((text, kind = 'ok') => {
    const id = Date.now()
    setToast({ text, kind, id })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), kind === 'error' ? 9000 : 4500)
  }, [])

  const onListChanged = (selectId?: string | null) => {
    boardsRes.reload()
    if (selectId !== undefined) setSelectedId(selectId)
  }

  const saveOrder = async (updates: { id: string; order: number }[]) => {
    try {
      await (await getBoardService()).setOrder(updates)
      notify(`Reihenfolge gespeichert (${updates.length} Board${updates.length === 1 ? '' : 's'} geändert).`)
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      boardsRes.reload()
    }
  }

  const current = selectedId && boards.some((b) => b.id === selectedId) ? selectedId : (boards.find((b) => !isDefaultBoard(b))?.id ?? null)

  return (
    <RefDataContext.Provider value={refRes.data ?? EMPTY_REF_DATA}>
      <div className="app">
        <header className="topbar">
          <div className="topbar__brand">
            <span className="topbar__logo" aria-hidden>
              ▦
            </span>
            Schedule Board Manager
          </div>
          <nav className="topbar__nav">
            {(
              [
                ['boards', 'Boards'],
                ['compare', 'Vergleichen'],
                ['bulk', 'Mehrere anpassen'],
                ['import', 'Importieren'],
              ] as [View, string][]
            ).map(([v, label]) => (
              <button key={v} className={`nav-btn${view === v ? ' nav-btn--active' : ''}`} onClick={() => setView(v)}>
                {label}
              </button>
            ))}
          </nav>
          <span className={`mode mode--${mode}`} title={mode === 'local-mock' ? 'Kein Power-Apps-Host — Beispieldaten im Speicher' : 'Dataverse'}>
            {ready ? (mode === 'local-mock' ? 'Mock-Daten' : 'Dataverse') : '…'}
          </span>
        </header>

        {boardsRes.error ? <div className="notice notice--error">Boards konnten nicht geladen werden: {boardsRes.error}</div> : null}
        {refRes.error ? (
          <div className="notice notice--error">
            Ansichten/Konfigurationen konnten nicht geladen werden ({refRes.error}). Auswahllisten zeigen nur IDs.
          </div>
        ) : null}

        {!ready || (boardsRes.loading && !boardsRes.data) ? <div className="loading">Lade Boards …</div> : null}

        {ready && boardsRes.data ? (
          view === 'boards' ? (
            <main className="layout">
              <BoardList boards={boards} selectedId={current} onSelect={setSelectedId} onSaveOrder={saveOrder} />
              {current ? (
                <BoardDetail
                  key={current}
                  boardId={current}
                  boards={boards}
                  defaults={defaultRes.data?.content ?? null}
                  notify={notify}
                  onListChanged={onListChanged}
                />
              ) : (
                <div className="empty">Keine Boards sichtbar. Fehlen Leserechte auf „Schedule Board Setting“?</div>
              )}
            </main>
          ) : view === 'compare' ? (
            <CompareView
              boards={boards}
              onTransfer={(preset) => {
                setBulkPreset(preset)
                setBulkEpoch((n) => n + 1)
                setView('bulk')
              }}
            />
          ) : view === 'bulk' ? (
            <BulkView key={bulkEpoch} boards={boards} preset={bulkPreset} notify={notify} onDone={() => boardsRes.reload()} />
          ) : (
            <ImportView
              boards={boards}
              notify={notify}
              onImported={(id) => {
                onListChanged(id)
                setView('boards')
              }}
            />
          )
        ) : null}

        {toast ? (
          <div className={`toast toast--${toast.kind}`} role="status">
            {toast.text}
          </div>
        ) : null}
      </div>
    </RefDataContext.Provider>
  )
}
