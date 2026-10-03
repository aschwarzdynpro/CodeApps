import type { AppRecord, ChoiceGroup, ComponentInfo, ComponentKind, FormRecord, Lcid, SolutionRef, ViewRecord } from '../types/translation'
import { encodeXmlAttr, encodeXmlText } from '../utils/spreadsheetXml'

/**
 * Synthetic translation data for the mock: fictitious `pro_` tables of a
 * fleet scenario in en/de/fr with built-in gaps — no customer data. Labels
 * live in a store keyed like the export (table + object id + column), so an
 * import into one solution shows up in every other export, as in Dataverse.
 * The file layout mirrors a real export (checked 2026-10-03): `Entity name`
 * is the table's logical name, the kind follows from `Object Column Name`.
 */

export const MOCK_BASE: Lcid = 1033
export const MOCK_LANGUAGES: Lcid[] = [1033, 1031, 1036]

export interface MockLabel {
  sheet: 'Localized Labels' | 'Display Strings'
  /** `Entity name`: the table's logical name ('' on Display Strings). */
  type: string
  objectId: string
  column: string
  table: string
  name: string
  texts: Record<Lcid, string>
  /** Kind the metadata reports where the file can't tell (choice value, form, view). */
  kind?: ComponentKind
  formType?: number
  /** Solutions a label without table belongs to (app, sitemap). */
  solutions?: string[]
}

/** A view with its columns (cell names as in layoutxml; `alias.attribute` for linked columns). */
export interface MockView {
  id: string
  table: string
  name: string
  columns: string[]
}

/** A form with its layout; the formxml is rendered from the current label texts. */
export interface MockForm {
  id: string
  table: string
  name: string
  type: number
  header: MockCell[]
  tabs: { id: string; name: string; sections: { id: string; name: string; columns: number; showLabel: boolean; cells: MockCell[] }[] }[]
}

interface MockCell {
  id: string
  field: string
  control: 'field' | 'subgrid'
}

type Tri = [en: string, de: string, fr: string]

const TABLES: { name: string; one: Tri; many: Tri; fields: string[] }[] = [
  { name: 'pro_vehicle', one: ['Vehicle', 'Fahrzeug', 'Véhicule'], many: ['Vehicles', 'Fahrzeuge', 'Véhicules'], fields: ['license', 'manufacturer', 'model', 'year', 'mileage', 'fuel', 'capacity', 'weight', 'color', 'nextinspection', 'site', 'warranty'] },
  { name: 'pro_inspection', one: ['Inspection', 'Prüfung', 'Inspection'], many: ['Inspections', 'Prüfungen', 'Inspections'], fields: ['vehicle', 'inspector', 'result', 'duedate', 'completedon', 'mileage', 'notes', 'priority', 'location'] },
  { name: 'pro_damage', one: ['Damage Report', 'Schadensmeldung', 'Déclaration de sinistre'], many: ['Damage Reports', 'Schadensmeldungen', 'Déclarations de sinistre'], fields: ['vehicle', 'category', 'amount', 'currency', 'priority', 'location', 'approved', 'approvedby', 'approvedon', 'notes', 'reference'] },
  { name: 'pro_tour', one: ['Tour', 'Tour', 'Tournée'], many: ['Tours', 'Touren', 'Tournées'], fields: ['vehicle', 'startdate', 'enddate', 'duration', 'region', 'mileage', 'contact', 'notes'] },
  { name: 'pro_site', one: ['Site', 'Standort', 'Site'], many: ['Sites', 'Standorte', 'Sites'], fields: ['address', 'city', 'postalcode', 'country', 'phone', 'email', 'region', 'capacity', 'contact'] },
  { name: 'pro_contract', one: ['Contract', 'Vertrag', 'Contrat'], many: ['Contracts', 'Verträge', 'Contrats'], fields: ['contractnumber', 'account', 'startdate', 'enddate', 'amount', 'currency', 'validfrom', 'validto', 'category', 'approved', 'reference', 'externalid'] },
  { name: 'pro_part', one: ['Spare Part', 'Ersatzteil', 'Pièce détachée'], many: ['Spare Parts', 'Ersatzteile', 'Pièces détachées'], fields: ['partnumber', 'supplier', 'quantity', 'unit', 'amount', 'currency', 'weight', 'warranty', 'category'] },
  { name: 'pro_workshop', one: ['Workshop', 'Werkstatt', 'Atelier'], many: ['Workshops', 'Werkstätten', 'Ateliers'], fields: ['address', 'city', 'postalcode', 'phone', 'email', 'contact', 'capacity', 'priority', 'notes'] },
]

