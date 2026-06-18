import type { SalesData, UserRef } from '../types/sales'
import { dataverseSalesService } from './dataverseSalesService'

/**
 * Fortschritts-Rückmeldung beim Laden: `done` von `total` Bereichen geladen,
 * optional mit Anzeigename des zuletzt fertigen Bereichs. Treibt das
 * Lade-Overlay beim GVL-Wechsel/Refresh.
 */
export type LoadProgress = (done: number, total: number, label?: string) => void

/**
 * Service contract of the dashboard: one call that returns the complete,
 * already-typed sales snapshot. The UI (tiles, KPIs, views) only depends on
 * this interface — the hook picks between this singleton (live Dataverse
 * with automatic mock fallback) and the pure mock service (Demo-Schalter
 * im Header).
 */
export interface SalesService {
  /**
   * Lädt den vollständigen Dashboard-Datenbestand.
   *
   * @param gvlId Optionale GVL, aus deren Sicht das Dashboard geladen wird
   *   (Live: serverseitige Filter auf diese GVL statt auf den angemeldeten
   *   Benutzer). Ohne Angabe greift der Standard = angemeldeter Benutzer.
   * @param onProgress Optionaler Ladefortschritt je Bereich (für das Overlay).
   */
  load(gvlId?: string, onProgress?: LoadProgress): Promise<SalesData>

  /**
   * GVL-Kandidaten für das Suchfeld im Kopfbereich (Live: Territory-Manager;
   * Demo: die geseedeten GVL). Die Liste ist klein und wird einmal geladen;
   * der Tippfilter läuft clientseitig.
   */
  listSalesManagers(): Promise<UserRef[]>
}

export const salesService: SalesService = dataverseSalesService
