/**
 * Filter layout XML (`msdyn_configuration.msdyn_value`, type Filter layout):
 *
 *   <filter><controls>
 *     <control type="combo" source="entity" key="Site" label-id="Niederlassung" entity="sst_site" multi="true" />
 *     …
 *   </controls></filter>
 *
 * Every operation is string → string over a DOM: parse, change exactly one
 * top-level control, serialize. Unknown attributes and children (`<data>`,
 * `<order>`, an embedded `<fetch>`, nested `<controls>` of a fieldset) are
 * carried along untouched. Only the indentation of the top-level control
 * list is normalized, so moved/added controls don't leave stray whitespace.
 */

export interface ControlInfo {
  index: number
  type: string
  key: string | null
  /** Resource key (e.g. `SB_FilterPanel_…`) or literal label text. */
  labelId: string | null
  source: string | null
  entity: string | null
  attribute: string | null
  multi: boolean
  /** fieldset/twocolumn: contains further controls — edited via XML only. */
  nestedCount: number
  /** All attributes, for display of anything the form doesn't model. */
  attributes: Record<string, string>
  /** The element as XML, for the diff and the details view. */
  xml: string
}

export type LayoutParse = { ok: true; controls: ControlInfo[] } | { ok: false; error: string }

/** Attributes the editor writes; everything else is preserved as found. */
export interface ControlEdit {
  key?: string
  'label-id'?: string
  entity?: string
  attribute?: string | null
  multi?: boolean
}

export interface NewControl {
  /** lookup = rows of a table, optionset = choice values of a column, characteristic = skills + rating. */
  kind: 'lookup' | 'optionset' | 'characteristic'
  key: string
  labelId: string
  entity: string
  attribute?: string
  multi: boolean
}

const DECL = /^\s*<\?xml[^?]*\?>\s*/

function parse(xml: string): { doc: Document; controls: Element } | { error: string } {
  const body = xml.replace(DECL, '')
  const doc = new DOMParser().parseFromString(body, 'application/xml')
  const err = doc.getElementsByTagName('parsererror')[0]
  if (err) return { error: (err.textContent ?? 'XML ungültig').trim().split('\n')[0] }
  const root = doc.documentElement
  if (root.nodeName !== 'filter') return { error: `Wurzelelement ist <${root.nodeName}>, erwartet <filter>.` }
  const controls = childElements(root).find((e) => e.nodeName === 'controls')
  if (!controls) return { error: 'Kein <controls>-Element unter <filter>.' }
  return { doc, controls }
}

function childElements(el: Element): Element[] {
  return Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1)
}

function topControls(controls: Element): Element[] {
  return childElements(controls).filter((e) => e.nodeName === 'control')
}

function serializeEl(el: Element): string {
  return new XMLSerializer().serializeToString(el)
}

function info(el: Element, index: number): ControlInfo {
  const attributes: Record<string, string> = {}
  for (const a of Array.from(el.attributes)) attributes[a.name] = a.value
  const nested = Array.from(el.getElementsByTagName('control')).length
  return {
    index,
    type: el.getAttribute('type') ?? '',
    key: el.getAttribute('key'),
    labelId: el.getAttribute('label-id'),
    source: el.getAttribute('source'),
    entity: el.getAttribute('entity'),
    attribute: el.getAttribute('attribute'),
    multi: el.getAttribute('multi') === 'true',
    nestedCount: nested,
    attributes,
    xml: serializeEl(el),
  }
}

export function parseLayout(xml: string | null | undefined): LayoutParse {
  if (!xml || xml.trim() === '') return { ok: false, error: 'Leeres Filterlayout.' }
  const p = parse(xml)
  if ('error' in p) return { ok: false, error: p.error }
  return { ok: true, controls: topControls(p.controls).map(info) }
}

/**
 * Re-indents the top-level control list and serializes the document,
 * keeping an original `<?xml …?>` declaration.
 */