const FIELDS: Record<string, Tri> = {
  name: ['Name', 'Name', 'Nom'],
  status: ['Status', 'Status', 'Statut'],
  statusreason: ['Status Reason', 'Statusgrund', 'Raison du statut'],
  owner: ['Owner', 'Besitzer', 'Propriétaire'],
  createdon: ['Created On', 'Erstellt am', 'Créé le'],
  modifiedon: ['Modified On', 'Geändert am', 'Modifié le'],
  description: ['Description', 'Beschreibung', 'Description'],
  license: ['License Plate', 'Kennzeichen', "Plaque d'immatriculation"],
  manufacturer: ['Manufacturer', 'Hersteller', 'Fabricant'],
  model: ['Model', 'Modell', 'Modèle'],
  year: ['Year of Manufacture', 'Baujahr', 'Année de fabrication'],
  mileage: ['Mileage', 'Kilometerstand', 'Kilométrage'],
  fuel: ['Fuel Type', 'Kraftstoffart', 'Type de carburant'],
  capacity: ['Capacity', 'Kapazität', 'Capacité'],
  weight: ['Weight', 'Gewicht', 'Poids'],
  color: ['Color', 'Farbe', 'Couleur'],
  nextinspection: ['Next Inspection', 'Nächste Prüfung', 'Prochaine inspection'],
  site: ['Site', 'Standort', 'Site'],
  warranty: ['Warranty Until', 'Garantie bis', "Garantie jusqu'au"],
  vehicle: ['Vehicle', 'Fahrzeug', 'Véhicule'],
  inspector: ['Inspector', 'Prüfer', 'Inspecteur'],
  result: ['Result', 'Ergebnis', 'Résultat'],
  duedate: ['Due Date', 'Fällig am', "Date d'échéance"],
  completedon: ['Completed On', 'Abgeschlossen am', 'Terminé le'],
  notes: ['Notes', 'Notizen', 'Remarques'],
  priority: ['Priority', 'Priorität', 'Priorité'],
  location: ['Location', 'Ort', 'Lieu'],
  category: ['Category', 'Kategorie', 'Catégorie'],
  amount: ['Amount', 'Betrag', 'Montant'],
  currency: ['Currency', 'Währung', 'Devise'],
  approved: ['Approved', 'Genehmigt', 'Approuvé'],
  approvedby: ['Approved By', 'Genehmigt von', 'Approuvé par'],
  approvedon: ['Approved On', 'Genehmigt am', 'Approuvé le'],
  reference: ['Reference', 'Referenz', 'Référence'],
  startdate: ['Start Date', 'Startdatum', 'Date de début'],
  enddate: ['End Date', 'Enddatum', 'Date de fin'],
  duration: ['Duration', 'Dauer', 'Durée'],
  region: ['Region', 'Region', 'Région'],
  contact: ['Contact', 'Kontakt', 'Contact'],
  address: ['Address', 'Adresse', 'Adresse'],
  city: ['City', 'Ort', 'Ville'],
  postalcode: ['Postal Code', 'Postleitzahl', 'Code postal'],
  country: ['Country', 'Land', 'Pays'],
  phone: ['Phone', 'Telefon', 'Téléphone'],
  email: ['Email', 'E-Mail', 'E-mail'],
  contractnumber: ['Contract Number', 'Vertragsnummer', 'Numéro de contrat'],
  account: ['Account', 'Firma', 'Compte'],
  validfrom: ['Valid From', 'Gültig ab', 'Valide à partir du'],
  validto: ['Valid To', 'Gültig bis', "Valide jusqu'au"],
  externalid: ['External ID', 'Externe ID', 'ID externe'],
  partnumber: ['Part Number', 'Teilenummer', 'Référence pièce'],
  supplier: ['Supplier', 'Lieferant', 'Fournisseur'],
  quantity: ['Quantity', 'Menge', 'Quantité'],
  unit: ['Unit', 'Einheit', 'Unité'],
}

const COMMON = ['name', 'status', 'statusreason', 'owner', 'createdon', 'modifiedon', 'description']

