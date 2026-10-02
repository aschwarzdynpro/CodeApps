import { useCallback, useState } from 'react'
import { Tab, TabList } from '@fluentui/react-components'
import './App.css'
import { usePower } from './PowerProvider'
import type { Notify } from './types/series'
import type { SeriesService } from './services/seriesService'
import { useLoad } from './hooks/useLoad'
import { SeriesList } from './components/SeriesList'
import { SeriesDetail } from './components/SeriesDetail'
import { SeriesEditor, type EditorScope } from './components/SeriesEditor'
import { SetupPanel } from './components/SetupPanel'

type View = 'series' | 'setup'

const listSeries = (svc: SeriesService) => svc.listSeries()

export default function App() {
  const { ready, mode } = usePower()
  const [view, setView] = useState<View>('series')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ scope: EditorScope; epoch: number } | null>(null)
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error'; id: number } | null>(null)

  const listRes = useLoad(ready ? 'series' : null, listSeries)
  const series = listRes.data ?? []
  const current = selectedId && series.some((s) => s.id === selectedId) ? selectedId : (series[0]?.id ?? null)

  const notify: Notify = useCallback((text, kind = 'ok') => {
    const id = Date.now()
    setToast({ text, kind, id })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), kind === 'error' ? 9000 : 4500)
  }, [])

  const openEditor = (scope: EditorScope) => {
    setView('series')
    setEditor({ scope, epoch: Date.now() })
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo" aria-hidden>
            ↻
          </span>
          Serienplanung
        </div>
        <TabList
          className="topbar__nav"
          selectedValue={editor?.scope.kind === 'create' ? 'new' : view}
          onTabSelect={(_, d) => {
            if (d.value === 'new') openEditor({ kind: 'create' })
            else {
              setEditor(null)
              setView(d.value as View)
            }
          }}
          aria-label="Bereiche"
        >
          <Tab value="series">Serien</Tab>
          <Tab value="new">Neue Serie</Tab>
          <Tab value="setup">Einrichtung</Tab>
        </TabList>
        <span className={`mode mode--${mode}`} title={mode === 'local-mock' ? 'Kein Power-Apps-Host — Beispieldaten im Speicher' : 'Dataverse'}>
          {ready ? (mode === 'local-mock' ? 'Mock-Daten' : 'Dataverse') : '…'}
        </span>
      </header>

      {listRes.error ? <div className="notice notice--error">Serien konnten nicht geladen werden: {listRes.error}</div> : null}
      {!ready || (listRes.loading && !listRes.data) ? <div className="loading">Lade Serien …</div> : null}

      {ready && listRes.data ? (
        view === 'setup' ? (
          <main className="main">
            <SetupPanel />
          </main>
        ) : editor ? (
          <main className="main">
            <SeriesEditor
              key={editor.epoch}
              scope={editor.scope}
              notify={notify}
              onCancel={() => setEditor(null)}
              onDone={(id) => {
                setEditor(null)
                setSelectedId(id)
                listRes.reload()
              }}
            />
          </main>
        ) : (
          <main className="layout">
            <SeriesList series={series} selectedId={current} onSelect={setSelectedId} />
            {current ? (
              <SeriesDetail key={current} seriesId={current} notify={notify} onEdit={openEditor} onChanged={() => listRes.reload()} />
            ) : (
              <div className="empty">Noch keine Serie. „Neue Serie“ legt eine an.</div>
            )}
          </main>
        )
      ) : null}

      {toast ? (
        <div className={`toast toast--${toast.kind}`} role="status">
          {toast.text}
        </div>
      ) : null}
    </div>
  )
}
