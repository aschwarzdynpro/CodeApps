import type {
  Activity,
  Lead,
  Opportunity,
  OrderState,
  Project,
  ProjectStatusCategory,
  Quote,
  QuoteStatus,
  SalesData,
  SalesOrder,
  UserRef,
} from '../types/sales'
import type { SalesService, LoadProgress } from './salesService'
import type { IGetAllOptions } from '../generated/models/CommonModels'
import type { IOperationResult } from '@microsoft/power-apps/data'
import { getContext } from '@microsoft/power-apps/app'
import { powerModeReady } from '../PowerProvider'
import { buildMockData } from './mockData'
import { ActivitypointersService } from '../generated/services/ActivitypointersService'
import { LeadsService } from '../generated/services/LeadsService'
import { OpportunitiesService } from '../generated/services/OpportunitiesService'
import { Wal_projectsService } from '../generated/services/Wal_projectsService'
import { QuotesService } from '../generated/services/QuotesService'
import { SalesordersService } from '../generated/services/SalesordersService'
import { AccountsService } from '../generated/services/AccountsService'
import { SystemusersService } from '../generated/services/SystemusersService'
import { TerritoriesService } from '../generated/services/TerritoriesService'

/**
 * Live implementation of {@link SalesService} against Dataverse (Waldmann).
 *
 * Design (same seam as audit-explorer's dataverseAuditService):
 * - Every call gates on {@link powerModeReady}; outside a Power Apps host the
 *   generated client stalls instead of throwing, so we short-circuit to mock.
 * - Option-set / lookup display labels come from the OData FormattedValue
 *   annotations (localized env labels) — never from hand-maintained maps.
 *   Logic the views FILTER on is derived from raw codes instead (statecode,
 *   statuscode, activitytypecode), so filters are stable across languages.
 * - "Ich" (eq-userid der Legacy-FetchXML): the SDK context only exposes the
 *   Entra object id, so we resolve the Dataverse systemuser once via
 *   `azureactivedirectoryobjectid eq <oid>`.
 * - Angebote/Aufträge: GVL/KAM/Kundennummer hängen am Kunden (account) — die
 *   Code-App-API kann kein $expand, deshalb werden die benötigten Accounts
 *   gezielt nachgeladen und clientseitig gejoint (wie der link-entity-Join
 *   der Legacy-Views).
 * - Fallback: scheitert die Benutzerauflösung, kommt komplett Mock
 *   (dataSource 'demo'); scheitern einzelne Entitäten, bleiben deren
 *   Mock-Zeilen stehen und das Ergebnis wird als 'mixed' markiert.
 *
 * Known approximations vs. legacy (documented limits of the data client):
 * - "Meine Aktivitäten" filtert auf den Besitzer statt auf activityparty
 *   (kein Join auf Beteiligte verfügbar).
 * - Projekt-"GVL im Projektteam" nutzt das Feld wal_areasalesmanager_id
 *   statt der connection-Tabelle.
 * - statusChangedOn ≈ modifiedon; hasOpenTasksForMe bleibt live false, bis
 *   eine task-Datasource ergänzt ist (die Ansicht ist dann leer).
 */

/* --------------------------------------------------------------- Helpers */

type Row = Record<string, unknown>

/** OData annotation suffix carrying option-set / lookup display labels. */
const FV = '@OData.Community.Display.V1.FormattedValue'

function fv(row: Row, column: string): string | undefined {
  const value = row[`${column}${FV}`]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function str(row: Row, column: string): string | undefined {
  const value = row[column]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function num(row: Row, column: string): number {
  const value = row[column]
  return typeof value === 'number' ? value : 0
}

const NO_USER: UserRef = { id: '', name: '–' }

/** Lookup → UserRef: GUID aus `_col_value`, Anzeigename aus der Annotation. */
function userRef(row: Row, column: string): UserRef {
  const id = str(row, `_${column}_value`)
  if (!id) return NO_USER
  return {
    id,
    name: fv(row, `_${column}_value`) ?? str(row, `${column}name`) ?? id,
  }
}

function parseIntOr0(value: string | undefined): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isNaN(n) ? 0 : n
}

function startOfMonthIso(monthOffset: number): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).toISOString()
}

/**
 * Hard ceiling per entity. The connector runtime serves ~500 rows per page;
 * the dashboard is a personal cockpit, so a few pages are plenty — the
 * server-side filters below keep result sets small anyway.
 */
const ROW_CAP = 2_000

