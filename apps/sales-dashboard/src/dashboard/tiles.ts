import type {
  Activity,
  Lead,
  Opportunity,
  Project,
  Quote,
  SalesOrder,
} from '../types/sales'
import type { BadgeTone, TileDef } from './types'
import { isLastMonth, isThisMonth, isWithinNextMonths, isoWeek, isoWeekSortKey } from '../utils/format'

/**
 * Die sechs Kacheln des Legacy-Dashboards "Dashboard GVL"
 * (LegacySolution/…/Dashboards/{802e23b1-…}.xml), übersetzt in deklarative
 * Kachel-Definitionen:
 *
 *   Ansichten  ⇔ SavedQueries   (FetchXML-Filter → filter-Prädikate)
 *   Diagramme  ⇔ Visualizations (FetchXML-Aggregate → groupBy/measure)
 *   Spalten    ⇔ layoutxml      (Grid-Zellen → ColumnDefs)
 *
 * "ich" entspricht eq-userid; im Demo-Modus über den Perspektiv-Umschalter
 * im Kopfbereich wechselbar.
 */

/* ----------------------------------------------------------- Hilfsfunktionen */

const TONE_BY_LABEL: Record<string, BadgeTone> = {
  // Aktivität
  Offen: 'blue',
  Geplant: 'violet',
  Abgeschlossen: 'green',
  Abgebrochen: 'gray',
  Hoch: 'red',
  Normal: 'blue',
  Niedrig: 'gray',
  // Lead
  Neu: 'blue',
  Kontaktiert: 'amber',
  Qualifiziert: 'green',
  // Verkaufschance / Projekt / Forecast
  'In Bearbeitung': 'blue',
  Gewonnen: 'green',
  Verloren: 'red',
  Pipeline: 'blue',
  'Bester Fall': 'violet',
  Zugesagt: 'amber',
  Ausgelassen: 'gray',
  Vorphase: 'violet',
  'Offen gewonnen': 'green',
  'Geschlossen gewonnen': 'green',
  Zurückgestellt: 'gray',
  // Angebot
  Aktiv: 'blue',
  Beauftragt: 'green',
  Abgesagt: 'red',
  // Auftrag
  Übermittelt: 'amber',
  Abgerechnet: 'green',
  Storniert: 'red',
  Auftrag: 'blue',
  Projektauftrag: 'violet',
  Serviceauftrag: 'amber',
  Ersatzteilauftrag: 'gray',
}

const tone = (label: string): BadgeTone => TONE_BY_LABEL[label] ?? 'gray'

/** ISO-Datumsstrings vergleichen lexikografisch korrekt; leere ans Ende. */
const dateAsc =
  <T,>(sel: (row: T) => string | undefined) =>
  (a: T, b: T) =>
    (sel(a) ?? '9999').localeCompare(sel(b) ?? '9999')

const dateDesc =
  <T,>(sel: (row: T) => string | undefined) =>
  (a: T, b: T) =>
    (sel(b) ?? '0000').localeCompare(sel(a) ?? '0000')

const FORECAST_ORDER = [
  'Pipeline',
  'Bester Fall',
  'Zugesagt',
  'Gewonnen',
  'Ausgelassen',
] as const

/* ------------------------------------------------------------- Aktivitäten */

/** Zeitfenster der Legacy-Views: Fälligkeit dieser/letzter Monat oder leer. */
const inActivityWindow = (row: Activity, now: Date) =>
  !row.scheduledEnd ||
  isThisMonth(row.scheduledEnd, now) ||
  isLastMonth(row.scheduledEnd, now)

