import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { usePower } from './PowerProvider'
import { useSalesData } from './hooks/useSalesData'
import type { ViewContext } from './dashboard/types'
import {
  activitiesTile,
  leadsTile,
  opportunitiesTile,
  ordersTile,
  projectsTile,
  quotesTile,
} from './dashboard/tiles'
import { Header } from './components/Header'
import { KpiBar } from './components/KpiBar'
import { DashboardTile } from './components/DashboardTile'

/**
 * Moderne Code-App-Fassung des Legacy-Dashboards "Dashboard GVL":
 * KPI-Leiste plus sechs Kacheln (Aktivitäten, Leads, Verkaufschancen,
 * Projekte, Angebote, Aufträge) — jede mit Ansichts-/Diagrammwechsler,
 * Schnellsuche und Cross-Filter per Diagramm-Klick.
 */

type Theme = 'light' | 'dark'

const THEME_KEY = 'sales-dashboard-theme'

function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export default function App() {
  const { mode } = usePower()
  const { data, loading, error, refresh, lastUpdated } = useSalesData()

  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // "Ich" der "Meine …"-Ansichten; im Demo-Modus per Kopfzeile wechselbar.
  const [perspectiveId, setPerspectiveId] = useState<string | null>(null)
  const userId = perspectiveId ?? data?.currentUser.id ?? ''

  const ctx = useMemo<ViewContext>(
    () => ({ userId, now: new Date() }),
    // `data` als Dependency: nach einem Refresh soll auch `now` neu sein.
    [userId, data], // eslint-disable-line react-hooks/exhaustive-deps
  )

  if (!data) {
    return (
      <div className="app-state">
        {error ? (
          <>
            <p className="app-state__error">Daten konnten nicht geladen werden: {error}</p>
            <button type="button" className="app-state__retry" onClick={() => void refresh()}>
              Erneut versuchen
            </button>
          </>
        ) : (
          <>
            <span className="spinner" aria-hidden="true" />
            <p>Dashboard wird geladen…</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="app">
      <Header
        mode={mode}
        salesManagers={data.salesManagers}
        perspectiveId={userId}
        onPerspectiveChange={setPerspectiveId}
        theme={theme}
        onThemeToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onRefresh={() => void refresh()}
        loading={loading}
        lastUpdated={lastUpdated}
      />

      <main className="app__main">
        <KpiBar data={data} ctx={ctx} />

        <div className="tile-grid">
          <DashboardTile def={activitiesTile} rows={data.activities} ctx={ctx} />
          <DashboardTile def={leadsTile} rows={data.leads} ctx={ctx} />
          <DashboardTile def={opportunitiesTile} rows={data.opportunities} ctx={ctx} />
          <DashboardTile def={projectsTile} rows={data.projects} ctx={ctx} />
          <DashboardTile def={quotesTile} rows={data.quotes} ctx={ctx} />
          <DashboardTile def={ordersTile} rows={data.orders} ctx={ctx} />
        </div>
      </main>
    </div>
  )
}
