/**
 * Configuration Data Transfer Hub — pure FetchXML/config helpers.
 *
 * DOM-based (DOMParser/XMLSerializer — jsdom in tests), never throws: garbage
 * XML yields `ok: false` from the parser and pass-through from the rewriters.
 * Kept free of service imports so the whole module stays unit-testable.
 */

export interface ParsedFetchXmlOk {
  ok: true
  /** Logical name of the (single) top-level entity. */
  entity: string
  /** Direct <attribute name> children of the entity. */
  attributes: string[]
  /** True when the entity carries <all-attributes/>. */
  allAttributes: boolean
  /** True when the <fetch> is an aggregate query. */
  hasAggregate: boolean
  /** Logical names of all (nested) <link-entity> elements. */
  linkEntities: string[]
  /** Non-fatal advisories for the dialog. */
  warnings: string[]
}
export interface ParsedFetchXmlError {
  ok: false
  error: string
}
export type ParsedFetchXml = ParsedFetchXmlOk | ParsedFetchXmlError

function parseXmlDocument(xml: string): Document | null {
  if (!xml.trim()) return null
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return null
  return doc
}

function directChildren(el: Element, tag: string): Element[] {
  return [...el.children].filter((c) => c.tagName === tag)
}

/** Validate + dissect a FetchXML string. Never throws. */
export function parseFetchXml(xml: string): ParsedFetchXml {
  if (!xml.trim()) return { ok: false, error: 'FetchXML is empty.' }
  const doc = parseXmlDocument(xml)
  if (!doc) return { ok: false, error: 'Not well-formed XML.' }
  const fetch = doc.documentElement
  if (fetch.tagName !== 'fetch')
    return { ok: false, error: `Root element must be <fetch> (found <${fetch.tagName}>).` }
  const entities = directChildren(fetch, 'entity')
  if (entities.length !== 1)
    return { ok: false, error: `Expected exactly one <entity> under <fetch> (found ${entities.length}).` }
  const entity = entities[0]
  const entityName = entity.getAttribute('name')?.trim() ?? ''
  if (!entityName) return { ok: false, error: '<entity> has no name attribute.' }

  const attributes = directChildren(entity, 'attribute')
    .map((a) => a.getAttribute('name')?.trim() ?? '')
    .filter((n) => n !== '')
  const allAttributes = directChildren(entity, 'all-attributes').length > 0
  const aggregateRaw = fetch.getAttribute('aggregate')?.trim().toLowerCase() ?? ''
  const hasAggregate = aggregateRaw === 'true' || aggregateRaw === '1'
  const linkEntities = [...entity.getElementsByTagName('link-entity')]
    .map((l) => l.getAttribute('name')?.trim() ?? '')
    .filter((n) => n !== '')

  const warnings: string[] = []
  if (linkEntities.length > 0)
    warnings.push(
      'link-entity columns are read-only context for the pipeline — only the main entity is written.',
    )
  if (!allAttributes && attributes.length === 0 && !hasAggregate)
    warnings.push('No <attribute> selected — Dataverse returns only the primary key.')

  return { ok: true, entity: entityName, attributes, allAttributes, hasAggregate, linkEntities, warnings }
}

/** Convenience: the selected attribute names ([] on invalid XML). */
export function fetchXmlAttributes(xml: string): string[] {
  const parsed = parseFetchXml(xml)
  return parsed.ok ? parsed.attributes : []
}

/**
 * Match columns must be part of the query result. Returns the columns NOT
 * covered by the parsed FetchXML (empty when `all-attributes` is set or the
 * XML is invalid — XML validity is reported separately).
 */
export function validateMatchColumns(matchColumns: string[], parsed: ParsedFetchXml): string[] {
  if (!parsed.ok || parsed.allAttributes) return []
  const have = new Set(parsed.attributes.map((a) => a.toLowerCase()))
  return matchColumns.filter((c) => !have.has(c.trim().toLowerCase()))
}

function serialize(doc: Document): string {
  return new XMLSerializer().serializeToString(doc.documentElement)
}