function finish(original: string, doc: Document, controls: Element): string {
  const items = topControls(controls)
  const others = childElements(controls).filter((e) => e.nodeName !== 'control')
  while (controls.firstChild) controls.removeChild(controls.firstChild)
  for (const el of [...items, ...others]) {
    controls.appendChild(doc.createTextNode('\n    '))
    controls.appendChild(el)
  }
  controls.appendChild(doc.createTextNode('\n  '))
  const decl = DECL.exec(original)?.[0].trim()
  const body = serializeEl(doc.documentElement)
  return decl ? `${decl}\n${body}` : body
}

function mutate(xml: string, fn: (doc: Document, controls: Element, list: Element[]) => void): string {
  const p = parse(xml)
  if ('error' in p) throw new Error(p.error)
  fn(p.doc, p.controls, topControls(p.controls))
  return finish(xml, p.doc, p.controls)
}

export function moveControl(xml: string, from: number, to: number): string {
  return mutate(xml, (_doc, controls, list) => {
    if (to < 0 || to >= list.length || from === to) return
    const el = list[from]
    controls.removeChild(el)
    const rest = topControls(controls)
    if (to >= rest.length) controls.appendChild(el)
    else controls.insertBefore(el, rest[to])
  })
}

export function removeControl(xml: string, index: number): string {
  return mutate(xml, (_doc, controls, list) => {
    controls.removeChild(list[index])
  })
}

export function updateControl(xml: string, index: number, edit: ControlEdit): string {
  return mutate(xml, (_doc, _controls, list) => {
    const el = list[index]
    for (const [name, value] of Object.entries(edit)) {
      if (value === undefined) continue
      // null removes; '' is kept so a field being retyped doesn't vanish mid-edit.
      if (value === null) el.removeAttribute(name)
      else el.setAttribute(name, typeof value === 'boolean' ? String(value) : value)
    }
  })
}

export function addControl(xml: string, spec: NewControl): string {
  return mutate(xml, (doc, controls) => {
    const el = doc.createElement('control')
    if (spec.kind === 'characteristic') {
      el.setAttribute('type', 'characteristic')
      el.setAttribute('key', spec.key)
      el.setAttribute('label-id', spec.labelId)
    } else {
      el.setAttribute('type', 'combo')
      el.setAttribute('source', spec.kind === 'lookup' ? 'entity' : 'optionset')
      el.setAttribute('key', spec.key)
      el.setAttribute('label-id', spec.labelId)
      el.setAttribute('entity', spec.entity)
      if (spec.kind === 'optionset' && spec.attribute) el.setAttribute('attribute', spec.attribute)
      el.setAttribute('multi', String(spec.multi))
    }
    // Before the sort control if there is one — "Orders" conventionally comes last.
    const order = topControls(controls).find((c) => c.getAttribute('type') === 'order')
    if (order) controls.insertBefore(el, order)
    else controls.appendChild(el)
  })
}

/** Normalizes formatting without changing content — for a clean baseline diff. */
export function normalizeLayout(xml: string): string {
  return mutate(xml, () => {})
}

/**
 * `label-id` is either literal text or a resource key the board translates.
 * Plain-text names for the keys the product layouts use, so the editor can
 * say what "ScheduleAssistant.West.Roles" will read as.
 */
const RESOURCE_LABELS: Record<string, string> = {
  'ScheduleAssistant.West.Roles': 'Rollen',
  'ScheduleAssistant.West.Skills': 'Merkmale – Bewertung',
  'ScheduleAssistant.West.RestrictedResources': 'Eingeschränkte Ressourcen',
  'ScheduleAssistant.West.Territories': 'Gebiete',
  SB_FilterPanel_ResourceTypesFilter_Title: 'Ressourcentypen',
  SB_FilterPanel_BusinessUnitsFilter_Title: 'Unternehmenseinheiten',
  SB_FilterPanel_OrganizationalUnitsFilter_Title: 'Organisationseinheiten',
  SB_FilterPanel_TeamsFilter_Title: 'Teams',
  SB_FilterPanel_PoolTypesFilter_Title: 'Pooltypen',
  SB_FilterPanel_TerritoriesFilter_Title: 'Gebiete',
  FilterControl_OrderLabel: 'Sortierung',
}