export const activitiesTile: TileDef<Activity> = {
  id: 'activities',
  title: 'Aktivitäten',
  icon: 'activity',
  accent: '#2e7cd6',
  entityLogicalName: 'activitypointer',
  // Deep-Link braucht die konkrete Aktivitätstabelle (appointment, task, …).
  recordEntity: (row) => row.typeCode || 'activitypointer',
  views: [
    {
      id: 'meine-aktivitaeten',
      label: 'Meine Aktivitäten – dieser & letzter Monat',
      filter: (row, ctx) =>
        row.participantIds.includes(ctx.userId) && inActivityWindow(row, ctx.now),
      sort: dateAsc((row) => row.scheduledEnd),
    },
    {
      id: 'meine-termine',
      label: 'Meine Termine – dieser & letzter Monat',
      filter: (row, ctx) =>
        row.isAppointment &&
        row.participantIds.includes(ctx.userId) &&
        inActivityWindow(row, ctx.now),
      sort: dateAsc((row) => row.scheduledEnd),
    },
  ],
  charts: [
    {
      id: 'anzahl-status',
      label: 'Anzahl nach Status',
      kind: 'donut',
      format: 'number',
      groupBy: (row) => row.state,
    },
    {
      id: 'wochen-status',
      label: 'Anzahl nach Woche und Status',
      kind: 'stacked-column',
      format: 'number',
      groupBy: (row) =>
        row.scheduledEnd ? `KW ${isoWeek(row.scheduledEnd)}` : 'Ohne Datum',
      groupSortKey: (row) =>
        row.scheduledEnd ? isoWeekSortKey(row.scheduledEnd) : Number.MAX_SAFE_INTEGER,
      stackBy: (row) => row.state,
    },
  ],
  columns: [
    { key: 'subject', label: 'Betreff', value: (r) => r.subject },
    { key: 'regarding', label: 'Bezug', value: (r) => r.regarding },
    { key: 'type', label: 'Typ', kind: 'badge', value: (r) => r.type, tone: () => 'gray' },
    { key: 'state', label: 'Status', kind: 'badge', value: (r) => r.state, tone: (r) => tone(r.state) },
    { key: 'priority', label: 'Priorität', kind: 'badge', value: (r) => r.priority, tone: (r) => tone(r.priority) },
    { key: 'start', label: 'Beginn', kind: 'date', value: (r) => r.scheduledStart },
    { key: 'end', label: 'Fälligkeit', kind: 'date', value: (r) => r.scheduledEnd },
    { key: 'owner', label: 'Besitzer', value: (r) => r.owner.name },
  ],
  rowId: (row) => row.id,
  searchText: (row) => `${row.subject} ${row.regarding} ${row.owner.name}`,
}

/* ------------------------------------------------------------------- Leads */

export const leadsTile: TileDef<Lead> = {
  id: 'leads',
  title: 'Leads',
  icon: 'lead',
  accent: '#8e5cd9',
  entityLogicalName: 'lead',
  views: [
    {
      id: 'meine-offenen',
      label: 'Meine Leads – offen / in Bearbeitung',
      filter: (row, ctx) => row.open && row.owner.id === ctx.userId,
      sort: dateDesc((row) => row.createdOn),
    },
  ],
  charts: [
    {
      id: 'ursprung-status',
      label: 'Anzahl Leads nach Ursprung und Status',
      kind: 'stacked-column',
      format: 'number',
      groupBy: (row) => row.source,
      stackBy: (row) => row.status,
    },
  ],
  columns: [
    { key: 'subject', label: 'Thema', value: (r) => r.subject },
    { key: 'company', label: 'Firma', value: (r) => r.companyName },
    { key: 'contact', label: 'Kontakt', value: (r) => r.fullName },
    { key: 'applications', label: 'Anwendung', value: (r) => r.applications.join(', ') },
    { key: 'source', label: 'Ursprung', value: (r) => r.source },
    { key: 'status', label: 'Status', kind: 'badge', value: (r) => r.status, tone: (r) => tone(r.status) },
    { key: 'gvl', label: 'GVL', value: (r) => r.areaSalesManager.name },
    { key: 'created', label: 'Erstellt am', kind: 'date', value: (r) => r.createdOn },
  ],
  rowId: (row) => row.id,
  searchText: (row) =>
    `${row.subject} ${row.companyName} ${row.fullName} ${row.source}`,
}

/* --------------------------------------------------------- Verkaufschancen */

