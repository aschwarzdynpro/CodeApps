import type {
  Activity,
  Lead,
  Opportunity,
  Project,
  ProjectStatusCategory,
  Quote,
  QuoteStatus,
  SalesData,
  SalesOrder,
  UserRef,
} from '../types/sales'

/**
 * Deterministic demo data for the GVL dashboard.
 *
 * Seeded PRNG → every reload shows the same records; dates are generated
 * relative to "today" so the month-bound legacy views ("dieser Monat",
 * "letzter Monat", "Entscheidung in 2 Monaten") always have content,
 * no matter when the app is opened.
 */

/* ------------------------------------------------------------------ PRNG */

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = mulberry32(20260612)

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]
const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
const chance = (p: number) => rng() < p
/** Betrag auf "glatte" Hunderter runden, wirkt realistischer als Zufallscents. */
const amount = (min: number, max: number) => Math.round(int(min, max) / 100) * 100

/* ----------------------------------------------------------------- Termine */

const NOW = new Date()

function iso(d: Date): string {
  return d.toISOString()
}

function dayInMonth(monthOffset: number): string {
  const base = new Date(NOW.getFullYear(), NOW.getMonth() + monthOffset, 1)
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  base.setDate(int(1, lastDay))
  base.setHours(int(7, 17), pick([0, 15, 30, 45] as const), 0, 0)
  return iso(base)
}

function daysAgo(days: number): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() - days)
  d.setHours(int(7, 17), pick([0, 15, 30, 45] as const), 0, 0)
  return iso(d)
}

/* ---------------------------------------------------------------- Personen */

const GVL: UserRef[] = [
  { id: 'u-vogel', name: 'Andrea Vogel' },
  { id: 'u-brandt', name: 'Markus Brandt' },
  { id: 'u-krueger', name: 'Stefanie Krüger' },
  { id: 'u-lehmann', name: 'Tobias Lehmann' },
]
const KAM: UserRef[] = [
  { id: 'u-winter', name: 'Claudia Winter' },
  { id: 'u-hoffmann', name: 'Jens Hoffmann' },
]
const PM: UserRef[] = [
  { id: 'u-schubert', name: 'Ralf Schubert' },
  { id: 'u-albrecht', name: 'Miriam Albrecht' },
]

/** Der angemeldete Demo-Benutzer — das "ich" aller "Meine …"-Ansichten. */
export const CURRENT_USER = GVL[0]

/** GVL[0] in ~45 % der Fälle, damit die "Meine"-Ansichten gut gefüllt sind. */
const someGvl = (): UserRef => (chance(0.45) ? GVL[0] : pick(GVL.slice(1)))

/* ------------------------------------------------------------------ Kunden */

interface Account {
  name: string
  number: string
  city: string
  gvl: UserRef
  kam: UserRef
}

const ACCOUNT_SOURCE: ReadonlyArray<[string, string]> = [
  ['Häberle Maschinenbau GmbH', 'Heilbronn'],
  ['Nordmann Logistik AG', 'Hamburg'],
  ['Steiner Fördertechnik KG', 'Linz'],
  ['Brunner & Söhne GmbH', 'Nürnberg'],
  ['Vollmer Verpackungssysteme', 'Bielefeld'],
  ['Rheintal Pharma GmbH', 'Basel'],
  ['Ostwind Energie AG', 'Rostock'],
  ['Krämer Lebensmittelwerke', 'Fulda'],
  ['TechParts Automotive GmbH', 'Ingolstadt'],
  ['Seehafen Umschlag GmbH', 'Bremerhaven'],
  ['Alpenland Getränke AG', 'Innsbruck'],
  ['Weserstahl GmbH & Co. KG', 'Minden'],
]

const ACCOUNTS: Account[] = ACCOUNT_SOURCE.map(([name, city], i) => ({
  name,
  number: `K-${10240 + i * 37}`,
  city,
  gvl: someGvl(),
  kam: pick(KAM),
}))

const someAccount = (): Account => {
  if (chance(0.45)) {
    const mine = ACCOUNTS.filter((a) => a.gvl.id === CURRENT_USER.id)
    if (mine.length > 0) return pick(mine)
  }
  return pick(ACCOUNTS)
}

/* ------------------------------------------------------------- Aktivitäten */

const ACTIVITY_SUBJECTS = [
  'Nachfass Angebot',
  'Projektbesprechung Layout',
  'Telefonat Budgetfreigabe',
  'Vor-Ort-Termin Aufmaß',
  'Abstimmung Lastenheft',
  'Erinnerung Wartungsvertrag',
  'Klärung Liefertermin',
  'Präsentation Konzept',
  'Rückruf Einkauf',
  'Übergabe Service',
]

