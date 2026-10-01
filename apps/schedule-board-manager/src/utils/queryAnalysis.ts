/**
 * Reads a Retrieve Resources Query (UFX-FetchXML) and reports, per filter
 * key, how the query uses it: which table and column the `$input/<Key>`
 * condition sits on and with which operator. That is enough to propose a
 * matching filter control ("Site" → `bookableresource.sst_site_ref in` →
 * a lookup over the column's target table).
 *
 * UFX queries use the `ufx:` prefix without always declaring it, so a DOM
 * parser would reject them. A small tag scanner is sufficient: it tracks the
 * open `<entity>`/`<link-entity>` and `<condition>` elements.
 */

export interface KeyUsage {
  key: string
  /** Table the condition is evaluated on (entity or link-entity name). */
  entity: string | null
  attribute: string | null
  operator: string | null
}

const TAG = /<(\/?)([\w:-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const INPUT = /\$input\/([A-Za-z_]\w*)/g

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of raw.matchAll(ATTR)) out[m[1]] = m[2] ?? m[3] ?? ''
  return out
}

/** First usage per key wins — the main resource filter comes before helpers. */
export function analyzeQuery(queryXml: string | null | undefined): Map<string, KeyUsage> {
  const usages = new Map<string, KeyUsage>()
  if (!queryXml) return usages
  const xml = queryXml.replace(/<!--[\s\S]*?-->/g, '')
  const entities: string[] = []
  let condition: { attribute: string | null; operator: string | null } | null = null

  const record = (text: string, fallback: { attribute: string | null; operator: string | null } | null) => {
    for (const m of text.matchAll(INPUT)) {
      const key = m[1]
      const known = usages.get(key)
      if (known) {
        // A key first seen on a link-entity gets its column from a condition inside that link.
        if (!known.attribute && fallback?.attribute && known.entity === (entities[entities.length - 1] ?? null)) {
          known.attribute = fallback.attribute
          known.operator = fallback.operator
        }
        continue
      }
      usages.set(key, {
        key,
        entity: entities[entities.length - 1] ?? null,
        attribute: fallback?.attribute ?? null,
        operator: fallback?.operator ?? null,
      })
    }
  }

  for (const m of xml.matchAll(TAG)) {
    const [, closing, name, rawAttrs, selfClosing] = m
    if (closing) {
      if (name === 'entity' || name === 'link-entity') entities.pop()
      if (name === 'condition') condition = null
      continue
    }
    const a = attrs(rawAttrs)
    if (name === 'entity' || name === 'link-entity') {
      entities.push(a.name ?? '')
      // ufx:if on a link-entity belongs to that link, attribute unknown.
      record(rawAttrs, null)
      if (selfClosing) entities.pop()
      continue
    }
    if (name === 'condition') {
      const c = { attribute: a.attribute ?? null, operator: a.operator ?? null }
      record(rawAttrs, c)
      if (!selfClosing) condition = c
      continue
    }
    // ufx:apply / ufx:value inside a condition carry the key of that condition.
    record(rawAttrs, condition)
  }
  return usages
}

/**
 * Keys the query reads that are not filters the user picks (flags, sort,
 * and `ScheduleBoard/StartDate|EndDate` — the board's date range, used e.g.
 * by the crew sample in MS Learn).
 */
export const NON_FILTER_KEYS = new Set(['DisplayOnScheduleBoard', 'DisplayOnScheduleAssistant', 'Orders', 'ScheduleBoard'])

export interface KeyTemplate {
  label: string
  kind: 'lookup' | 'optionset' | 'characteristic'
  entity?: string
  attribute?: string
  /** What selecting values does, for the suggestion list. */
  meaning?: string
}

/**
 * Keys the URS product queries understand, with the control shape the
 * product's own default layouts use for them.
 */
export const KNOWN_KEYS: Record<string, KeyTemplate> = {
  MustChooseFromResources: { label: 'Ressourcen', kind: 'lookup', entity: 'bookableresource', meaning: 'zeigt nur die gewählten Ressourcen' },
  RestrictedResources: { label: 'Ausgeschlossene Ressourcen', kind: 'lookup', entity: 'bookableresource', meaning: 'blendet die gewählten Ressourcen aus' },
  Roles: { label: 'Rollen', kind: 'lookup', entity: 'bookableresourcecategory', meaning: 'Ressourcen mit einer der Rollen' },
  Teams: { label: 'Teams', kind: 'lookup', entity: 'team', meaning: 'Ressourcen aus den Teams' },
  BusinessUnits: { label: 'Unternehmenseinheiten', kind: 'lookup', entity: 'businessunit', meaning: 'Ressourcen der Unternehmenseinheiten' },
  OrganizationalUnits: { label: 'Organisationseinheiten', kind: 'lookup', entity: 'msdyn_organizationalunit', meaning: 'Ressourcen der Organisationseinheiten' },
  Territories: { label: 'Gebiete', kind: 'lookup', entity: 'territory', meaning: 'Ressourcen der Gebiete' },
  ResourceTypes: { label: 'Ressourcentypen', kind: 'optionset', entity: 'bookableresource', attribute: 'resourcetype', meaning: 'Ressourcen der Typen' },
  PoolTypes: { label: 'Pooltypen', kind: 'optionset', entity: 'bookableresource', attribute: 'msdyn_pooltype', meaning: 'Pools der Typen' },
  Characteristics: { label: 'Merkmale', kind: 'characteristic', meaning: 'Ressourcen mit Merkmalen und Bewertung' },
}

