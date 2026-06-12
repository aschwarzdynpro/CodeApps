/**
 * Domain model of the GVL sales dashboard (GVL = Gebietsverkaufsleiter).
 *
 * Mirrors the six entities of the legacy model-driven dashboard
 * ("Dashboard GVL" in LegacySolution/): activitypointer, lead, opportunity,
 * wal_project, quote and salesorder — reduced to the columns the legacy
 * views actually displayed. Option-set values are carried as German display
 * labels because the dashboard is a read-only visualization; the live
 * Dataverse mapping translates codes to these labels in one place.
 */

export interface UserRef {
  id: string
  name: string
}

/* ---------------------------------------------------------------- Aktivität */

export type ActivityType = 'Telefonat' | 'E-Mail' | 'Termin' | 'Aufgabe' | 'Brief'
export type ActivityState = 'Offen' | 'Geplant' | 'Abgeschlossen' | 'Abgebrochen'
export type ActivityPriority = 'Niedrig' | 'Normal' | 'Hoch'

export interface Activity {
  id: string
  subject: string
  /** Name des Bezugsdatensatzes (regardingobjectid). */
  regarding: string
  type: ActivityType
  state: ActivityState
  priority: ActivityPriority
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

export type LeadStatus = 'Neu' | 'Kontaktiert' | 'Qualifiziert'
export type LeadSource =
  | 'Messe'
  | 'Webseite'
  | 'Empfehlung'
  | 'Kaltakquise'
  | 'Bestandskunde'
  | 'Partner'

export interface Lead {
  id: string
  subject: string
  companyName: string
  fullName: string
  /** Anwendungsbereiche (wal_application_opts, Multiselect). */
  applications: string[]
  source: LeadSource
  status: LeadStatus
  /** statecode = 0 (offen / in Bearbeitung). */
  open: boolean
  areaSalesManager: UserRef
  owner: UserRef
  createdOn: string
  createdBy: UserRef
}

/* ------------------------------------------------------------ Verkaufschance */

export type ForecastCategory =
  | 'Pipeline'
  | 'Bester Fall'
  | 'Zugesagt'
  | 'Gewonnen'
  | 'Ausgelassen'

export type OpportunityStage =
  | 'Qualifizierung'
  | 'Konzept'
  | 'Angebot'
  | 'Verhandlung'
  | 'Abschluss'

export interface Opportunity {
  id: string
  number: number
  name: string
  city: string
  account: string
  contact: string
  decisionDate?: string
  estimatedValue: number
  status: 'In Bearbeitung' | 'Gewonnen' | 'Verloren'
  open: boolean
  processStage: OpportunityStage
  forecastCategory: ForecastCategory
  areaSalesManager: UserRef
  keyAccountManager: UserRef
  owner: UserRef
  createdOn: string
}

/* ------------------------------------------------------------------- Projekt */

export type ProjectStatus =
  | 'Neu'
  | 'Vorphase'
  | 'In Bearbeitung'
  | 'Offen gewonnen'
  | 'Geschlossen gewonnen'
  | 'Verloren'
  | 'Zurückgestellt'

export type ProjectType = 'Neuanlage' | 'Erweiterung' | 'Modernisierung' | 'Service'

export interface Project {
  id: string
  number: number
  designation: string
  inquiringFirm: string
  endCustomer: string
  city: string
  type: ProjectType
  followUpDate?: string
  decisionDate?: string
  estimatedDeliveryDate?: string
  potential: number
  actualRevenue: number
  status: ProjectStatus
  pspElement: string
  forecastCategory: ForecastCategory
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

export type QuoteKind = 'Erstangebot' | 'Folgeangebot' | 'Budgetangebot' | 'Revision'
export type QuoteType = 'Projektangebot' | 'Serviceangebot' | 'Ersatzteilangebot'
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
  kind: QuoteKind
  type: QuoteType
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

export type OrderDocumentType =
  | 'Auftrag'
  | 'Projektauftrag'
  | 'Serviceauftrag'
  | 'Ersatzteilauftrag'

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
  documentType: OrderDocumentType
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

export interface SalesData {
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
