import type { SalesData } from '../types/sales'
import { inPeriod, type DatePeriod } from './format'

/**
 * Globaler Filter, der über alle Bereiche wirkt — angewandt auf den
 * Datenbestand, sodass KPIs, Bereichs-Anzahlen und Listen konsistent dieselbe
 * Einschränkung zeigen.
 *
 * - `period`: Erstellungszeitraum (createdOn) — bei allen Entitäten vorhanden.
 * - `openOnly`: nur offene/aktive Datensätze (je Entität passend definiert).
 *
 * Region/Territory und Anwendung sind bewusst nicht enthalten: sie stehen nicht
 * auf allen Entitäten (Anwendung nur bei Leads; die GVL-/Gebietsdimension deckt
 * der GVL-Filter im Kopf ab).
 */
export interface GlobalFilter {
  period: DatePeriod
  openOnly: boolean
}

export const EMPTY_FILTER: GlobalFilter = { period: 'all', openOnly: false }

export function isFilterActive(f: GlobalFilter): boolean {
  return f.period !== 'all' || f.openOnly
}

export function applyGlobalFilter(data: SalesData, f: GlobalFilter, now: Date): SalesData {
  if (!isFilterActive(f)) return data
  const inRange = (iso: string | undefined) => inPeriod(iso, f.period, now)
  const open = f.openOnly
  return {
    ...data,
    activities: data.activities.filter((r) => inRange(r.createdOn) && (!open || r.open)),
    leads: data.leads.filter((r) => inRange(r.createdOn) && (!open || r.open)),
    opportunities: data.opportunities.filter((r) => inRange(r.createdOn) && (!open || r.open)),
    projects: data.projects.filter(
      (r) => inRange(r.createdOn) && (!open || r.statusCategory === 'open'),
    ),
    quotes: data.quotes.filter(
      (r) => inRange(r.createdOn) && (!open || r.status === 'In Bearbeitung' || r.status === 'Aktiv'),
    ),
    orders: data.orders.filter(
      (r) => inRange(r.createdOn) && (!open || r.state === 'Aktiv' || r.state === 'Übermittelt'),
    ),
  }
}
