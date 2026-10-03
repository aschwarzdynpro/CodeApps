import { useCallback, useState } from 'react'
import { Tab, TabList } from '@fluentui/react-components'
import { QuestionCircleRegular, TranslateRegular } from '@fluentui/react-icons'
import './App.css'
import { usePower } from './PowerProvider'
import { StudioView, type Notify } from './components/StudioView'
import { HistoryView } from './components/HistoryView'
import { SetupView } from './components/SetupView'
import { Btn } from './components/ui'
import { HelpPanel } from './help/HelpPanel'
import { HelpContext, type OpenHelp } from './help/helpContext'
import { HELP_FOR } from './help/helpContent'
import { S } from './strings'

type View = 'studio' | 'history' | 'setup'

export default function App() {
  const { ready, mode } = usePower()
  const [view, setView] = useState<View>('studio')
  const [runs, setRuns] = useState(0)
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error'; id: number } | null>(null)
  const [help, setHelp] = useState<{ open: boolean; section: string | null }>({ open: false, section: null })
  const openHelp: OpenHelp = useCallback((section) => setHelp({ open: true, section: section ?? HELP_FOR[view] ?? null }), [view])

  const notify: Notify = useCallback((text, kind = 'ok') => {
    const id = Date.now()
    setToast({ text, kind, id })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), kind === 'error' ? 9000 : 4500)
  }, [])

  return (
    <HelpContext.Provider value={openHelp}>
      <div className="app">
        <header className="topbar">
          <div className="topbar__brand">
            <TranslateRegular className="topbar__logo" aria-hidden />
            {S.app.title}
          </div>
          <TabList className="topbar__nav" selectedValue={view} onTabSelect={(_, d) => setView(d.value as View)} aria-label="Bereiche">
            <Tab value="studio">{S.app.nav.studio}</Tab>
            <Tab value="history">{S.app.nav.history}</Tab>
            <Tab value="setup">{S.app.nav.setup}</Tab>
          </TabList>
          <Btn kind="ghost" icon={<QuestionCircleRegular />} onClick={() => openHelp()} title={S.app.helpTitle}>
            {S.app.help}
          </Btn>
          <span className={`mode mode--${mode}`} title={mode === 'local-mock' ? S.app.modeMockTitle : S.app.modeDataverse}>
            {ready ? (mode === 'local-mock' ? S.app.modeMock : S.app.modeDataverse) : S.app.loading}
          </span>
        </header>

        {ready ? (
          <>
            {/* The studio stays mounted so edits survive a look at history or setup. */}
            <div className="view" hidden={view !== 'studio'}>
              <StudioView notify={notify} onRun={() => setRuns((n) => n + 1)} />
            </div>
            {view === 'history' ? <HistoryView epoch={runs} /> : null}
            {view === 'setup' ? <SetupView /> : null}
          </>
        ) : (
          <div className="loading">{S.app.loading}</div>
        )}

        {toast ? (
          <div className={`toast toast--${toast.kind}`} role="status">
            {toast.text}
          </div>
        ) : null}
        <HelpPanel key={help.section ?? 'help'} open={help.open} section={help.section} onClose={() => setHelp((h) => ({ ...h, open: false }))} />
      </div>
    </HelpContext.Provider>
  )
}