export const opportunitiesTile: TileDef<Opportunity> = {
  id: 'opportunities',
  title: 'Verkaufschancen',
  icon: 'opportunity',
  accent: '#12a594',
  entityLogicalName: 'opportunity',
  views: [
    {
      id: 'entscheidung-bald',
      label: 'Offen, ich GVL – Entscheidung in ≤ 2 Monaten',
      filter: (row, ctx) =>
        row.open &&
        row.areaSalesManager.id === ctx.userId &&
        isWithinNextMonths(row.decisionDate, ctx.now, 2),
      sort: dateAsc((row) => row.decisionDate),
    },
  ],
  charts: [
    {
      id: 'potential-forecast',
      label: 'Summe Potential nach Prognosekategorie',
      kind: 'donut',
      format: 'currency',
      groupBy: (row) => row.forecastCategory,
      groupOrder: FORECAST_ORDER,
      measure: (row) => row.estimatedValue,
    },
  ],
  columns: [
    { key: 'number', label: 'Nr.', kind: 'number', value: (r) => r.number },
    { key: 'name', label: 'Name', value: (r) => r.name },
    { key: 'city', label: 'Ort', value: (r) => r.city },
    { key: 'account', label: 'Firma', value: (r) => r.account },
    { key: 'decision', label: 'Entscheidung', kind: 'date', value: (r) => r.decisionDate },
    { key: 'value', label: 'Potential', kind: 'currency', value: (r) => r.estimatedValue },
    { key: 'stage', label: 'Phase', value: (r) => r.processStage },
    { key: 'forecast', label: 'Prognose', kind: 'badge', value: (r) => r.forecastCategory, tone: (r) => tone(r.forecastCategory) },
    { key: 'kam', label: 'KAM', value: (r) => r.keyAccountManager.name },
  ],
  rowId: (row) => row.id,
  searchText: (row) => `${row.number} ${row.name} ${row.account} ${row.city}`,
}

/* ---------------------------------------------------------------- Projekte */

const isOpenProject = (row: Project, userId: string) =>
  row.statusCategory === 'open' && row.areaSalesManager.id === userId