/** Alternative German texts, used for some labels so the consistency report has findings. */
const VARIANTS: Record<string, string> = { Notizen: 'Anmerkungen', Ort: 'Standort', Ergebnis: 'Resultat' }

const OPTIONS: Record<string, Tri[]> = {
  status: [['Active', 'Aktiv', 'Actif'], ['Inactive', 'Inaktiv', 'Inactif']],
  priority: [['Low', 'Niedrig', 'Basse'], ['Normal', 'Normal', 'Normale'], ['High', 'Hoch', 'Haute'], ['Critical', 'Kritisch', 'Critique']],
  category: [['Standard', 'Standard', 'Standard'], ['Special', 'Sonderfall', 'Cas particulier'], ['Warranty', 'Gewährleistung', 'Garantie']],
  result: [['Passed', 'Bestanden', 'Réussi'], ['Failed', 'Nicht bestanden', 'Échoué'], ['Passed with defects', 'Bestanden mit Mängeln', 'Réussi avec défauts']],
  fuel: [['Diesel', 'Diesel', 'Diesel'], ['Petrol', 'Benzin', 'Essence'], ['Electric', 'Elektrisch', 'Électrique'], ['Hybrid', 'Hybrid', 'Hybride']],
}

const DISPLAY_STRINGS: Tri[] = [
  ['Inspect', 'Prüfen', 'Inspecter'],
  ['Archive', 'Archivieren', 'Archiver'],
  ['Report damage', 'Schaden melden', 'Déclarer un sinistre'],
  ['Plan tour', 'Tour planen', 'Planifier une tournée'],
]

/** Deterministic 0..1 per string (FNV-1a). */
function rnd(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0xffffffff
}

let counter = 0
const id = (kind: number) => `${kind.toString(16).padStart(8, '0')}-0000-4000-8000-${(++counter).toString(16).padStart(12, '0')}`

/** German ~88 % translated, French ~60 %; a few copies of the English text. */
function texts(key: string, t: Tri): Record<Lcid, string> {
  const pick = (lcid: Lcid, value: string, share: number) => {
    const r = rnd(`${key}|${lcid}`)
    if (r < share) return lcid === 1031 && VARIANTS[value] && rnd(`${key}|v`) < 0.35 ? VARIANTS[value] : value
    if (r < share + 0.05) return t[0]
    return ''
  }
  return { 1033: t[0], 1031: pick(1031, t[1], 0.88), 1036: pick(1036, t[2], 0.6) }
}

const logicalOf = (f: string) =>
  f === 'status' ? 'statecode' : f === 'statusreason' ? 'statuscode' : f === 'owner' ? 'ownerid' : f === 'createdon' || f === 'modifiedon' ? f : `pro_${f}`

const TAB_TEXTS: Record<string, Tri> = {
  general: ['General', 'Allgemein', 'Général'],
  details: ['Details', 'Details', 'Détails'],
  summary: ['Summary', 'Übersicht', 'Résumé'],
  notes: ['Notes', 'Notizen', 'Remarques'],
  more: ['More Information', 'Weitere Informationen', 'Plus d’informations'],
  admin: ['Administration', 'Verwaltung', 'Administration'],
  activities: ['Activities', 'Aktivitäten', 'Activités'],
  quick: ['Quick Create', 'Schnellerfassung', 'Création rapide'],
}