/** The query's own `top` bound on <fetch>, when present and valid. */
export function fetchTop(xml: string): number | null {
  const doc = parseXmlDocument(xml)
  if (!doc || doc.documentElement.tagName !== 'fetch') return null
  const raw = doc.documentElement.getAttribute('top')
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

/**
 * Rewrite the <fetch> for a bounded preview: strip paging attributes
 * (`count`/`page`/`top`/`returntotalrecordcount`) and set `count`. A `top`
 * the author wrote themselves is honored — the effective limit is
 * min(top, count), so a `top="10"` previews exactly those 10 rows. Returns
 * the input unchanged when it does not parse (the server then reports the
 * error).
 */
export function withRowLimit(xml: string, count: number): string {
  const doc = parseXmlDocument(xml)
  if (!doc || doc.documentElement.tagName !== 'fetch') return xml
  const fetch = doc.documentElement
  const top = fetchTop(xml)
  for (const attr of ['count', 'page', 'top', 'returntotalrecordcount'])
    fetch.removeAttribute(attr)
  fetch.setAttribute('count', String(top !== null ? Math.min(top, count) : count))
  return serialize(doc)
}

/** Alias under which {@link buildCountFetchXml} returns the row count. */
export const COUNT_ALIAS = 'rowcount'

/**
 * Turn the entry's query into an aggregate-count query (same entity, same
 * filters/joins) for the preview's "≈ N total" badge: strip paging, every
 * <attribute>/<all-attributes>/<order>, set aggregate, count the primary id.
 * Returns null when the input does not parse or is itself an aggregate.
 */
export function buildCountFetchXml(xml: string, primaryIdAttribute: string): string | null {
  const parsed = parseFetchXml(xml)
  if (!parsed.ok || parsed.hasAggregate) return null
  const doc = parseXmlDocument(xml)
  if (!doc) return null
  const fetch = doc.documentElement
  for (const attr of ['count', 'page', 'top', 'returntotalrecordcount'])
    fetch.removeAttribute(attr)
  fetch.setAttribute('aggregate', 'true')
  for (const tag of ['attribute', 'all-attributes', 'order'])
    for (const el of [...doc.getElementsByTagName(tag)]) el.remove()
  const entity = directChildren(fetch, 'entity')[0]
  const countEl = doc.createElement('attribute')
  countEl.setAttribute('name', primaryIdAttribute)
  countEl.setAttribute('alias', COUNT_ALIAS)
  countEl.setAttribute('aggregate', 'count')
  entity.insertBefore(countEl, entity.firstChild)
  return serialize(doc)
}

/**
 * Replace the top-level entity's <attribute> list (column-picker apply) while
 * preserving every other child (<filter>, <order>, <link-entity>, …). The new
 * attributes are inserted where the first old one sat (else first). Returns
 * the input unchanged when it does not parse or has no single entity.
 */
export function setAttributes(xml: string, columns: string[]): string {
  const doc = parseXmlDocument(xml)
  if (!doc || doc.documentElement.tagName !== 'fetch') return xml
  const entities = directChildren(doc.documentElement, 'entity')
  if (entities.length !== 1) return xml
  const entity = entities[0]
  const old = directChildren(entity, 'attribute')
  const anchor = old.length > 0 ? old[0] : entity.firstChild
  for (const col of columns) {
    const el = doc.createElement('attribute')
    el.setAttribute('name', col)
    entity.insertBefore(el, anchor)
  }
  for (const el of old) el.remove()
  return serialize(doc)
}

/**
 * Pretty-print FetchXML for the editor textarea (view snapshots arrive as one
 * line). Elements whose children are all elements get one line per child with
 * two-space indent; elements with text content (e.g. <value>1</value> inside
 * an `in` condition) are kept inline so no whitespace leaks into values.
 * Returns the input unchanged when it does not parse.
 */
export function formatFetchXml(xml: string): string {
  const doc = parseXmlDocument(xml)
  if (!doc) return xml
  const serializer = new XMLSerializer()
  const render = (el: Element, depth: number): string => {
    const pad = '  '.repeat(depth)
    const hasText = [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''
    )
    if (hasText || el.children.length === 0)
      return pad + serializer.serializeToString(el)
    const shallow = serializer.serializeToString(el.cloneNode(false) as Element)
    const open = shallow.endsWith('/>')
      ? shallow.slice(0, -2).trimEnd() + '>'
      : shallow.slice(0, shallow.lastIndexOf('</'))
    return [
      pad + open,
      ...[...el.children].map((c) => render(c, depth + 1)),
      pad + `</${el.tagName}>`,
    ].join('\n')
  }
  return render(doc.documentElement, 0)
}

/**
 * Human-readable duration for the runs list: "50s", "3m 15s", "1h 20m 10s".
 * Sub-second and negative inputs clamp to "0s"; zero units are omitted
 * (except a lone "0s").
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

/** Split a comma string (record storage format) — trimmed, de-duplicated. */
export function parseCsvList(value: string | null | undefined): string[] {
  if (!value) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of value.split(',')) {
    const v = raw.trim()
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase())
      out.push(v)
    }
  }
  return out
}

