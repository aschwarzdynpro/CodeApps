import type { SalesData } from '../types/sales'
import { dataverseSalesService } from './dataverseSalesService'

/**
 * Service contract of the dashboard: one call that returns the complete,
 * already-typed sales snapshot. The UI (tiles, KPIs, views) only depends on
 * this interface — the hook picks between this singleton (live Dataverse
 * with automatic mock fallback) and the pure mock service (Demo-Schalter
 * im Header).
 */
export interface SalesService {
  /** Lädt den vollständigen Dashboard-Datenbestand. */
  load(): Promise<SalesData>
}

export const salesService: SalesService = dataverseSalesService
