import type { UserRef } from '../types/sales'
import type { PowerMode } from '../PowerProvider'

/**
 * Kopfbereich: Titel, Live/Demo-Badge, Demo-Perspektivwechsel ("ich" der
 * "Meine …"-Ansichten), Aktualisieren und Dark-Mode-Umschalter.
 */

interface HeaderProps {
  mode: PowerMode
  salesManagers: UserRef[]
  perspectiveId: string
  onPerspectiveChange: (id: string) => void
  theme: 'light' | 'dark'
  onThemeToggle: () => void
  onRefresh: () => void
  loading: boolean
  lastUpdated: Date | null
}

const TIME = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

export function Header({
  mode,
  salesManagers,
  perspectiveId,
  onPerspectiveChange,
  theme,
  onThemeToggle,
  onRefresh,
  loading,
  lastUpdated,
}: HeaderProps) {
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
        <span
          className={`mode-badge ${mode === 'power-platform' ? 'mode-badge--live' : 'mode-badge--demo'}`}
          title={
            mode === 'power-platform'
              ? 'Verbunden mit der Power Platform'
              : 'Lokale Demo-Daten — außerhalb eines Power-Apps-Hosts'
          }
        >
          {mode === 'power-platform' ? 'Live' : 'Demo-Daten'}
        </span>

        {mode === 'local-mock' && salesManagers.length > 1 && (
          <label className="topbar__perspective">
            Perspektive
            <select
              value={perspectiveId}
              onChange={(e) => onPerspectiveChange(e.target.value)}
            >
              {salesManagers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}

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
          onClick={onThemeToggle}
          title={theme === 'light' ? 'Dunkles Design' : 'Helles Design'}
          aria-label="Design umschalten"
        >
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
