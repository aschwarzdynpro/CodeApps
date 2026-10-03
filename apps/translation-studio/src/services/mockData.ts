import type { ComponentInfo, Lcid, SolutionRef } from '../types/translation'
import { encodeXmlText } from '../utils/spreadsheetXml'

/**
 * Synthetic translation data for the mock: fictitious `pro_` tables of a
 * fleet scenario in en/de/fr with built-in gaps — no customer data. Labels
 * live in a store keyed like the export (type + object id + column), so an
 * import into one solution shows up in every other export, as in Dataverse.
 */

export const MOCK_BASE: Lcid = 1033
export const MOCK_LANGUAGES: Lcid[] = [1033, 1031, 1036]

export interface MockLabel {
  sheet: 'Localized Labels' | 'Display Strings'
  type: string
  objectId: string
  column: string
  table: string
  name: string
  texts: Record<Lcid, string>
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

function tableLabels(tbl: { name: string; one: Tri; many: Tri; fields: string[] }): MockLabel[] {
  const out: MockLabel[] = []
  const add = (type: string, objectId: string, column: string, name: string, t: Tri) =>
    out.push({ sheet: 'Localized Labels', type, objectId, column, table: tbl.name, name, texts: texts(`${objectId}|${column}`, t) })
  const tableId = id(0xa1)
  add('Entity', tableId, 'LocalizedName', tbl.name, tbl.one)
  add('Entity', tableId, 'LocalizedCollectionName', tbl.name, tbl.many)
  add('Entity', tableId, 'Description', tbl.name, [`${tbl.one[0]} records`, `Datensätze vom Typ ${tbl.one[1]}`, `Enregistrements ${tbl.one[2]}`])
  for (const f of [...COMMON, ...tbl.fields]) {
    const t = FIELDS[f]
    const attrId = id(0xb2)
    const logical = f === 'status' ? 'statecode' : f === 'statusreason' ? 'statuscode' : f === 'owner' ? 'ownerid' : f === 'createdon' || f === 'modifiedon' ? f : `pro_${f}`
    add('Attribute', attrId, 'DisplayName', logical, t)
    if (rnd(`${attrId}|desc`) < 0.4) add('Attribute', attrId, 'Description', logical, [`${t[0]} of the ${tbl.one[0].toLowerCase()}`, `${t[1]} (${tbl.one[1]})`, `${t[2]} (${tbl.one[2]})`])
    for (const o of OPTIONS[f] ?? []) add('AttributePicklistValue', id(0xc3), 'DisplayName', logical, o)
  }
  const formId = id(0xd4)
  add('SystemForm', formId, 'Name', 'Information', ['Information', 'Information', 'Information'])
  add('SystemForm', formId, 'Description', 'Information', [`Main form for ${tbl.many[0].toLowerCase()}`, `Hauptformular für ${tbl.many[1]}`, `Formulaire principal des ${tbl.many[2].toLowerCase()}`])
  add('SystemForm', id(0xd4), 'Name', 'Quick Create', [`Quick Create: ${tbl.one[0]}`, `Schnellerfassung: ${tbl.one[1]}`, `Création rapide : ${tbl.one[2]}`])
  for (const [en, de, fr] of [
    ['Active', 'Aktive', 'actifs'],
    ['Inactive', 'Inaktive', 'inactifs'],
    ['My', 'Meine', 'Mes'],
  ] as Tri[]) {
    const viewId = id(0xe5)
    const title: Tri = [`${en} ${tbl.many[0]}`, `${de} ${tbl.many[1]}`, en === 'My' ? `${fr} ${tbl.many[2].toLowerCase()}` : `${tbl.many[2]} ${fr}`]
    add('SavedQuery', viewId, 'LocalizedName', title[0], title)
  }
  return out
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
  solutions: SolutionRef[]
  /** Tables per solution unique name; null = all (Default). */
  tables: Record<string, string[] | null>
  /** Solutions that carry the display strings. */
  displayStrings: Set<string>
}

export function createMockState(): MockState {
  counter = 0
  const extensions = Array.from({ length: 40 }, (_, i) => extensionTable(i + 1))
  const labels = [...TABLES, ...extensions].flatMap(tableLabels)
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
  for (const l of labels) if (l.objectId) out.set(l.objectId, { table: l.table, name: l.name })
  return out
}

/** Labels of a solution as CrmTranslations.xml (SpreadsheetML, sparse cells like Excel writes them). */
export function renderTranslationXml(state: MockState, solution: string): string {
  const tables = state.tables[solution]
  const labels = state.labels.filter((l) =>
    l.sheet === 'Display Strings' ? state.displayStrings.has(solution) : tables === null || tables === undefined ? true : tables.includes(l.table),
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
    `<Row>${cell('Organization Name', 's1')}${cell('Mock Org')}</Row>`,
    `<Row>${cell('Base Language Code', 's1')}${cell(String(MOCK_BASE))}</Row>`,
    `<Row>${cell('Solution', 's1')}${cell(solution)}</Row>`,
    '</Table></Worksheet>',
    '<Worksheet ss:Name="Display Strings"><Table>',
    header(['Display String Key']),
    ...ds.map((l) => `<Row>${cell(l.column, 's2')}${langCells(l, 2)}</Row>`),
    '</Table></Worksheet>',
    '<Worksheet ss:Name="Localized Labels"><Table>',
    header(['Entity Name', 'Object Id', 'Object Column Name']),
    ...ll.map((l) => `<Row>${cell(l.type, 's2')}${cell(`{${l.objectId}}`, 's2')}${cell(l.column, 's2')}${langCells(l, 4)}</Row>`),
    '</Table></Worksheet>',
    '</Workbook>',
    '',
  ].join('\n')
}