function buildActivities(): Activity[] {
  const result: Activity[] = []
  for (let i = 0; i < 52; i++) {
    const account = pick(ACCOUNTS)
    const type = pick(['Telefonat', 'E-Mail', 'Termin', 'Termin', 'Aufgabe', 'Brief'] as const)
    const typeCode = {
      Telefonat: 'phonecall',
      'E-Mail': 'email',
      Termin: 'appointment',
      Aufgabe: 'task',
      Brief: 'letter',
    }[type]
    const state = pick(['Offen', 'Offen', 'Offen', 'Geplant', 'Abgeschlossen', 'Abgebrochen'] as const)
    // Fälligkeit: dieser Monat / letzter Monat / ohne — exakt das Fenster der
    // Legacy-View ("this-month | last-month | null").
    const bucket = rng()
    const scheduledEnd =
      bucket < 0.45 ? dayInMonth(0) : bucket < 0.8 ? dayInMonth(-1) : undefined
    const scheduledStart = scheduledEnd
      ? iso(new Date(new Date(scheduledEnd).getTime() - int(1, 4) * 3_600_000))
      : undefined
    const owner = someGvl()
    const participantIds = [owner.id]
    if (chance(0.55) && owner.id !== CURRENT_USER.id)
      participantIds.push(CURRENT_USER.id)
    if (chance(0.3)) participantIds.push(pick(KAM).id)
    result.push({
      id: `act-${i + 1}`,
      subject: `${pick(ACTIVITY_SUBJECTS)} – ${account.name.split(' ')[0]}`,
      regarding: account.name,
      type,
      typeCode,
      isAppointment: type === 'Termin',
      state,
      open: state === 'Offen' || state === 'Geplant',
      priority: pick(['Niedrig', 'Normal', 'Normal', 'Hoch'] as const),
      scheduledStart,
      scheduledEnd,
      owner,
      createdOn: daysAgo(int(0, 60)),
      createdBy: pick([...GVL, ...KAM]),
      participantIds,
    })
  }
  return result
}

/* ------------------------------------------------------------------- Leads */

const LEAD_TOPICS = [
  'Anfrage Lagerautomatisierung',
  'Interesse Palettiertechnik',
  'Neubau Distributionszentrum',
  'Erweiterung Kommissionierung',
  'Ersatz Altanlage',
  'Anfrage Servicevertrag',
]
const APPLICATIONS = [
  'Intralogistik',
  'Fördertechnik',
  'Verpackung',
  'Palettierung',
  'Tiefkühllogistik',
  'Produktionsversorgung',
]
const FIRST_NAMES = ['Anna', 'Lars', 'Petra', 'Holger', 'Sabine', 'Frank', 'Julia', 'Dirk']
const LAST_NAMES = ['Maier', 'Schulte', 'Berger', 'Wolf', 'Neumann', 'Fink', 'Sommer', 'Busch']

function buildLeads(): Lead[] {
  const result: Lead[] = []
  for (let i = 0; i < 28; i++) {
    const company = `${pick(LAST_NAMES)} ${pick(['Industrietechnik', 'Logistik', 'Systeme', 'Anlagenbau'])} ${pick(['GmbH', 'AG', 'KG'])}`
    result.push({
      id: `lead-${i + 1}`,
      subject: pick(LEAD_TOPICS),
      companyName: company,
      fullName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      applications: [...new Set([pick(APPLICATIONS), pick(APPLICATIONS)])],
      source: pick([
        'Messe',
        'Messe',
        'Webseite',
        'Empfehlung',
        'Kaltakquise',
        'Bestandskunde',
        'Partner',
      ] as const),
      status: pick(['Neu', 'Neu', 'Kontaktiert', 'Kontaktiert', 'Qualifiziert'] as const),
      open: chance(0.85),
      areaSalesManager: someGvl(),
      owner: someGvl(),
      createdOn: daysAgo(int(0, 75)),
      createdBy: pick(GVL),
    })
  }
  return result
}

/* --------------------------------------------------------- Verkaufschancen */

const FORECAST_OPEN = ['Pipeline', 'Pipeline', 'Bester Fall', 'Zugesagt'] as const
const STAGES = ['Qualifizierung', 'Konzept', 'Angebot', 'Verhandlung', 'Abschluss'] as const