interface GetAllCapable<T> {
  getAll(options?: IGetAllOptions): Promise<IOperationResult<T[]>>
}

async function fetchAll<T>(
  service: GetAllCapable<T>,
  options: IGetAllOptions,
  label: string,
): Promise<T[]> {
  const rows: T[] = []
  let skipToken: string | undefined
  do {
    const result = await service.getAll({
      ...options,
      ...(skipToken ? { skipToken } : {}),
    })
    if (!result.success || !result.data) {
      throw new Error(`[sales] ${label}: Abruf fehlgeschlagen — ${String(result.error ?? 'unbekannt')}`)
    }
    rows.push(...result.data)
    skipToken = result.skipToken
  } while (skipToken && rows.length < ROW_CAP)
  if (skipToken) {
    console.warn(`[sales] ${label}: bei ${ROW_CAP} Zeilen gekappt — ältere Datensätze fehlen`)
  }
  return rows
}

/* ------------------------------------------------- Current-User-Auflösung */

async function resolveCurrentUser(): Promise<UserRef | null> {
  const ctx = await getContext()
  const objectId = ctx.user?.objectId
  if (!objectId) {
    console.warn('[sales] Kein Entra objectId im App-Kontext')
    return null
  }
  const result = await SystemusersService.getAll({
    select: ['systemuserid', 'fullname'],
    filter: `azureactivedirectoryobjectid eq ${objectId}`,
    top: 1,
  })
  const row = result.success
    ? (result.data?.[0] as unknown as Row | undefined)
    : undefined
  const id = row ? str(row, 'systemuserid') : undefined
  if (!id) {
    console.warn('[sales] systemuser zur Entra-ID nicht gefunden', result.error)
    return null
  }
  return { id, name: str(row!, 'fullname') ?? ctx.user?.fullName ?? 'Ich' }
}

/* ---------------------------------------------------------------- Mappers */

function toActivity(raw: Row): Activity {
  const stateCode = num(raw, 'statecode')
  const typeCode = str(raw, 'activitytypecode') ?? ''
  const owner = userRef(raw, 'ownerid')
  return {
    id: str(raw, 'activityid') ?? '',
    subject: str(raw, 'subject') ?? '(ohne Betreff)',
    regarding: fv(raw, '_regardingobjectid_value') ?? '',
    type: fv(raw, 'activitytypecode') ?? typeCode,
    typeCode,
    isAppointment: typeCode === 'appointment' || typeCode === 'serviceappointment',
    state: fv(raw, 'statecode') ?? String(stateCode),
    open: stateCode === 0 || stateCode === 3,
    priority: fv(raw, 'prioritycode') ?? '',
    scheduledStart: str(raw, 'scheduledstart'),
    scheduledEnd: str(raw, 'scheduledend'),
    owner,
    createdOn: str(raw, 'createdon') ?? '',
    createdBy: userRef(raw, 'createdby'),
    // Kein activityparty-Zugriff über den Daten-Client — Besitzer ≈ "meine".
    participantIds: [owner.id],
  }
}

function toLead(raw: Row): Lead {
  return {
    id: str(raw, 'leadid') ?? '',
    subject: str(raw, 'subject') ?? '(ohne Thema)',
    companyName: str(raw, 'companyname') ?? '',
    fullName: str(raw, 'fullname') ?? '',
    applications: (fv(raw, 'wal_application_opts') ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean),
    source: fv(raw, 'wal_leadsource_opt') ?? '–',
    status: fv(raw, 'statuscode') ?? '',
    open: num(raw, 'statecode') === 0,
    areaSalesManager: userRef(raw, 'wal_areasalesmanager_id'),
    owner: userRef(raw, 'ownerid'),
    createdOn: str(raw, 'createdon') ?? '',
    createdBy: userRef(raw, 'createdby'),
  }
}

function toOpportunity(raw: Row): Opportunity {
  return {
    id: str(raw, 'opportunityid') ?? '',
    number: parseIntOr0(str(raw, 'wal_opportunitynumber_int')),
    name: str(raw, 'name') ?? '',
    city: str(raw, 'wal_city_txt') ?? '',
    account: fv(raw, '_parentaccountid_value') ?? '',
    contact: fv(raw, '_parentcontactid_value') ?? '',
    decisionDate: str(raw, 'wal_decisiondate_dat'),
    estimatedValue: num(raw, 'estimatedvalue'),
    status: fv(raw, 'statuscode') ?? '',
    open: num(raw, 'statecode') === 0,
    processStage: fv(raw, 'wal_processstage_opt') ?? '',
    forecastCategory: fv(raw, 'msdyn_forecastcategory') ?? 'Ohne Prognose',
    areaSalesManager: userRef(raw, 'wal_areasalesmanager_id'),
    keyAccountManager: userRef(raw, 'wal_keyaccountmanager_id'),
    owner: userRef(raw, 'ownerid'),
    createdOn: str(raw, 'createdon') ?? '',
  }
}