export const projectsTile: TileDef<Project> = {
  id: 'projects',
  title: 'Projekte',
  icon: 'project',
  accent: '#e5862b',
  entityLogicalName: 'wal_project',
  views: [
    {
      id: 'offen',
      label: 'Offene Projekte – ich im Projektteam als GVL',
      filter: (row, ctx) => isOpenProject(row, ctx.userId),
      sort: (a, b) => a.number - b.number,
    },
    {
      id: 'nachfass-monat',
      label: 'Offen – Nachfasstermin diesen Monat',
      filter: (row, ctx) =>
        isOpenProject(row, ctx.userId) && isThisMonth(row.followUpDate, ctx.now),
      sort: dateAsc((row) => row.followUpDate),
    },
    {
      id: 'entscheidung-monat',
      label: 'Offen – Entscheidungsdatum diesen Monat',
      filter: (row, ctx) =>
        isOpenProject(row, ctx.userId) && isThisMonth(row.decisionDate, ctx.now),
      sort: dateAsc((row) => row.decisionDate),
    },
    {
      id: 'gewonnen-monat',
      label: 'Gewonnene Projekte in diesem Monat',
      filter: (row, ctx) =>
        row.statusCategory === 'won' &&
        row.areaSalesManager.id === ctx.userId &&
        isThisMonth(row.statusChangedOn, ctx.now),
      sort: dateDesc((row) => row.statusChangedOn),
    },
    {
      id: 'offene-aufgaben',
      label: 'Offen – mit offenen Projektaufgaben für mich',
      filter: (row, ctx) => isOpenProject(row, ctx.userId) && row.hasOpenTasksForMe,
      sort: (a, b) => a.number - b.number,
    },
    {
      id: 'verloren-monat',
      label: 'Verlorene / zurückgestellte Projekte diesen Monat',
      filter: (row, ctx) =>
        row.statusCategory === 'lost' &&
        row.areaSalesManager.id === ctx.userId &&
        isThisMonth(row.statusChangedOn, ctx.now),
      sort: dateDesc((row) => row.statusChangedOn),
    },
  ],
  charts: [
    {
      id: 'potential-forecast',
      label: 'Summe Potential nach Prognosekategorie',
      kind: 'column',
      format: 'currency',
      groupBy: (row) => row.forecastCategory,
      groupOrder: FORECAST_ORDER,
      measure: (row) => row.potential,
    },
    {
      id: 'anzahl-status',
      label: 'Anzahl Projekte nach Statusgrund',
      kind: 'column',
      format: 'number',
      groupBy: (row) => row.status,
    },
    {
      id: 'umsatz-bezeichnung',
      label: 'Umsatz nach Projektbezeichnung',
      kind: 'column',
      format: 'currency',
      groupBy: (row) => row.designation,
      measure: (row) => row.actualRevenue,
    },
    {
      id: 'potential-bezeichnung',
      label: 'Potential nach Projektbezeichnung',
      kind: 'column',
      format: 'currency',
      groupBy: (row) => row.designation,
      measure: (row) => row.potential,
    },
    {
      id: 'funnel-forecast',
      label: 'Potential-Funnel nach Prognosekategorie',
      kind: 'funnel',
      format: 'currency',
      groupBy: (row) => row.forecastCategory,
      groupOrder: FORECAST_ORDER,
      measure: (row) => row.potential,
    },
  ],
  columns: [
    { key: 'number', label: 'Nr.', kind: 'number', value: (r) => r.number },
    { key: 'designation', label: 'Projektbezeichnung', value: (r) => r.designation },
    { key: 'firm', label: 'Anfragende Firma', value: (r) => r.inquiringFirm },
    { key: 'endCustomer', label: 'Endkunde', value: (r) => r.endCustomer },
    { key: 'city', label: 'Ort', value: (r) => r.city },
    { key: 'type', label: 'Typ', value: (r) => r.type },
    { key: 'followUp', label: 'Nachfass', kind: 'date', value: (r) => r.followUpDate },
    { key: 'decision', label: 'Entscheidung', kind: 'date', value: (r) => r.decisionDate },
    { key: 'potential', label: 'Potential', kind: 'currency', value: (r) => r.potential },
    { key: 'status', label: 'Status', kind: 'badge', value: (r) => r.status, tone: (r) => tone(r.status) },
    { key: 'forecast', label: 'Prognose', kind: 'badge', value: (r) => r.forecastCategory, tone: (r) => tone(r.forecastCategory) },
    { key: 'psp', label: 'PSP-Element', value: (r) => r.pspElement },
    { key: 'pm', label: 'Projektleiter', value: (r) => r.projectManager.name },
  ],
  rowId: (row) => row.id,
  searchText: (row) =>
    `${row.number} ${row.designation} ${row.inquiringFirm} ${row.endCustomer} ${row.city} ${row.pspElement}`,
}

/* ---------------------------------------------------------------- Angebote */

export const quotesTile: TileDef<Quote> = {
  id: 'quotes',
  title: 'Angebote',
  icon: 'quote',
  accent: '#d6409f',
  entityLogicalName: 'quote',
  views: [
    {
      id: 'neu-monat',
      label: 'Neue Angebote diesen Monat – ich GVL',
      filter: (row, ctx) =>
        row.areaSalesManager.id === ctx.userId &&
        isThisMonth(row.creationDate, ctx.now) &&
        (row.status === 'In Bearbeitung' || row.status === 'Aktiv'),
      sort: dateDesc((row) => row.creationDate),
    },
    {
      id: 'beauftragt-monat',
      label: 'Beauftragte Angebote diesen Monat – ich GVL',
      filter: (row, ctx) =>
        row.areaSalesManager.id === ctx.userId &&
        isThisMonth(row.creationDate, ctx.now) &&
        row.status === 'Beauftragt',
      sort: dateDesc((row) => row.creationDate),
    },
    {
      id: 'abgesagt-monat',
      label: 'Abgesagte Angebote diesen Monat – ich GVL',
      filter: (row, ctx) =>
        row.areaSalesManager.id === ctx.userId &&
        isThisMonth(row.creationDate, ctx.now) &&
        row.status === 'Abgesagt',
      sort: dateDesc((row) => row.creationDate),
    },
  ],
  charts: [
    {
      id: 'wert-art',
      label: 'Angebotswert nach Angebotsart',
      kind: 'column',
      format: 'currency',
      groupBy: (row) => row.kind,
      measure: (row) => row.totalAmount,
    },
  ],
  columns: [
    { key: 'number', label: 'Nr.', value: (r) => r.number },
    { key: 'date', label: 'Datum', kind: 'date', value: (r) => r.creationDate },
    { key: 'customer', label: 'Kunde', value: (r) => r.customer },
    { key: 'name', label: 'Name', value: (r) => r.name },
    { key: 'project', label: 'Projekt', value: (r) => r.project },
    { key: 'kind', label: 'Angebotsart', value: (r) => r.kind },
    { key: 'type', label: 'Typ', value: (r) => r.type },
    { key: 'status', label: 'Status', kind: 'badge', value: (r) => r.status, tone: (r) => tone(r.status) },
    { key: 'amount', label: 'Wert', kind: 'currency', value: (r) => r.totalAmount },
    { key: 'kam', label: 'KAM', value: (r) => r.keyAccountManager.name },
  ],
  rowId: (row) => row.id,
  searchText: (row) =>
    `${row.number} ${row.customer} ${row.name} ${row.project ?? ''} ${row.kind}`,
}