function buildOpportunities(): Opportunity[] {
  const result: Opportunity[] = []
  for (let i = 0; i < 24; i++) {
    const account = someAccount()
    const open = chance(0.8)
    // Entscheidungsdatum: überfällig / dieser Monat / +1 / +2 / außerhalb.
    const monthOffset = pick([-1, 0, 0, 1, 1, 2, 4] as const)
    result.push({
      id: `opp-${i + 1}`,
      number: 30100 + i,
      name: `${pick(['Neuanlage', 'Erweiterung', 'Modernisierung'])} ${pick(['Lager', 'Förderstrecke', 'Palettierung', 'Sortierung'])} ${account.city}`,
      city: account.city,
      account: account.name,
      contact: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      decisionDate: chance(0.9) ? dayInMonth(monthOffset) : undefined,
      estimatedValue: amount(80_000, 2_400_000),
      status: open ? 'In Bearbeitung' : pick(['Gewonnen', 'Verloren'] as const),
      open,
      processStage: pick(STAGES),
      forecastCategory: open ? pick(FORECAST_OPEN) : 'Gewonnen',
      areaSalesManager: account.gvl,
      keyAccountManager: account.kam,
      owner: account.gvl,
      createdOn: daysAgo(int(5, 120)),
    })
  }
  return result
}

/* ---------------------------------------------------------------- Projekte */

const DESIGNATIONS = [
  'Hochregallager',
  'Förderstrecke',
  'Palettierer',
  'Kommissionierung',
  'Sortieranlage',
  'Verpackungslinie',
  'Retrofit Steuerung',
  'Shuttle-System',
  'Tiefkühllager',
  'AKL-Anlage',
]

/** Statusgrund-Label + env-stabile Kategorie, gewichtet wie eine echte Pipeline. */
const PROJECT_STATUSES: ReadonlyArray<[string, ProjectStatusCategory]> = [
  ['Neu', 'open'],
  ['Vorphase', 'open'],
  ['Vorphase', 'open'],
  ['In Bearbeitung', 'open'],
  ['In Bearbeitung', 'open'],
  ['In Bearbeitung', 'open'],
  ['Offen gewonnen', 'won'],
  ['Geschlossen gewonnen', 'won'],
  ['Verloren', 'lost'],
  ['Zurückgestellt', 'lost'],
]

function buildProjects(): Project[] {
  const result: Project[] = []
  for (let i = 0; i < 30; i++) {
    const account = someAccount()
    const endCustomer = chance(0.4) ? pick(ACCOUNTS).name : account.name
    const [status, statusCategory] = pick(PROJECT_STATUSES)
    const isOpen = statusCategory === 'open'
    const won = statusCategory === 'won'
    const potential = amount(150_000, 4_800_000)
    result.push({
      id: `prj-${i + 1}`,
      number: 70500 + i,
      designation: pick(DESIGNATIONS),
      inquiringFirm: account.name,
      endCustomer,
      city: account.city,
      type: pick(['Neuanlage', 'Neuanlage', 'Erweiterung', 'Modernisierung', 'Service'] as const),
      followUpDate: isOpen && chance(0.6) ? dayInMonth(chance(0.6) ? 0 : 1) : undefined,
      decisionDate: chance(0.85) ? dayInMonth(pick([-1, 0, 0, 1, 2, 3] as const)) : undefined,
      estimatedDeliveryDate: chance(0.7) ? dayInMonth(int(2, 8)) : undefined,
      potential,
      actualRevenue: won ? Math.round(potential * (0.7 + rng() * 0.3)) : 0,
      status,
      statusCategory,
      pspElement: `P-${int(100, 999)}.${int(10, 99)}`,
      forecastCategory: won
        ? 'Gewonnen'
        : statusCategory === 'lost'
          ? 'Ausgelassen'
          : pick(FORECAST_OPEN),
      areaSalesManager: account.gvl,
      keyAccountManager: account.kam,
      projectManager: pick(PM),
      owner: account.gvl,
      registered: chance(0.7),
      hasOpenTasksForMe: isOpen && account.gvl.id === CURRENT_USER.id && chance(0.45),
      // Gewonnen/verloren überwiegend in diesem Monat, damit die
      // Monats-Views der Legacy-Lösung gefüllt sind.
      statusChangedOn: isOpen ? daysAgo(int(0, 45)) : dayInMonth(chance(0.7) ? 0 : -1),
      createdOn: daysAgo(int(10, 180)),
    })
  }
  return result
}

/* ---------------------------------------------------------------- Angebote */

