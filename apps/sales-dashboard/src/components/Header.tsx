import type { SalesDataSource, UserRef } from '../types/sales'
import { GvlFilter } from './GvlFilter'

/**
 * Kopfbereich: Titel, Datenquellen-Badge, Demo-Daten-Schalter, GVL-Suchfeld
 * (aus wessen Sicht das Dashboard gefiltert wird), Aktualisieren und
 * Dark-Mode-Umschalter.
 */

interface HeaderProps {
  /** Herkunft des aktuell angezeigten Datenbestands (Badge). */
  dataSource: SalesDataSource
  /** Läuft die App in einem Power-Apps-Host (Live-Daten möglich)? */
  canUseLive: boolean
  /** Demo-Schalter: Demo-Daten erzwingen, auch wenn Live möglich wäre. */
  forceMock: boolean
  onForceMockChange: (value: boolean) => void
  /** Gewählte GVL oder `null` für den Standard (angemeldeter Benutzer). */
  selectedGvl: UserRef | null
  /** Name des angemeldeten Benutzers — der Standard, als Platzhalter-Hinweis. */
  defaultName: string
  /** Lädt die GVL-Kandidaten für die Suche. */
  loadCandidates: () => Promise<UserRef[]>
  onGvlChange: (gvl: UserRef | null) => void
  theme: 'light' | 'dark' | 'waldmann'
  onThemeCycle: () => void
  onRefresh: () => void
  loading: boolean
  lastUpdated: Date | null
}

const THEME_LABEL: Record<'light' | 'dark' | 'waldmann', string> = {
  light: 'Hell',
  dark: 'Dunkel',
  waldmann: 'Waldmann',
}

const TIME = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

const BADGE: Record<SalesDataSource, { label: string; tone: string; title: string }> = {
  live: {
    label: 'Live',
    tone: 'mode-badge--live',
    title: 'Daten aus Dataverse (D365 DEV)',
  },
  mixed: {
    label: 'Live + Demo',
    tone: 'mode-badge--demo',
    title: 'Einzelne Tabellen konnten nicht geladen werden — dort Demo-Daten (Details in der Konsole)',
  },
  demo: {
    label: 'Demo-Daten',
    tone: 'mode-badge--demo',
    title: 'Lokale Demo-Daten',
  },
}

export function Header({
  dataSource,
  canUseLive,
  forceMock,
  onForceMockChange,
  selectedGvl,
  defaultName,
  loadCandidates,
  onGvlChange,
  theme,
  onThemeCycle,
  onRefresh,
  loading,
  lastUpdated,
}: HeaderProps) {
  const badge = BADGE[dataSource]
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v16a2 2 0 0 0 2 2h16" />
            <path d="M7 13l3-3 4 4 5-6" />
          </svg>
        </span>
        <div>
          <h1 className="topbar__title">Sales Dashboard</h1>
          <p className="topbar__subtitle">
            Gebietsverkaufsleitung · Vertriebsüberblick
            {lastUpdated && <> · Stand {TIME.format(lastUpdated)} Uhr</>}
          </p>
        </div>
      </div>

      <div className="topbar__actions">
        <span className={`mode-badge ${badge.tone}`} title={badge.title}>
          {badge.label}
        </span>

        <label
          className={`switch${canUseLive ? '' : ' switch--disabled'}`}
          title={
            canUseLive
              ? 'Demo-Daten statt Live-Daten anzeigen (zum Testen)'
              : 'Außerhalb eines Power-Apps-Hosts laufen immer Demo-Daten'
          }
        >
          <input
            type="checkbox"
            checked={forceMock || !canUseLive}
            disabled={!canUseLive}
            onChange={(e) => onForceMockChange(e.target.checked)}
          />
          <span className="switch__track" aria-hidden="true">
            <span className="switch__thumb" />
          </span>
          Demo-Daten
        </label>

        <GvlFilter
          selected={selectedGvl}
          defaultName={defaultName}
          loadCandidates={loadCandidates}
          onChange={onGvlChange}
        />

        <button
          type="button"
          className={`icon-button${loading ? ' is-spinning' : ''}`}
          onClick={onRefresh}
          disabled={loading}
          title="Daten aktualisieren"
          aria-label="Daten aktualisieren"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={onThemeCycle}
          title={`Design: ${THEME_LABEL[theme]} – klicken zum Wechseln`}
          aria-label={`Design wechseln (aktuell: ${THEME_LABEL[theme]})`}
        >
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : theme === 'dark' ? (
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1v.2h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