function tableLabels(tbl: { name: string; one: Tri; many: Tri; fields: string[] }): { labels: MockLabel[]; forms: MockForm[]; views: MockView[] } {
  const out: MockLabel[] = []
  const add = (objectId: string, column: string, name: string, t: Tri, meta: Pick<MockLabel, 'kind' | 'formType'> = {}) =>
    out.push({ sheet: 'Localized Labels', type: tbl.name, objectId, column, table: tbl.name, name, texts: texts(`${objectId}|${column}`, t), ...meta })
  const tableId = id(0xa1)
  add(tableId, 'LocalizedName', tbl.name, tbl.one)
  add(tableId, 'LocalizedCollectionName', tbl.name, tbl.many)
  add(tableId, 'Description', tbl.name, [`${tbl.one[0]} records`, `Datensätze vom Typ ${tbl.one[1]}`, `Enregistrements ${tbl.one[2]}`])
  const fields = [...COMMON, ...tbl.fields]
  for (const f of fields) {
    const t = FIELDS[f]
    const attrId = id(0xb2)
    const logical = logicalOf(f)
    add(attrId, 'DisplayName', logical, t, { kind: 'column' })
    if (rnd(`${attrId}|desc`) < 0.4) add(attrId, 'Description', logical, [`${t[0]} of the ${tbl.one[0].toLowerCase()}`, `${t[1]} (${tbl.one[1]})`, `${t[2]} (${tbl.one[2]})`], { kind: 'column' })
    for (const o of OPTIONS[f] ?? []) add(id(0xc3), 'DisplayName', logical, o, { kind: 'choice' })
  }

  // Forms: names plus a layout whose tabs, sections and fields carry their own labels (`displayname`).
  const element = (name: string, t: Tri) => {
    const elementId = id(0xd5)
    add(elementId, 'displayname', name, t)
    return elementId
  }
  const cell = (f: string): MockCell => ({ id: element(logicalOf(f), FIELDS[f]), field: logicalOf(f), control: 'field' })
  const half = Math.ceil(tbl.fields.length / 2)
  const mainId = id(0xd4)
  add(mainId, 'name', 'Information', ['Information', 'Information', 'Information'], { kind: 'form', formType: 2 })
  add(mainId, 'description', 'Information', [`Main form for ${tbl.many[0].toLowerCase()}`, `Hauptformular für ${tbl.many[1]}`, `Formulaire principal des ${tbl.many[2].toLowerCase()}`], {
    kind: 'form',
    formType: 2,
  })
  const main: MockForm = {
    id: mainId,
    table: tbl.name,
    name: 'Information',
    type: 2,
    header: [cell('owner'), cell('status')],
    tabs: [
      {
        id: element('general', TAB_TEXTS.general),
        name: 'general',
        sections: [
          { id: element('summary', TAB_TEXTS.summary), name: 'summary', columns: 2, showLabel: true, cells: ['name', ...tbl.fields.slice(0, half)].map(cell) },
          { id: element('notes', TAB_TEXTS.notes), name: 'notes', columns: 1, showLabel: true, cells: [cell('description')] },
        ],
      },
      {
        id: element('details', TAB_TEXTS.details),
        name: 'details',
        sections: [
          { id: element('more', TAB_TEXTS.more), name: 'more', columns: 2, showLabel: true, cells: tbl.fields.slice(half).map(cell) },
          { id: element('admin', TAB_TEXTS.admin), name: 'admin', columns: 2, showLabel: true, cells: ['statusreason', 'createdon', 'modifiedon'].map(cell) },
          {
            id: element('activities', TAB_TEXTS.activities),
            name: 'activities',
            columns: 1,
            showLabel: false,
            cells: [{ id: element('activities_grid', TAB_TEXTS.activities), field: 'activities_grid', control: 'subgrid' }],
          },
        ],
      },
    ],
  }
  const quickId = id(0xd4)
  add(quickId, 'name', 'Quick Create', [`Quick Create: ${tbl.one[0]}`, `Schnellerfassung: ${tbl.one[1]}`, `Création rapide : ${tbl.one[2]}`], { kind: 'form', formType: 7 })
  const quick: MockForm = {
    id: quickId,
    table: tbl.name,
    name: 'Quick Create',
    type: 7,
    header: [],
    tabs: [
      {
        id: element('quick', TAB_TEXTS.quick),
        name: 'quick',
        sections: [{ id: element('quick_main', TAB_TEXTS.general), name: 'quick_main', columns: 1, showLabel: false, cells: ['name', ...tbl.fields.slice(0, 3), 'owner'].map(cell) }],
      },
    ],
  }

  const views: MockView[] = []
  for (const [en, de, fr] of [
    ['Active', 'Aktive', 'actifs'],
    ['Inactive', 'Inaktive', 'inactifs'],
    ['My', 'Meine', 'Mes'],
  ] as Tri[]) {
    const viewId = id(0xe5)
    const title: Tri = [`${en} ${tbl.many[0]}`, `${de} ${tbl.many[1]}`, en === 'My' ? `${fr} ${tbl.many[2].toLowerCase()}` : `${tbl.many[2]} ${fr}`]
    add(viewId, 'name', title[0], title, { kind: 'view' })
    const columns = [logicalOf('name'), ...tbl.fields.slice(0, 3).map(logicalOf), en === 'My' ? 'modifiedon' : 'createdon']
    if (en === 'My') columns.push('a_owner.fullname')
    views.push({ id: viewId, table: tbl.name, name: title[0], columns })
  }
  return { labels: out, forms: [main, quick], views }
}