function buildQuotes(projects: Project[]): Quote[] {
  const result: Quote[] = []
  for (let i = 0; i < 26; i++) {
    const account = someAccount()
    const status: QuoteStatus = pick([
      'In Bearbeitung',
      'In Bearbeitung',
      'Aktiv',
      'Aktiv',
      'Aktiv',
      'Beauftragt',
      'Abgesagt',
    ] as const)
    const project = chance(0.6) ? pick(projects) : undefined
    const monthOffset = pick([0, 0, 0, 0, -1, -1, -2] as const)
    const creationDate = dayInMonth(monthOffset)
    result.push({
      id: `quo-${i + 1}`,
      number: `AN-${26100 + i * 3}`,
      creationDate,
      customer: account.name,
      accountNumber: account.number,
      name: project
        ? `${project.designation} ${account.city}`
        : `${pick(['Serviceeinsatz', 'Ersatzteilpaket', 'Wartung'])} ${account.name.split(' ')[0]}`,
      project: project ? `P-${project.number}` : undefined,
      pspElement: project?.pspElement,
      orderNumber: status === 'Beauftragt' ? `AB-${41000 + i * 7}` : undefined,
      kind: pick(['Erstangebot', 'Erstangebot', 'Folgeangebot', 'Budgetangebot', 'Revision'] as const),
      type: project
        ? 'Projektangebot'
        : pick(['Serviceangebot', 'Ersatzteilangebot'] as const),
      status,
      totalAmount: amount(12_000, 980_000),
      owner: account.gvl,
      areaSalesManager: account.gvl,
      keyAccountManager: account.kam,
      opportunity: chance(0.5) ? `VC-${30100 + int(0, 23)}` : undefined,
      createdOn: creationDate,
    })
  }

  // Garantierte Treffer für die Monats-Views "Beauftragt" und "Abgesagt"
  // (mit zufälliger Verteilung liefe die Demo dort sonst oft leer).
  const forced: ReadonlyArray<[QuoteStatus, number]> = [
    ['Beauftragt', 0],
    ['Beauftragt', 1],
    ['Abgesagt', 2],
  ]
  for (const [status, n] of forced) {
    const project = pick(projects)
    const creationDate = dayInMonth(0)
    result.push({
      id: `quo-f${n}`,
      number: `AN-${26900 + n}`,
      creationDate,
      customer: project.inquiringFirm,
      accountNumber: `K-${10980 + n}`,
      name: `${project.designation} ${project.city}`,
      project: `P-${project.number}`,
      pspElement: project.pspElement,
      orderNumber: status === 'Beauftragt' ? `AB-${41900 + n}` : undefined,
      kind: pick(['Erstangebot', 'Folgeangebot', 'Revision'] as const),
      type: 'Projektangebot',
      status,
      totalAmount: amount(45_000, 720_000),
      owner: CURRENT_USER,
      areaSalesManager: CURRENT_USER,
      keyAccountManager: pick(KAM),
      opportunity: undefined,
      createdOn: creationDate,
    })
  }
  return result
}

/* ---------------------------------------------------------------- Aufträge */

function buildOrders(projects: Project[]): SalesOrder[] {
  const result: SalesOrder[] = []
  for (let i = 0; i < 20; i++) {
    const account = someAccount()
    const documentType = pick([
      'Auftrag',
      'Auftrag',
      'Projektauftrag',
      'Projektauftrag',
      'Serviceauftrag',
      'Ersatzteilauftrag',
    ] as const)
    const project = documentType === 'Projektauftrag' ? pick(projects) : undefined
    const monthOffset = pick([0, 0, 0, 0, -1, -1, -2] as const)
    const creationDate = dayInMonth(monthOffset)
    result.push({
      id: `ord-${i + 1}`,
      number: `AB-${52300 + i * 5}`,
      creationDate,
      customer: account.name,
      accountNumber: account.number,
      name: project
        ? `${project.designation} ${account.city}`
        : `${pick(['Serviceeinsatz', 'Ersatzteillieferung', 'Inspektion'])} ${account.name.split(' ')[0]}`,
      project: project ? `P-${project.number}` : undefined,
      pspElement: project?.pspElement,
      externalOrderNumber: chance(0.7) ? `BE-${int(100_000, 999_999)}` : undefined,
      documentType,
      state: pick(['Aktiv', 'Aktiv', 'Übermittelt', 'Abgerechnet'] as const),
      totalAmount: amount(15_000, 1_600_000),
      owner: account.gvl,
      areaSalesManager: account.gvl,
      keyAccountManager: account.kam,
      opportunity: chance(0.4) ? `VC-${30100 + int(0, 23)}` : undefined,
      createdOn: creationDate,
    })
  }
  return result
}

/* ------------------------------------------------------------------ Export */

export function buildMockData(): SalesData {
  const projects = buildProjects()
  return {
    dataSource: 'demo',
    currentUser: CURRENT_USER,
    salesManagers: GVL,
    activities: buildActivities(),
    leads: buildLeads(),
    opportunities: buildOpportunities(),
    projects,
    quotes: buildQuotes(projects),
    orders: buildOrders(projects),
  }
}