/** Join back into the comma storage format ('' when empty). */
export function joinCsvList(values: string[]): string {
  return values.map((v) => v.trim()).filter((v) => v !== '').join(',')
}

/**
 * The executor's per-entry write recipe, computed by the hub at save time and
 * stored as JSON in `pro_transferentry.pro_columnplan_txt`. The flow executor
 * stays metadata-free: it copies `s` columns 1:1 and binds `l` lookups via
 * `<c>@odata.bind = /<s>(<guid>)`. Compact keys — the JSON travels in a memo.
 */
export interface ColumnPlan {
  /** Writable scalar columns (incl. multi-select choices as comma strings). */
  s: string[]
  /** Writable single-target lookups: column c → target entity set s. */
  l: { c: string; s: string }[]
  /** Skipped columns with reason — documentation, the executor ignores it. */
  x: { c: string; r: string }[]
}

/** Attribute metadata slice the plan builder needs (from EntityDefinitions). */
export interface PlanAttributeMeta {
  logicalName: string
  attributeType: string
  attributeTypeName: string
  isValidForCreate: boolean
  isValidForUpdate: boolean
  /** Set on virtual child attributes (e.g. `…_name` of a lookup). */
  attributeOf: string | null
}

/** Platform columns never transported (state is orphan-handling only). */
const PLAN_PLATFORM_SKIP = new Set([
  'statecode',
  'statuscode',
  'createdon',
  'modifiedon',
  'overriddencreatedon',
  'importsequencenumber',
  'timezoneruleversionnumber',
  'utcconversiontimezonecode',
  'versionnumber',
])

/**
 * Classify the entry's columns into the executor's write recipe.
 *
 * @param fetchAttrs  Attribute names selected by the query; null = all
 *                    (`all-attributes` mode).
 * @param attrs       Attribute metadata of the source table.
 * @param primaryIdAttribute  The table's primary id (written only on create).
 * @param lookupTargets  ReferencingAttribute → referenced entity logical
 *                    names (from ManyToOneRelationships; >1 = polymorphic).
 * @param entitySetByTable  Logical name → entity set for the lookup targets.
 */
export function buildColumnPlan(
  fetchAttrs: string[] | null,
  attrs: PlanAttributeMeta[],
  primaryIdAttribute: string,
  lookupTargets: Record<string, string[]>,
  entitySetByTable: Record<string, string>,
): ColumnPlan {
  const plan: ColumnPlan = { s: [], l: [], x: [] }
  const byName = new Map(attrs.map((a) => [a.logicalName, a]))
  const wanted =
    fetchAttrs === null
      ? attrs.map((a) => a.logicalName)
      : [...fetchAttrs]
  const skip = (c: string, r: string) => plan.x.push({ c, r })

  for (const col of [...new Set(wanted)].sort()) {
    const meta = byName.get(col)
    if (!meta) {
      skip(col, 'not in metadata')
      continue
    }
    if (col === primaryIdAttribute) {
      skip(col, 'primary id (written on create)')
      continue
    }
    if (meta.attributeOf) {
      skip(col, 'virtual')
      continue
    }
    if (PLAN_PLATFORM_SKIP.has(col)) {
      skip(col, 'platform')
      continue
    }
    if (!meta.isValidForCreate && !meta.isValidForUpdate) {
      skip(col, 'read-only')
      continue
    }
    const type = meta.attributeType
    if (type === 'Owner' || col === 'ownerid') {
      skip(col, 'owner')
      continue
    }
    if (type === 'Lookup' || type === 'Customer') {
      const targets = [...new Set(lookupTargets[col] ?? [])]
      if (targets.length !== 1) {
        skip(col, targets.length === 0 ? 'lookup target unknown' : 'polymorphic lookup')
        continue
      }
      const set = entitySetByTable[targets[0]]
      if (!set) {
        skip(col, 'lookup target set unknown')
        continue
      }
      plan.l.push({ c: col, s: set })
      continue
    }
    if (type === 'Virtual') {
      if (meta.attributeTypeName === 'MultiSelectPicklistType') plan.s.push(col)
      else skip(col, 'virtual')
      continue
    }
    if (type === 'PartyList' || type === 'ManagedProperty' || type === 'EntityName' || type === 'File' || type === 'Image') {
      skip(col, 'unsupported type')
      continue
    }
    plan.s.push(col)
  }
  return plan
}