/** Statuscode-Kategorien aus der Legacy-Solution (wal_project, env-stabil). */
const PROJECT_OPEN_CODES = new Set([956980001, 956980002, 956980003])
const PROJECT_WON_CODES = new Set([956980005, 956980008, 956980009])

function toProject(raw: Row): Project {
  const statusCode = num(raw, 'statuscode')
  const statusCategory: ProjectStatusCategory = PROJECT_OPEN_CODES.has(statusCode)
    ? 'open'
    : PROJECT_WON_CODES.has(statusCode)
      ? 'won'
      : 'lost'
  return {
    id: str(raw, 'wal_projectid') ?? '',
    number: parseIntOr0(str(raw, 'wal_projectsnumber_int')),
    designation: str(raw, 'wal_projectdesignation_txt') ?? '',
    inquiringFirm: fv(raw, '_wal_inquiringfirm_id_value') ?? '',
    endCustomer: fv(raw, '_wal_endcustomer_id_value') ?? '',
    city: str(raw, 'wal_city_txt') ?? '',
    type: fv(raw, 'wal_projecttype_opt') ?? '',
    followUpDate: str(raw, 'wal_followupdate_dat'),
    decisionDate: str(raw, 'wal_decisiondate_dat'),
    estimatedDeliveryDate: str(raw, 'wal_estimateddeliverydate_dat'),
    potential: num(raw, 'wal_projectpotential_cur'),
    actualRevenue: num(raw, 'wal_actualrevenue_cur'),
    status: fv(raw, 'statuscode') ?? String(statusCode),
    statusCategory,
    pspElement: str(raw, 'wal_pspelement_txt') ?? '',
    forecastCategory: fv(raw, 'wal_forecastcategory_opt') ?? 'Ohne Prognose',
    areaSalesManager: userRef(raw, 'wal_areasalesmanager_id'),
    keyAccountManager: userRef(raw, 'wal_keyaccountmanager_id'),
    projectManager: userRef(raw, 'wal_projectmanager_id'),
    owner: userRef(raw, 'ownerid'),
    registered: raw['wal_projectregistration_bol'] === true,
    hasOpenTasksForMe: false, // braucht eine task-Datasource; s. Klassendoku
    statusChangedOn: str(raw, 'modifiedon') ?? str(raw, 'createdon') ?? '',
    createdOn: str(raw, 'createdon') ?? '',
  }
}

/** Vom Kunden geerbte Felder (Join über _customerid_value). */
interface AccountInfo {
  number: string
  gvl: UserRef
  kam: UserRef
}

const QUOTE_STATUS_BY_STATE: Record<number, QuoteStatus> = {
  0: 'In Bearbeitung', // Draft
  1: 'Aktiv',
  2: 'Beauftragt', // Won
  3: 'Abgesagt', // Closed
}

function toQuote(raw: Row, accounts: Map<string, AccountInfo>): Quote {
  const account = accounts.get(str(raw, '_customerid_value') ?? '')
  return {
    id: str(raw, 'quoteid') ?? '',
    number: str(raw, 'quotenumber') ?? '',
    creationDate: str(raw, 'wal_creationdate_dat') ?? str(raw, 'createdon') ?? '',
    customer: fv(raw, '_customerid_value') ?? str(raw, 'customeridname') ?? '',
    accountNumber: account?.number ?? '',
    name: str(raw, 'name') ?? '',
    project: fv(raw, '_wal_project_id_value'),
    pspElement: undefined, // hängt am Projekt; Legacy jointe wal_project
    orderNumber: str(raw, 'wal_ordernumber_str'),
    kind: str(raw, 'wal_quotekind_str') ?? '–',
    type: fv(raw, 'wal_quotetype_opt') ?? '',
    status: QUOTE_STATUS_BY_STATE[num(raw, 'statecode')] ?? 'In Bearbeitung',
    totalAmount: num(raw, 'totalamount'),
    owner: userRef(raw, 'ownerid'),
    areaSalesManager: account?.gvl ?? NO_USER,
    keyAccountManager: account?.kam ?? NO_USER,
    opportunity: fv(raw, '_opportunityid_value'),
    createdOn: str(raw, 'createdon') ?? '',
  }
}

