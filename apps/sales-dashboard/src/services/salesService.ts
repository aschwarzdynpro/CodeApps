import type { SalesData } from '../types/sales'
import { mockSalesService } from './mockSalesService'

/**
 * Service contract of the dashboard: one call that returns the complete,
 * already-typed sales snapshot. The UI (tiles, KPIs, views) only depends on
 * this interface — swapping mock for live Dataverse never touches components.
 *
 * Go-live plan (same seam as audit-explorer's dataverseAuditService):
 *   1. `power-apps init` in this app folder (creates power.config.json)
 *   2. Generate typed clients per table, e.g.
 *        pac code add-data-source -a dataverse -t activitypointer
 *        pac code add-data-source -a dataverse -t lead
 *        pac code add-data-source -a dataverse -t opportunity
 *        pac code add-data-source -a dataverse -t wal_project
 *        pac code add-data-source -a dataverse -t quote
 *        pac code add-data-source -a dataverse -t salesorder
 *   3. Add a `dataverseSalesService` that maps the generated models to the
 *      types in ../types/sales (option-set codes → German labels in one
 *      place), gates on `powerModeReady` from the PowerProvider and falls
 *      back to mock outside a Power Apps host.
 *   4. Re-point the singleton below.
 */
export interface SalesService {
  /** Lädt den vollständigen Dashboard-Datenbestand. */
  load(): Promise<SalesData>
}

export const salesService: SalesService = mockSalesService