/** One parsed line of the executor's pro_log_txt (entry × target cell). */
export interface RunLogRow {
  entry: string
  target: string
  created: number
  updated: number
  deactivated: number
  deleted: number
  /** Row-level errors/warnings collected by the executor. */
  errors: string[]
  /** Entry-level failure message (no counters were produced). */
  error: string
}

/**
 * Parse the executor's log JSON into rows for the run-details subgrid.
 * Returns null when the log is empty or not the expected array shape —
 * the UI then falls back to showing the raw text.
 */
export function parseRunLog(log: string): RunLogRow[] | null {
  if (!log.trim()) return null
  try {
    const data: unknown = JSON.parse(log)
    if (!Array.isArray(data)) return null
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    const str = (v: unknown) => (typeof v === 'string' ? v : '')
    return data.map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>
      return {
        entry: str(r.entry),
        target: str(r.target),
        created: num(r.created),
        updated: num(r.updated),
        deactivated: num(r.deactivated),
        deleted: num(r.deleted),
        errors: Array.isArray(r.errors) ? r.errors.map((e) => String(e)) : [],
        error: str(r.error),
      }
    })
  } catch {
    return null
  }
}

/**
 * Composite match keys are built from a fixed 5-slot concat in the executor
 * flow — more columns cannot be expressed there, so the save gate rejects
 * them instead of letting the run fail per entry.
 */
export const MAX_MATCH_COLUMNS = 5

/** The dialog's draft shape — everything the save gate needs. */
export interface TransferEntryDraft {
  sourceEnvKey: string
  tableLogicalName: string
  queryMode: 'view' | 'fetchxml'
  viewId: string
  fetchXml: string
  matchMode: 'guid' | 'columns'
  matchColumns: string[]
}

/**
 * Aggregated save gate shared by the entry dialog and its tests. Returns
 * human-readable blockers ([] = saveable).
 */
export function describeEntryValidation(draft: TransferEntryDraft): string[] {
  const errors: string[] = []
  if (!draft.sourceEnvKey) errors.push('Pick a source environment.')
  if (!draft.tableLogicalName) errors.push('Pick a source table.')
  if (draft.queryMode === 'view') {
    if (!draft.viewId) errors.push('Pick a saved view.')
  } else {
    const parsed = parseFetchXml(draft.fetchXml)
    if (!parsed.ok) {
      errors.push(`FetchXML: ${parsed.error}`)
    } else if (
      draft.tableLogicalName &&
      parsed.entity.toLowerCase() !== draft.tableLogicalName.toLowerCase()
    ) {
      errors.push(
        `FetchXML queries <entity name="${parsed.entity}"> but the selected table is ${draft.tableLogicalName}.`,
      )
    }
  }
  if (draft.matchMode === 'columns') {
    if (draft.matchColumns.length === 0) {
      errors.push('Match by columns needs at least one column.')
    } else if (draft.matchColumns.length > MAX_MATCH_COLUMNS) {
      errors.push(
        `At most ${MAX_MATCH_COLUMNS} match columns are supported (picked ${draft.matchColumns.length}).`,
      )
    } else if (draft.queryMode === 'fetchxml') {
      const missing = validateMatchColumns(draft.matchColumns, parseFetchXml(draft.fetchXml))
      if (missing.length > 0)
        errors.push(`Match columns missing from the FetchXML attributes: ${missing.join(', ')}.`)
    }
  }
  return errors
}
