import type { SeriesService } from '../services/seriesService'
import { useLoad } from '../hooks/useLoad'
import { Btn } from './ui'

const loadChecks = (svc: SeriesService) => svc.checkSetup()

/** What the environment provides — the first stop after deploying into a new environment. */
export function SetupPanel() {
  const { data, error, loading, reload } = useLoad('setup', loadChecks)
  return (
    <section className="page">
      <header className="page__header">
        <h1>Einrichtung</h1>
        <Btn onClick={reload} disabled={loading}>
          Erneut prüfen
        </Btn>
      </header>
      <p className="muted small">
        Prüft, ob Tabelle, Spalten und Integration da sind, die die Serienplanung braucht. Fehlt etwas, legt
        <code> scripts/provision-schema.ps1</code> es an (siehe README).
      </p>
      {error ? <div className="notice notice--error">{error}</div> : null}
      {loading && !data ? <div className="loading">Prüfe …</div> : null}
      <ul className="checks">
        {(data ?? []).map((c) => (
          <li key={c.label} className={c.ok ? 'check check--ok' : 'check check--fail'}>
            <span className="check__icon" aria-hidden>
              {c.ok ? '✓' : '✕'}
            </span>
            <span className="check__label">{c.label}</span>
            <span className="check__detail">{c.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