/** Display text of a label-id: known resource key → plain text, else null (it is literal text). */
export function resourceLabel(labelId: string | null): string | null {
  if (!labelId) return null
  if (RESOURCE_LABELS[labelId]) return RESOURCE_LABELS[labelId]
  // Resource keys look like `Area.Sub.Name` or `Area_Name_Title`; literal labels have spaces or neither.
  return /^[A-Za-z]\w*[._][\w.]+$/.test(labelId) ? 'Systemtext (wird übersetzt)' : null
}

// ---------------------------------------------------------------------------
// Retrieve resources query cross-check
// ---------------------------------------------------------------------------

/**
 * Filter keys a Retrieve Resources Query reads (`$input/Site`, …). A layout
 * control whose key is not among them shows up in the panel but filters
 * nothing.
 */
export function queryInputKeys(queryXml: string | null | undefined): Set<string> {
  const keys = new Set<string>()
  if (!queryXml) return keys
  for (const m of queryXml.matchAll(/\$input\/([A-Za-z_][\w]*)/g)) keys.add(m[1])
  return keys
}

/** Controls that are not plain filters (sorting, layout containers, characteristics UI). */
export function needsQuery(c: ControlInfo): boolean {
  return Boolean(c.key) && c.type !== 'order' && c.nestedCount === 0 && !c.key!.includes('/')
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export interface LayoutChange {
  key: string
  label: string
  before: string | undefined
  after: string | undefined
}

const identity = (c: ControlInfo) => c.key ?? `${c.type}#${c.index}`

function describe(c: ControlInfo): string {
  const parts = [`${c.type}${c.source ? `/${c.source}` : ''}`]
  if (c.labelId) parts.push(`„${c.labelId}“`)
  if (c.entity) parts.push(c.attribute ? `${c.entity}.${c.attribute}` : c.entity)
  if (c.multi) parts.push('mehrfach')
  return parts.join(' · ')
}

/** Field-level changes between two layouts, matched by control key. */
export function diffLayouts(before: string | null, after: string | null): LayoutChange[] {
  const a = parseLayout(before)
  const b = parseLayout(after)
  if (!a.ok || !b.ok) {
    return before === after ? [] : [{ key: 'xml', label: 'Filterlayout (XML)', before: before ?? undefined, after: after ?? undefined }]
  }
  const left = new Map(a.controls.map((c) => [identity(c), c]))
  const right = new Map(b.controls.map((c) => [identity(c), c]))
  const changes: LayoutChange[] = []
  for (const [id, c] of left) {
    const d = right.get(id)
    if (!d) changes.push({ key: id, label: `Feld ${c.labelId ?? id}`, before: describe(c), after: undefined })
    else if (c.xml !== d.xml) changes.push({ key: id, label: `Feld ${d.labelId ?? id}`, before: describe(c), after: describe(d) })
  }
  for (const [id, d] of right) {
    if (!left.has(id)) changes.push({ key: id, label: `Feld ${d.labelId ?? id}`, before: undefined, after: describe(d) })
  }
  const orderA = a.controls.map(identity).filter((id) => right.has(id))
  const orderB = b.controls.map(identity).filter((id) => left.has(id))
  if (orderA.join('|') !== orderB.join('|')) {
    const name = (cs: ControlInfo[]) => cs.map((c) => c.labelId ?? identity(c)).join(', ')
    changes.push({ key: '#order', label: 'Reihenfolge', before: name(a.controls), after: name(b.controls) })
  }
  return changes
}