const ORDER_STATE_BY_CODE: Record<number, OrderState> = {
  0: 'Aktiv',
  1: 'Übermittelt',
  2: 'Storniert',
  3: 'Abgerechnet', // Fulfilled
  4: 'Abgerechnet', // Invoiced
}

function toOrder(raw: Row, accounts: Map<string, AccountInfo>): SalesOrder {
  const account = accounts.get(str(raw, '_customerid_value') ?? '')
  return {
    id: str(raw, 'salesorderid') ?? '',
    number: str(raw, 'ordernumber') ?? '',
    creationDate: str(raw, 'wal_creationdate_dat') ?? str(raw, 'createdon') ?? '',
    customer: fv(raw, '_customerid_value') ?? str(raw, 'customeridname') ?? '',
    accountNumber: account?.number ?? '',
    name: str(raw, 'name') ?? '',
    project: fv(raw, '_wal_project_id_value'),
    pspElement: undefined,
    externalOrderNumber: str(raw, 'wal_externalordernumber_str'),
    documentType: str(raw, 'wal_salesdocumenttype_str') ?? '–',
    state: ORDER_STATE_BY_CODE[num(raw, 'statecode')] ?? 'Aktiv',
    totalAmount: num(raw, 'totalamount'),
    owner: userRef(raw, 'ownerid'),
    areaSalesManager: account?.gvl ?? NO_USER,
    keyAccountManager: account?.kam ?? NO_USER,
    opportunity: fv(raw, '_opportunityid_value'),
    createdOn: str(raw, 'createdon') ?? '',
  }
}

/* --------------------------------------------------------- Account-Nachladen */

async function fetchAccountInfos(
  accountIds: ReadonlySet<string>,
): Promise<Map<string, AccountInfo>> {
  const map = new Map<string, AccountInfo>()
  const ids = [...accountIds].filter(Boolean)
  const CHUNK = 25
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const rows = await fetchAll<Row>(
      AccountsService as unknown as GetAllCapable<Row>,
      {
        select: [
          'accountid',
          'accountnumber',
          '_wal_areasalesmanager_id_value',
          '_wal_keyaccountmanager_id_value',
        ],
        filter: chunk.map((id) => `accountid eq ${id}`).join(' or '),
      },
      'accounts',
    )
    for (const row of rows) {
      const id = str(row, 'accountid')
      if (!id) continue
      map.set(id, {
        number: str(row, 'accountnumber') ?? '',
        gvl: userRef(row, 'wal_areasalesmanager_id'),
        kam: userRef(row, 'wal_keyaccountmanager_id'),
      })
    }
  }
  return map
}

/* ----------------------------------------------------------------- Service */

/** Anzeigenamen der nachgeladenen Bereiche (für das Fortschritts-Overlay). */
const PROGRESS_LABELS: Record<string, string> = {
  activities: 'Aktivitäten',
  leads: 'Leads',
  opportunities: 'Verkaufschancen',
  projects: 'Projekte',
  quotes: 'Angebote',
  orders: 'Aufträge',
}
/** Anzahl der gemeldeten Lade-Schritte = die sechs Bereiche. */
const PROGRESS_TOTAL = 6

export class DataverseSalesService implements SalesService {
  async load(gvlId?: string, onProgress?: LoadProgress): Promise<SalesData> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return buildMockData()

    const me = await resolveCurrentUser().catch((err) => {
      console.warn('[sales] Benutzerauflösung fehlgeschlagen:', err)
      return null
    })
    if (!me) {
      // Ohne Dataverse-Benutzer keine "Meine …"-Semantik — komplette Demo.
      console.warn('[sales] Fallback auf Demo-Daten (kein systemuser)')
      return buildMockData()
    }

    // Aus wessen Sicht wird geladen? Ohne GVL-Auswahl der angemeldete Benutzer
    // (Standard); mit Auswahl die gewählte GVL — alle personenbezogenen
    // Serverfilter unten beziehen sich auf diese Identität.
    const subjectId = gvlId ?? me.id

    const mock = buildMockData()
    let anyFailed = false
    let anySucceeded = false

    // Ladefortschritt: 0 von 6, dann je fertigem Bereich +1 (für das Overlay).
    let progressDone = 0
    onProgress?.(0, PROGRESS_TOTAL)

