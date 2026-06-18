import type { LoadProgressState } from '../hooks/useSalesData'

/**
 * Lade-Overlay für das Nachladen über bestehende Daten (GVL-Wechsel/Refresh):
 * legt sich über den (leicht geblurten) Inhalt und zeigt eine Fortschrittsleiste,
 * die je geladenem Bereich weiterläuft. Ohne Fortschrittswerte (z. B. Demo)
 * läuft die Leiste unbestimmt.
 */
export function LoadingOverlay({ progress }: { progress: LoadProgressState | null }) {
  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : null

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-card">
        <p className="loading-card__title">Daten werden geladen…</p>
        <div className="loading-bar">
          <div
            className={`loading-bar__fill${pct === null ? ' is-indeterminate' : ''}`}
            style={pct !== null ? { width: `${pct}%` } : undefined}
          />
        </div>
        <p className="loading-card__caption">
          {progress
            ? `${progress.done} von ${progress.total} Bereichen${progress.label ? ` · ${progress.label}` : ''}`
            : 'Verbindung wird hergestellt…'}
        </p>
      </div>
    </div>
  )
}