function extensionTable(n: number) {
  const nn = String(n).padStart(2, '0')
  return {
    name: `pro_extension${nn}`,
    one: [`Extension ${nn}`, `Erweiterung ${nn}`, `Extension ${nn}`] as Tri,
    many: [`Extensions ${nn}`, `Erweiterungen ${nn}`, `Extensions ${nn}`] as Tri,
    fields: Object.keys(FIELDS).filter((_, i) => (i + n) % 3 === 0),
  }
}

export interface MockState {
  labels: MockLabel[]
  forms: MockForm[]
  views: MockView[]
  apps: AppRecord[]
  solutions: SolutionRef[]
  /** Tables per solution unique name; null = all (Default). */
  tables: Record<string, string[] | null>
  /** Solutions that carry the display strings. */
  displayStrings: Set<string>
}

export function createMockState(): MockState {
  counter = 0
  const extensions = Array.from({ length: 40 }, (_, i) => extensionTable(i + 1))
  const built = [...TABLES, ...extensions].map(tableLabels)
  const labels = built.flatMap((b) => b.labels)
  const forms = built.flatMap((b) => b.forms)
  const views = built.flatMap((b) => b.views)
  const appId = id(0xf1)
  const sitemapId = id(0xf2)
  const app = (objectId: string, type: string, column: string, t: Tri) =>
    labels.push({ sheet: 'Localized Labels', type, objectId, column, table: '', name: t[0], texts: texts(`${objectId}|${column}`, t), solutions: ['ProFleet'] })
  app(appId, 'AppModule', 'name', ['Fleet', 'Fuhrpark', 'Flotte'])
  app(appId, 'AppModule', 'description', ['Vehicles, inspections and tours', 'Fahrzeuge, Prüfungen und Touren', 'Véhicules, inspections et tournées'])
  app(sitemapId, 'SiteMap', 'sitemapname', ['Fleet', 'Fuhrpark', 'Flotte'])
  DISPLAY_STRINGS.forEach((t, i) =>
    labels.push({ sheet: 'Display Strings', type: '', objectId: '', column: `pro_Ribbon.Command${i + 1}`, table: '', name: '', texts: texts(`ds${i}`, t) }),
  )
  const sol = (uniqueName: string, friendlyName: string, isManaged: boolean, version: string): SolutionRef => ({
    id: id(0xf0),
    uniqueName,
    friendlyName,
    version,
    isManaged,
    publisher: uniqueName === 'Default' ? 'Default Publisher' : 'DynamicsPro',
  })
  return {
    labels,
    forms,
    views,
    apps: [{ id: appId, name: 'Fleet', uniqueName: 'pro_FleetApp', sitemap: { id: sitemapId, xml: SITEMAP_XML } }],
    solutions: [
      sol('ProFleet', 'Fuhrpark', false, '1.4.0.2'),
      sol('ProContracts', 'Verträge & Teile', false, '1.1.0.0'),
      sol('ProCore', 'Basis (managed)', true, '2.0.1.0'),
      sol('Default', 'Default Solution', false, '1.0'),
    ],
    tables: {
      ProFleet: ['pro_vehicle', 'pro_inspection', 'pro_damage', 'pro_tour', 'pro_site'],
      ProContracts: ['pro_contract', 'pro_part', 'pro_workshop'],
      ProCore: ['pro_site', 'pro_extension01', 'pro_extension02'],
      Default: null,
    },
    displayStrings: new Set(['ProFleet', 'Default']),
  }
}

export function mockComponents(labels: MockLabel[]): Map<string, ComponentInfo> {
  const out = new Map<string, ComponentInfo>()
  for (const l of labels) if (l.objectId) out.set(l.objectId, { table: l.table, name: l.name, kind: l.kind, formType: l.formType })
  return out
}