    /** Eine Entität laden; bei Fehlern den Fallback (Demo-Zeilen) behalten. */
    const part = async <R,>(label: string, loader: () => Promise<R>, fallback: R): Promise<R> => {
      try {
        const rows = await loader()
        anySucceeded = true
        console.info(`[sales] ${label}: ${Array.isArray(rows) ? rows.length : 0} Zeilen (live)`)
        return rows
      } catch (err) {
        anyFailed = true
        console.warn(`[sales] ${label}: Fallback auf Demo —`, err)
        return fallback
      } finally {
        progressDone += 1
        onProgress?.(progressDone, PROGRESS_TOTAL, PROGRESS_LABELS[label])
      }
    }

    const windowStart = startOfMonthIso(-1) // dieser + letzter Monat

    const [activities, leads, opportunities, projects] = await Promise.all([
      part(
        'activities',
        async () =>
          (
            await fetchAll<Row>(
              ActivitypointersService as unknown as GetAllCapable<Row>,
              {
                select: [
                  'activityid',
                  'subject',
                  'activitytypecode',
                  'statecode',
                  'prioritycode',
                  'scheduledstart',
                  'scheduledend',
                  'createdon',
                  '_regardingobjectid_value',
                  '_ownerid_value',
                  '_createdby_value',
                ],
                // Legacy-Fenster: Fälligkeit dieser/letzter Monat oder leer.
                filter: `_ownerid_value eq ${subjectId} and (scheduledend ge ${windowStart} or scheduledend eq null)`,
                orderBy: ['scheduledend asc'],
              },
              'activities',
            )
          ).map(toActivity),
        mock.activities,
      ),
      part(
        'leads',
        async () =>
          (
            await fetchAll<Row>(
              LeadsService as unknown as GetAllCapable<Row>,
              {
                select: [
                  'leadid',
                  'subject',
                  'companyname',
                  'fullname',
                  'statecode',
                  'statuscode',
                  'createdon',
                  'wal_application_opts',
                  'wal_leadsource_opt',
                  '_ownerid_value',
                  '_createdby_value',
                  '_wal_areasalesmanager_id_value',
                ],
                // Legacy-View: meine offenen Leads.
                filter: `_ownerid_value eq ${subjectId} and statecode eq 0`,
                orderBy: ['createdon desc'],
              },
              'leads',
            )
          ).map(toLead),
        mock.leads,
      ),
      part(
        'opportunities',
        async () =>
          (
            await fetchAll<Row>(
              OpportunitiesService as unknown as GetAllCapable<Row>,
              {
                select: [
                  'opportunityid',
                  'name',
                  'wal_opportunitynumber_int',
                  'wal_city_txt',
                  'wal_decisiondate_dat',
                  'estimatedvalue',
                  'statecode',
                  'statuscode',
                  'wal_processstage_opt',
                  'msdyn_forecastcategory',
                  'createdon',
                  '_parentaccountid_value',
                  '_parentcontactid_value',
                  '_ownerid_value',
                  '_wal_areasalesmanager_id_value',
                  '_wal_keyaccountmanager_id_value',
                ],
                // Legacy-View: offen + ich als GVL (Datumsfenster filtert die Ansicht).
                filter: `_wal_areasalesmanager_id_value eq ${subjectId} and statecode eq 0`,
                orderBy: ['wal_decisiondate_dat asc'],
              },
              'opportunities',
            )
          ).map(toOpportunity),
        mock.opportunities,
      ),
      part(
        'projects',
        async () =>
          (
            await fetchAll<Row>(
              Wal_projectsService as unknown as GetAllCapable<Row>,
              {
                select: [
                  'wal_projectid',
                  'wal_projectsnumber_int',
                  'wal_projectdesignation_txt',
                  'wal_city_txt',
                  'wal_projecttype_opt',
                  'wal_followupdate_dat',
                  'wal_decisiondate_dat',
                  'wal_estimateddeliverydate_dat',
                  'wal_projectpotential_cur',
                  'wal_actualrevenue_cur',
                  'statuscode',
                  'wal_pspelement_txt',
                  'wal_forecastcategory_opt',
                  'wal_projectregistration_bol',
                  'createdon',
                  'modifiedon',
                  '_wal_inquiringfirm_id_value',
                  '_wal_endcustomer_id_value',
                  '_wal_areasalesmanager_id_value',
                  '_wal_keyaccountmanager_id_value',
                  '_wal_projectmanager_id_value',
                  '_ownerid_value',
                ],
                // Offene Projekte komplett; gewonnene/verlorene nur mit
                // Statuswechsel im Monatsfenster (≈ modifiedon).
                filter:
                  `_wal_areasalesmanager_id_value eq ${subjectId} and ` +
                  `(statuscode eq 956980001 or statuscode eq 956980002 or statuscode eq 956980003 or modifiedon ge ${windowStart})`,
                orderBy: ['wal_projectsnumber_int asc'],
              },
              'projects',
            )
          ).map(toProject),
        mock.projects,
      ),
    ])