/* ---------------------------------------------------------------- Aufträge */

export const ordersTile: TileDef<SalesOrder> = {
  id: 'orders',
  title: 'Aufträge',
  icon: 'order',
  accent: '#46a758',
  entityLogicalName: 'salesorder',
  views: [
    {
      id: 'meine-monat',
      label: 'Meine Aufträge diesen Monat – ich GVL',
      filter: (row, ctx) =>
        row.areaSalesManager.id === ctx.userId && isThisMonth(row.creationDate, ctx.now),
      sort: dateDesc((row) => row.creationDate),
    },
    {
      id: 'projekt-monat',
      label: 'Projektaufträge diesen Monat – ich GVL',
      // "Projektauftrag" = Auftrag mit verknüpftem Projekt (env-stabil,
      // statt auf die Schreibweise der Auftragsart zu vertrauen).
      filter: (row, ctx) =>
        row.areaSalesManager.id === ctx.userId &&
        isThisMonth(row.creationDate, ctx.now) &&
        row.project !== undefined,
      sort: dateDesc((row) => row.creationDate),
    },
    {
      id: 'alle-monat',
      label: 'Alle Aufträge diesen Monat',
      filter: (row, ctx) => isThisMonth(row.creationDate, ctx.now),
      sort: dateDesc((row) => row.creationDate),
    },
  ],
  charts: [
    {
      id: 'wert-art',
      label: 'Auftragswert nach Auftragsart',
      kind: 'column',
      format: 'currency',
      groupBy: (row) => row.documentType,
      measure: (row) => row.totalAmount,
    },
    {
      id: 'wert-gvl',
      label: 'Auftragswert nach GVL',
      kind: 'column',
      format: 'currency',
      groupBy: (row) => row.areaSalesManager.name,
      measure: (row) => row.totalAmount,
    },
  ],
  columns: [
    { key: 'number', label: 'Nr.', value: (r) => r.number },
    { key: 'date', label: 'Datum', kind: 'date', value: (r) => r.creationDate },
    { key: 'customer', label: 'Kunde', value: (r) => r.customer },
    { key: 'name', label: 'Name', value: (r) => r.name },
    { key: 'project', label: 'Projekt', value: (r) => r.project },
    { key: 'docType', label: 'Auftragsart', kind: 'badge', value: (r) => r.documentType, tone: (r) => tone(r.documentType) },
    { key: 'state', label: 'Status', kind: 'badge', value: (r) => r.state, tone: (r) => tone(r.state) },
    { key: 'amount', label: 'Wert', kind: 'currency', value: (r) => r.totalAmount },
    { key: 'gvl', label: 'GVL', value: (r) => r.areaSalesManager.name },
  ],
  rowId: (row) => row.id,
  searchText: (row) =>
    `${row.number} ${row.customer} ${row.name} ${row.project ?? ''} ${row.documentType}`,
}