const OPERATOR_TEXT: Record<string, string> = {
  in: 'ist einer von',
  'not-in': 'ist keiner von',
  eq: 'ist gleich',
  'eq-userteams': 'Teams des Benutzers',
  'contain-values': 'enthält einen von',
}

/** Short human description of a usage, e.g. "bookableresource.sst_site_ref ist einer von …". */
export function describeUsage(u: KeyUsage): string {
  const where = u.entity ? (u.attribute ? `${u.entity}.${u.attribute}` : u.entity) : (u.attribute ?? '')
  const op = u.operator ? (OPERATOR_TEXT[u.operator] ?? u.operator) : ''
  return [where, op].filter(Boolean).join(' ') || 'Verwendung nicht eindeutig'
}

// ---------------------------------------------------------------------------
// Tag scanning shared with view layouts and cell template variables
// ---------------------------------------------------------------------------

export interface XmlTag {
  name: string
  attrs: Record<string, string>
  closing: boolean
  selfClosing: boolean
}

/** Tags in document order, comments removed. Tolerates undeclared prefixes like `ufx:`. */
export function scanTags(xml: string | null | undefined): XmlTag[] {
  if (!xml) return []
  const clean = xml.replace(/<!--[\s\S]*?-->/g, '')
  return [...clean.matchAll(TAG)].map((m) => ({
    closing: m[1] === '/',
    name: m[2],
    attrs: attrs(m[3]),
    selfClosing: m[4] === '/',
  }))
}

export interface QueryOutput {
  /** Name the resource cell template reads, e.g. `crewname`. */
  name: string
  source: 'attribute' | 'bag'
  /** `table.column` for attributes, the `ufx:select` expression for bag entries. */
  detail: string
}

/**
 * Values a Retrieve Resources Query hands to the resource cell template:
 * aliased attributes anywhere, unaliased attributes of the root entity, and
 * the direct children of a `<bag>` element (MS sample: `<singleCrew
 * ufx:select="crewcount = 1" />`). A heuristic for the variable palette —
 * the query's runtime shape is not documented in full.
 */
export function queryOutputs(queryXml: string | null | undefined): QueryOutput[] {
  const out: QueryOutput[] = []
  const add = (o: QueryOutput) => {
    if (o.name && !out.some((x) => x.name === o.name)) out.push(o)
  }
  const stack: { name: string; entity?: string }[] = []
  const entityDepth = () => stack.filter((e) => e.entity !== undefined).length
  const currentEntity = () => [...stack].reverse().find((e) => e.entity !== undefined)?.entity ?? ''
  let bagLevel = -1

  for (const tag of scanTags(queryXml)) {
    if (tag.closing) {
      const at = stack.map((e) => e.name).lastIndexOf(tag.name)
      if (at >= 0) stack.length = at
      if (bagLevel >= stack.length) bagLevel = -1
      continue
    }
    const level = stack.length
    if (bagLevel >= 0 && level === bagLevel + 1 && !tag.name.startsWith('ufx:')) {
      add({ name: tag.name, source: 'bag', detail: tag.attrs['ufx:select'] ?? '' })
    }
    const isEntity = tag.name === 'entity' || tag.name === 'link-entity'
    if (tag.name === 'attribute' && tag.attrs.name) {
      const entity = currentEntity()
      if (tag.attrs.alias) add({ name: tag.attrs.alias, source: 'attribute', detail: `${entity}.${tag.attrs.name}` })
      else if (entityDepth() === 1) add({ name: tag.attrs.name, source: 'attribute', detail: `${entity}.${tag.attrs.name}` })
    }
    if (tag.name === 'bag' && !tag.selfClosing) bagLevel = level
    if (!tag.selfClosing) stack.push({ name: tag.name, entity: isEntity ? (tag.attrs.name ?? '') : undefined })
  }
  return out
}