/** Sitemap of the mock app: own titles with gaps (French), subareas showing their table's plural name. */
const SITEMAP_XML =
  '<SiteMap>' +
  '<Area Id="fleet" ShowGroups="true"><Titles><Title LCID="1033" Title="Fleet" /><Title LCID="1031" Title="Fuhrpark" /></Titles>' +
  '<Group Id="master"><Titles><Title LCID="1033" Title="Master Data" /><Title LCID="1031" Title="Stammdaten" /><Title LCID="1036" Title="Données de base" /></Titles>' +
  '<SubArea Id="sub_vehicle" Entity="pro_vehicle" /><SubArea Id="sub_site" Entity="pro_site" /></Group>' +
  '<Group Id="operations"><Titles><Title LCID="1033" Title="Operations" /><Title LCID="1031" Title="Betrieb" /></Titles>' +
  '<SubArea Id="sub_tour" Entity="pro_tour" /><SubArea Id="sub_inspection" Entity="pro_inspection" /><SubArea Id="sub_damage" Entity="pro_damage" />' +
  '<SubArea Id="sub_overview" Url="/main.aspx?pagetype=dashboard"><Titles><Title LCID="1033" Title="Overview" /><Title LCID="1031" Title="Übersicht" /></Titles></SubArea></Group>' +
  '</Area>' +
  '<Area Id="contracts" ShowGroups="true"><Titles><Title LCID="1033" Title="Contracts" /><Title LCID="1031" Title="Verträge" /><Title LCID="1036" Title="Contrats" /></Titles>' +
  '<Group Id="contracts_main"><Titles><Title LCID="1033" Title="Contracts &amp; Parts" /><Title LCID="1031" Title="Verträge &amp; Teile" /></Titles>' +
  '<SubArea Id="sub_contract" Entity="pro_contract" /><SubArea Id="sub_part" Entity="pro_part" /><SubArea Id="sub_workshop" Entity="pro_workshop" /></Group>' +
  '</Area>' +
  '</SiteMap>'

export function mockViews(state: MockState, ids: string[]): ViewRecord[] {
  return state.views
    .filter((v) => ids.includes(v.id))
    .map((v) => ({
      id: v.id,
      name: v.name,
      table: v.table,
      queryType: 0,
      layoutxml: `<grid name="resultset" object="10000" jump="pro_name" select="1" icon="1" preview="1"><row name="result" id="${v.table}id">${v.columns
        .map((c, i) => `<cell name="${c}" width="${i === 0 ? 220 : 140}" />`)
        .join('')}</row></grid>`,
      fetchxml: `<fetch version="1.0"><entity name="${v.table}">${v.columns
        .filter((c) => !c.includes('.'))
        .map((c) => `<attribute name="${c}" />`)
        .join('')}<link-entity alias="a_owner" name="systemuser" from="systemuserid" to="ownerid" link-type="outer"><attribute name="fullname" /></link-entity></entity></fetch>`,
    }))
}

export function mockApps(state: MockState, appIds: string[], sitemapIds: string[]): AppRecord[] {
  return state.apps.filter((a) => appIds.includes(a.id) || (a.sitemap !== null && sitemapIds.includes(a.sitemap.id)))
}

/** Choice values per column, as the metadata would group them. */
export function mockChoiceGroups(state: MockState, table: string, baseLanguage: Lcid): ChoiceGroup[] {
  const groups = new Map<string, ChoiceGroup>()
  for (const l of state.labels) {
    if (l.table !== table || l.kind !== 'choice') continue
    const g = groups.get(l.name) ?? { attribute: l.name, options: [] }
    g.options.push({ value: 455000000 + g.options.length, metadataId: l.objectId, label: l.texts[baseLanguage] ?? '' })
    groups.set(l.name, g)
  }
  return [...groups.values()]
}

const CLASS_FIELD = '{4273EDBD-AC1D-40d3-9FB2-095C621B552D}'
const CLASS_SUBGRID = '{E7A81278-8635-4d9e-8D4D-59480B391C5B}'

