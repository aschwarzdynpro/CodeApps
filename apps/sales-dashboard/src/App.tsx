import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import './App.css'
import { usePower } from './PowerProvider'
import { useSalesData } from './hooks/useSalesData'
import type { TileDef, ViewContext } from './dashboard/types'
import type { UserRef } from './types/sales'
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
import { TileIcon } from './components/TileIcon'
import { LoadingOverlay } from './components/LoadingOverlay'

/**
 * Moderne Code-App-Fassung des Legacy-Dashboards "Dashboard GVL":
 * KPI-Leiste als Überblick plus eine Bereichsauswahl — der gewählte Bereich
 * (Aktivitäten, Leads, Verkaufschancen, Projekte, Angebote, Aufträge) wird
 * groß angezeigt (Diagramm + Tabelle), mit Ansichts-/Diagrammwechsler,
 * Schnellsuche und Cross-Filter per Diagramm-Klick.
 */

type Theme = 'light' | 'dark' | 'waldmann'

const THEME_KEY = 'sales-dashboard-theme'
const DATA_MODE_KEY = 'sales-dashboard-data-mode'

/** Reihenfolge des Design-Umschalters: Hell → Dunkel → Waldmann → … */
const THEME_ORDER: Theme[] = ['light', 'dark', 'waldmann']

/** Anzahl der Datensätze in der Standardansicht einer Kachel (Badge der Tableiste). */
function defaultViewCount<T>(def: TileDef<T>, rows: T[], ctx: ViewContext): number {
  const filter = def.views[0].filter
  let count = 0
  for (const row of rows) if (filter(row, ctx)) count++
  return count
}

function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light' || stored === 'waldmann') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export default function App() {
  const { mode, orgUrl } = usePower()

  // Demo-Schalter: erzwingt Demo-Daten auch im Power-Apps-Host (zum Testen).
  const [forceMock, setForceMock] = useState(
    () => localStorage.getItem(DATA_MODE_KEY) === 'demo',
  )

  // Gewählte GVL, aus deren Sicht das Dashboard gefiltert wird; `null` = der
  // Standard (angemeldeter Benutzer).
  const [selectedGvl, setSelectedGvl] = useState<UserRef | null>(null)

  // Aktuell angezeigter Bereich (eine der sechs Kacheln).
  const [activeTile, setActiveTile] = useState<string>('activities')

  const changeForceMock = (value: boolean) => {
    setForceMock(value)
    // Eine GVL aus dem alten Datenbestand passt nicht zum neuen (Demo ↔ Live):
    // zurück auf den Standard.
    setSelectedGvl(null)
    localStorage.setItem(DATA_MODE_KEY, value ? 'demo' : 'auto')
  }

  const { data, loading, error, refresh, lastUpdated, listSalesManagers, progress } =
    useSalesData(forceMock, selectedGvl?.id)

  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // "Ich" der "Meine …"-Ansichten und der KPIs: die gewählte GVL, sonst der
  // angemeldete Benutzer (Standard).
  const userId = selectedGvl?.id ?? data?.currentUser.id ?? ''

  const ctx = useMemo<ViewContext>(
    () => ({ userId, now: new Date() }),
    // `data` als Dependency: nach einem Refresh soll auch `now` neu sein.
    [userId, data], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Bereichs-Tableiste: Icon, Titel, Akzent und Anzahl (Standardansicht) je Kachel.
  const tabs = useMemo(() => {
    if (!data) return []
    return [
      { id: activitiesTile.id, icon: activitiesTile.icon, title: activitiesTile.title, accent: activitiesTile.accent, count: defaultViewCount(activitiesTile, data.activities, ctx) },
      { id: leadsTile.id, icon: leadsTile.icon, title: leadsTile.title, accent: leadsTile.accent, count: defaultViewCount(leadsTile, data.leads, ctx) },
      { id: opportunitiesTile.id, icon: opportunitiesTile.icon, title: opportunitiesTile.title, accent: opportunitiesTile.accent, count: defaultViewCount(opportunitiesTile, data.opportunities, ctx) },
      { id: projectsTile.id, icon: projectsTile.icon, title: projectsTile.title, accent: projectsTile.accent, count: defaultViewCount(projectsTile, data.projects, ctx) },
      { id: quotesTile.id, icon: quotesTile.icon, title: quotesTile.title, accent: quotesTile.accent, count: defaultViewCount(quotesTile, data.quotes, ctx) },
      { id: ordersTile.id, icon: ordersTile.icon, title: ordersTile.title, accent: ordersTile.accent, count: defaultViewCount(ordersTile, data.orders, ctx) },
    ]
  }, [data, ctx])

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
        dataSource={data.dataSource}
        canUseLive={mode === 'power-platform'}
        forceMock={forceMock}
        onForceMockChange={changeForceMock}
        selectedGvl={selectedGvl}
        defaultName={data.currentUser.name}
        loadCandidates={listSalesManagers}
        onGvlChange={setSelectedGvl}
        theme={theme}
        onThemeCycle={() =>
          setTheme((t) => THEME_ORDER[(THEME_ORDER.indexOf(t) + 1) % THEME_ORDER.length])
        }
        onRefresh={() => void refresh()}
        loading={loading}
        lastUpdated={lastUpdated}
      />

      <div className="app__stage">
        <main className={`app__main${loading ? ' is-reloading' : ''}`}>
        <KpiBar
          data={data}
          ctx={ctx}
          activeTileId={activeTile}
          onSelectTile={setActiveTile}
        />

        <nav className="tile-tabs" aria-label="Bereich wählen">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tile-tab${activeTile === tab.id ? ' is-active' : ''}`}
              style={{ '--tile-accent': tab.accent } as CSSProperties}
              onClick={() => setActiveTile(tab.id)}
              aria-pressed={activeTile === tab.id}
            >
              <span className="tile-tab__icon">
                <TileIcon name={tab.icon} />
              </span>
              <span className="tile-tab__label">{tab.title}</span>
              <span className="tile-tab__count">{tab.count}</span>
            </button>
          ))}
        </nav>

        {activeTile === 'activities' && (
          <DashboardTile def={activitiesTile} rows={data.activities} ctx={ctx} orgUrl={orgUrl} fullWidth />
        )}
        {activeTile === 'leads' && (
          <DashboardTile def={leadsTile} rows={data.leads} ctx={ctx} orgUrl={orgUrl} fullWidth />
        )}
        {activeTile === 'opportunities' && (
          <DashboardTile def={opportunitiesTile} rows={data.opportunities} ctx={ctx} orgUrl={orgUrl} fullWidth />
        )}
        {activeTile === 'projects' && (
          <DashboardTile def={projectsTile} rows={data.projects} ctx={ctx} orgUrl={orgUrl} fullWidth />
        )}
        {activeTile === 'quotes' && (
          <DashboardTile def={quotesTile} rows={data.quotes} ctx={ctx} orgUrl={orgUrl} fullWidth />
        )}
        {activeTile === 'orders' && (
          <DashboardTile def={ordersTile} rows={data.orders} ctx={ctx} orgUrl={orgUrl} fullWidth />
        )}
        </main>
        {loading && <LoadingOverlay progress={progress} />}
      </div>
    </div>
  )
}
