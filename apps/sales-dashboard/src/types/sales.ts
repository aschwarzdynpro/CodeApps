/**
 * Domain model of the GVL sales dashboard (GVL = Gebietsverkaufsleiter).
 *
 * Mirrors the six entities of the legacy model-driven dashboard
 * ("Dashboard GVL" in LegacySolution/): activitypointer, lead, opportunity,
 * wal_project, quote and salesorder — reduced to the columns the legacy
 * views actually displayed.
 *
 * Option-set values are carried as display labels (`string`): live they come
 * from the Dataverse FormattedValue annotations (localized environment
 * labels), in demo mode from the seeded sample data. Everything view logic
 * FILTERS on is additionally modeled as a code-derived, environment-stable
 * field (`open`, `isAppointment`, `statusCategory`, `status` unions for
 * quote/order) so filters never depend on label spelling.
 */

export interface UserRef {
  id: string
  name: string
}

/* ---------------------------------------------------------------- Aktivität */

export interface Activity {
  id: string
  subject: string
  /** Name des Bezugsdatensatzes (regardingobjectid). */
  regarding: string
  /** Anzeige-Label des Aktivitätstyps (z. B. "Termin", "Telefonanruf"). */
  type: string
  /** Logischer Tabellenname des Aktivitätstyps (activitytypecode) — für Deep-Links. */
  typeCode: string
  /** Abgeleitet aus activitytypecode — Basis der "Meine Termine"-Ansicht. */
  isAppointment: boolean
  /** Anzeige-Label des Status (statecode). */
  state: string
  /** statecode ∈ {Open, Scheduled}. */
  open: boolean
  priority: string
  scheduledStart?: string
  /** Fälligkeit; die Legacy-Views filtern auf diesen/letzten Monat oder leer. */
  scheduledEnd?: string
  owner: UserRef
  createdOn: string
  createdBy: UserRef
  /** Teilnehmer (activityparty) — Basis für "Meine Aktivitäten". */
  participantIds: string[]
}

/* --------------------------------------------------------------------- Lead */

export interface Lead {
  id: string
  subject: string
  companyName: string
  fullName: string
  /** Anwendungsbereiche (wal_application_opts, Multiselect-Labels). */
  applications: string[]
  /** Ursprung (wal_leadsource_opt-Label). */
  source: string
  status: string
  /** statecode = 0 (offen / in Bearbeitung). */
  open: boolean
  areaSalesManager: UserRef
  owner: UserRef
  createdOn: string
  createdBy: UserRef
}

/* ------------------------------------------------------------ Verkaufschance */

export interface Opportunity {
  id: string
  number: number
  name: string
  city: string
  account: string
  contact: string
  decisionDate?: string
  estimatedValue: number
  status: string
  /** statecode = 0. */
  open: boolean
  processStage: string
  forecastCategory: string
  areaSalesManager: UserRef
  keyAccountManager: UserRef
  owner: UserRef
  createdOn: string
}

/* ------------------------------------------------------------------- Projekt */

/** Statuscode-Kategorie (Codes aus der Legacy-Solution, env-stabil). */
export type ProjectStatusCategory = 'open' | 'won' | 'lost'

export interface Project {
  id: string
  number: number
  designation: string
  inquiringFirm: string
  endCustomer: string
  city: string
  type: string
  followUpDate?: string
  decisionDate?: string
  estimatedDeliveryDate?: string
  potential: number
  actualRevenue: number
  /** Anzeige-Label des Statusgrunds (statuscode). */
  status: string
  /** open = Neu/Vorphase/In Bearbeitung · won = gewonnen · lost = verloren/zurückgestellt. */
  statusCategory: ProjectStatusCategory
  pspElement: string
  forecastCategory: string
  areaSalesManager: UserRef
  keyAccountManager: UserRef
  projectManager: UserRef
  owner: UserRef
  /** Projektregistrierung erfolgt (wal_projectregistration_bol). */
  registered: boolean
  /** Offene Projektaufgaben, die dem aktuellen Benutzer zugewiesen sind. */
  hasOpenTasksForMe: boolean
  /** Letzter Statuswechsel — Basis für "gewonnen/verloren in diesem Monat". */
  statusChangedOn: string
  createdOn: string
}

/* ------------------------------------------------------------------- Angebot */

/** Aus quote.statecode abgeleitet: 0 Draft, 1 Active, 2 Won, 3 Closed. */
export type QuoteStatus = 'In Bearbeitung' | 'Aktiv' | 'Beauftragt' | 'Abgesagt'

export interface Quote {
  id: string
  number: string
  /** Erstelldatum laut Beleg (wal_creationdate_dat). */
  creationDate: string
  customer: string
  accountNumber: string
  name: string
  project?: string
  pspElement?: string
  orderNumber?: string
  /** Angebotsart (wal_quotekind_str). */
  kind: string
  /** Angebotstyp (wal_quotetype_opt-Label). */
  type: string
  status: QuoteStatus
  totalAmount: number
  owner: UserRef
  /** GVL des Kunden (account.wal_areasalesmanager_id). */
  areaSalesManager: UserRef
  keyAccountManager: UserRef
  opportunity?: string
  createdOn: string
}

/* ------------------------------------------------------------------- Auftrag */

/** Aus salesorder.statecode abgeleitet (Fulfilled/Invoiced → Abgerechnet). */
export type OrderState = 'Aktiv' | 'Übermittelt' | 'Abgerechnet' | 'Storniert'

export interface SalesOrder {
  id: string
  number: string
  creationDate: string
  customer: string
  accountNumber: string
  name: string
  project?: string
  pspElement?: string
  externalOrderNumber?: string
  /** Auftragsart (wal_salesdocumenttype_str). */
  documentType: string
  state: OrderState
  totalAmount: number
  owner: UserRef
  /** GVL des Kunden (account.wal_areasalesmanager_id). */
  areaSalesManager: UserRef
  keyAccountManager: UserRef
  opportunity?: string
  createdOn: string
}

/* ----------------------------------------------------------------- Gesamtbild */

/** Woher der angezeigte Datenbestand stammt (steuert das Badge im Header). */
export type SalesDataSource = 'live' | 'demo' | 'mixed'

export interface SalesData {
  /** Herkunft des Datenbestands. */
  dataSource: SalesDataSource
  /** Angemeldeter Benutzer — das "ich" der "Meine …"-Ansichten. */
  currentUser: UserRef
  /** Alle GVL, die in den Daten vorkommen (für den Demo-Perspektivwechsel). */
  salesManagers: UserRef[]
  activities: Activity[]
  leads: Lead[]
  opportunities: Opportunity[]
  projects: Project[]
  quotes: Quote[]
  orders: SalesOrder[]
}