/** A form as Dataverse returns it: formxml with the labels of the store, in every language that has a text. */
export function mockForm(state: MockState, formId: string): FormRecord | null {
  const form = state.forms.find((f) => f.id === formId)
  if (!form) return null
  const texts = new Map(state.labels.filter((l) => l.column === 'displayname').map((l) => [l.objectId, l.texts]))
  const labels = (elementId: string) =>
    `<labels>${Object.entries(texts.get(elementId) ?? {})
      .filter(([, t]) => t)
      .map(([lcid, t]) => `<label description="${encodeXmlAttr(t)}" languagecode="${lcid}" />`)
      .join('')}</labels>`
  const cell = (c: MockCell) =>
    `<cell id="{${c.id}}" showlabel="true">${labels(c.id)}` +
    (c.control === 'subgrid'
      ? `<control id="${c.field}" classid="${CLASS_SUBGRID}" />`
      : `<control id="${c.field}" classid="${CLASS_FIELD}" datafieldname="${c.field}" />`) +
    '</cell>'
  const rows = (cells: MockCell[], columns: number) => {
    const out: string[] = []
    for (let i = 0; i < cells.length; i += columns) out.push(`<row>${cells.slice(i, i + columns).map(cell).join('')}</row>`)
    return `<rows>${out.join('')}</rows>`
  }
  const xml =
    '<form>' +
    `<tabs>${form.tabs
      .map(
        (t) =>
          `<tab name="${t.name}" id="{${t.id}}" showlabel="true">${labels(t.id)}<columns><column width="100%"><sections>` +
          t.sections
            .map((s) => `<section name="${s.name}" id="{${s.id}}" showlabel="${s.showLabel}" columns="${s.columns}">${labels(s.id)}${rows(s.cells, s.columns)}</section>`)
            .join('') +
          '</sections></column></columns></tab>',
      )
      .join('')}</tabs>` +
    (form.header.length > 0 ? `<header id="{00000000-0000-4000-8000-000000000001}" columns="111">${rows(form.header, form.header.length)}</header>` : '') +
    '</form>'
  return { id: form.id, name: form.name, table: form.table, type: form.type, formxml: xml }
}

/** Labels of a solution as CrmTranslations.xml (SpreadsheetML, sparse cells like Excel writes them). */
export function renderTranslationXml(state: MockState, solution: string): string {
  const tables = state.tables[solution]
  const labels = state.labels.filter((l) =>
    l.sheet === 'Display Strings'
      ? state.displayStrings.has(solution)
      : tables === null || tables === undefined
        ? true
        : l.table === ''
          ? (l.solutions ?? []).includes(solution)
          : tables.includes(l.table),
  )
  const cell = (text: string, style?: string) => `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="String">${encodeXmlText(text)}</Data></Cell>`
  const langCells = (l: MockLabel, firstCol: number) => {
    let out = ''
    let skipped = false
    MOCK_LANGUAGES.forEach((lcid, i) => {
      const text = l.texts[lcid] ?? ''
      const col = firstCol + i
      if (text === '') {
        // Excel style: leave the cell out (next one gets ss:Index) or write an empty one.
        if (rnd(`${l.objectId}${l.column}${lcid}e`) < 0.5) skipped = true
        else out += '<Cell/>'
        return
      }
      out += skipped ? `<Cell ss:Index="${col}"><Data ss:Type="String">${encodeXmlText(text)}</Data></Cell>` : cell(text)
      skipped = false
    })
    return out
  }
  const header = (keys: string[]) => `<Row>${[...keys, ...MOCK_LANGUAGES.map(String)].map((k) => cell(k, 's1')).join('')}</Row>`
  const ds = labels.filter((l) => l.sheet === 'Display Strings')
  const ll = labels.filter((l) => l.sheet === 'Localized Labels')
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">',
    '<Styles><Style ss:ID="Default" ss:Name="Normal"/><Style ss:ID="s1"><Font ss:Bold="1"/></Style><Style ss:ID="s2"><Protection ss:Protected="1"/></Style></Styles>',
    '<Worksheet ss:Name="Information"><Table>',
    `<Row>${cell('Organization ID:', 's1')}${cell('00000000-0000-4000-8000-00000000000a')}</Row>`,
    `<Row>${cell('Base language name:', 's1')}${cell('English (United States)')}</Row>`,
    `<Row>${cell('Base language ID:', 's1')}${cell(String(MOCK_BASE))}</Row>`,
    `<Row>${cell('Solution Name:', 's1')}${cell(solution)}</Row>`,
    '</Table></Worksheet>',
    '<Worksheet ss:Name="Display Strings"><Table>',
    header(['Display String Key']),
    ...ds.map((l) => `<Row>${cell(l.column, 's2')}${langCells(l, 2)}</Row>`),
    '</Table></Worksheet>',
    '<Worksheet ss:Name="Localized Labels"><Table>',
    header(['Entity name', 'Object ID', 'Object Column Name']),
    ...ll.map((l) => `<Row>${cell(l.type, 's2')}${cell(l.objectId, 's2')}${cell(l.column, 's2')}${langCells(l, 4)}</Row>`),
    '</Table></Worksheet>',
    '</Workbook>',
    '',
  ].join('\n')
}