    // Angebote/Aufträge: Monatsfenster (dieser + letzter Monat für KPI-Trend),
    // danach Kunden-Join für GVL/KAM/Kundennummer.
    const [quoteRows, orderRows] = await Promise.all([
      part(
        'quotes',
        () =>
          fetchAll<Row>(
            QuotesService as unknown as GetAllCapable<Row>,
            {
              select: [
                'quoteid',
                'quotenumber',
                'name',
                'totalamount',
                'statecode',
                'wal_quotekind_str',
                'wal_quotetype_opt',
                'wal_ordernumber_str',
                'wal_creationdate_dat',
                'createdon',
                '_customerid_value',
                '_wal_project_id_value',
                '_opportunityid_value',
                '_ownerid_value',
              ],
              filter: `wal_creationdate_dat ge ${windowStart}`,
              orderBy: ['wal_creationdate_dat desc'],
            },
            'quotes',
          ),
        null,
      ),
      part(
        'orders',
        () =>
          fetchAll<Row>(
            SalesordersService as unknown as GetAllCapable<Row>,
            {
              select: [
                'salesorderid',
                'ordernumber',
                'name',
                'totalamount',
                'statecode',
                'wal_salesdocumenttype_str',
                'wal_externalordernumber_str',
                'wal_creationdate_dat',
                'createdon',
                '_customerid_value',
                '_wal_project_id_value',
                '_opportunityid_value',
                '_ownerid_value',
              ],
              filter: `wal_creationdate_dat ge ${windowStart}`,
              orderBy: ['wal_creationdate_dat desc'],
            },
            'orders',
          ),
        null,
      ),
    ])

    let quotes = mock.quotes
    let orders = mock.orders
    if (quoteRows || orderRows) {
      const customerIds = new Set<string>()
      for (const row of [...(quoteRows ?? []), ...(orderRows ?? [])]) {
        const id = str(row, '_customerid_value')
        if (id) customerIds.add(id)
      }
      const accounts = await fetchAccountInfos(customerIds).catch((err) => {
        console.warn('[sales] accounts: Join nicht möglich —', err)
        return new Map<string, AccountInfo>()
      })
      if (quoteRows) quotes = quoteRows.map((row) => toQuote(row, accounts))
      if (orderRows) orders = orderRows.map((row) => toOrder(row, accounts))
    }

    if (!anySucceeded) {
      console.warn('[sales] Keine Entität live ladbar — komplette Demo')
      return mock
    }

    return {
      dataSource: anyFailed ? 'mixed' : 'live',
      currentUser: me,
      salesManagers: [me],
      activities,
      leads,
      opportunities,
      projects,
      quotes,
      orders,
    }
  }

  /**
   * GVL-Kandidaten für das Suchfeld = Manager eines Territory
   * (territory.managerid → systemuser). Distinct nach Benutzer, nach Name
   * sortiert. Außerhalb eines Power-Apps-Hosts liefern wir die Demo-GVL, damit
   * die Suche auch im lokalen Dev funktioniert; bei Fehlern eine leere Liste
   * (das Dashboard bleibt nutzbar, nur die Auswahl ist leer).
   */
  async listSalesManagers(): Promise<UserRef[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return buildMockData().salesManagers
    try {
      const rows = await fetchAll<Row>(
        TerritoriesService as unknown as GetAllCapable<Row>,
        {
          select: ['territoryid', 'name', '_managerid_value'],
          filter: '_managerid_value ne null',
          orderBy: ['name asc'],
        },
        'territories',
      )
      const byId = new Map<string, UserRef>()
      for (const row of rows) {
        const gvl = userRef(row, 'managerid')
        if (gvl.id && !byId.has(gvl.id)) byId.set(gvl.id, gvl)
      }
      return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))
    } catch (err) {
      console.warn('[sales] Territory-Manager nicht ladbar —', err)
      return []
    }
  }
}

export const dataverseSalesService = new DataverseSalesService()
