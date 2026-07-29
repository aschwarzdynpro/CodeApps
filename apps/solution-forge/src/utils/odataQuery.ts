import type {
  ColumnKind,
  ColumnMeta,
  EntityMeta,
  ODataQuery,
  RawAttribute,
} from '../types/odataBrowser'

/**
 * OData Browser — pure query helpers.
 *
 * Everything here is side-effect free so it can be unit-tested without a
 * connector: classifying an attribute into "can this go into `$select`, and
 * what does it look like", rendering the query into the two shapes we need
 * (connector parameters vs. a copyable Web API URL) and reading the paging
 * cursor back out of `@odata.nextLink`.
 *
 * Two renderers exist on purpose:
 *  - `renderQueryOptions` returns values **unencoded** — the connector takes
 *    them as operation parameters and encodes them itself. Encoding here would
 *    double-encode and break every filter.
 *  - `toWebApiUrl` returns a percent-encoded URL for the Copy button / opening
 *    the query in a browser tab.
 */

/** Default rows per request — deliberately small, this is a browser. */
export const DEFAULT_PAGE_SIZE = 50
/** Dataverse caps a page at 5000 rows no matter what `$top` says. */
export const MAX_TOP = 5000
export const PAGE_SIZE_OPTIONS = [50, 100, 250, 1000] as const
/** Web API version used for the copyable URL. */
export const API_VERSION = 'v9.2'

/**
 * A fresh query. `$top` starts **unset** on purpose: paging is driven by
 * `pageSize` (the server page), so the browser fetches one small page and
 * offers "load more". Setting `$top` equal to the page size instead would
 * satisfy the request in one page, the server would send no `@odata.nextLink`,
 * and paging would look broken. `$top` is therefore an optional hard ceiling,
 * not the page size.
 */
export function emptyQuery(entitySet = ''): ODataQuery {
  return {
    entitySet,
    select: [],
    orderBy: [],
    filterRaw: null,
    expandRaw: null,
    top: null,
    pageSize: DEFAULT_PAGE_SIZE,
    annotations: true,
  }
}

/**
 * Map a Dataverse attribute type onto the coarse kind the UI works with.
 * `AttributeTypeName` wins where it is more specific than `AttributeType` —
 * a multi-select choice reports `AttributeType: 'Virtual'` but
 * `AttributeTypeName: 'MultiSelectPicklistType'`, and treating it as "virtual"
 * would wrongly hide it.
 */
function kindOf(attributeType: string, attributeTypeName: string): ColumnKind {
  if (attributeTypeName === 'MultiSelectPicklistType') return 'multichoice'
  switch (attributeType) {
    case 'String':
    case 'Memo':
    case 'EntityName':
      return 'string'
    case 'Integer':
    case 'BigInt':
    case 'Decimal':
    case 'Double':
      return 'number'
    case 'Money':
      return 'money'
    case 'Boolean':
      return 'boolean'
    case 'DateTime':
      return 'datetime'
    case 'Picklist':
    case 'State':
    case 'Status':
      return 'choice'
    case 'Lookup':
    case 'Customer':
    case 'Owner':
      return 'lookup'
    case 'Uniqueidentifier':
      return 'guid'
    default:
      return 'other'
  }
}

/**
 * Decide whether an attribute can appear in `$select` and under which name.
 *
 * The traps this encodes, all of which produce a server fault otherwise:
 *  - lookups must be selected as **`_<logical>_value`**, never by their own
 *    name (the plain name is the navigation property);
 *  - attributes with `AttributeOf` set are derived siblings (`<money>_base`,
 *    label attributes) and are rejected by `$select`;
 *  - `IsValidForRead: false`, party lists, file/image and the remaining
 *    virtual types cannot be selected at all.
 */
export function classifyColumn(raw: RawAttribute): ColumnMeta {
  const kind = kindOf(raw.attributeType, raw.attributeTypeName)
  const base: ColumnMeta = {
    ...raw,
    kind,
    selectName: raw.logicalName,
    selectable: true,
    unselectableReason: null,
  }
  const block = (reason: string): ColumnMeta => ({
    ...base,
    selectName: '',
    selectable: false,
    unselectableReason: reason,
  })

  if (!raw.isValidForRead) return block('not readable')
  if (raw.attributeOf) return block(`derived from ${raw.attributeOf}`)
  if (raw.attributeType === 'PartyList')
    return block('party list — needs $expand')
  if (raw.attributeType === 'CalendarRules') return block('calendar rules')
  if (
    raw.attributeTypeName === 'FileType' ||
    raw.attributeTypeName === 'ImageType'
  )
    return block('file/image column')
  if (raw.attributeType === 'Virtual' && kind !== 'multichoice')
    return block('virtual attribute')

  if (kind === 'lookup')
    return { ...base, selectName: `_${raw.logicalName}_value` }
  return base
}

/** Columns offered in the picker — selectable ones first, then by label. */
export function sortColumns(columns: ColumnMeta[]): ColumnMeta[] {
  return [...columns].sort(
    (a, b) =>
      Number(b.selectable) - Number(a.selectable) ||
      Number(b.isPrimaryId) - Number(a.isPrimaryId) ||
      Number(b.isPrimaryName) - Number(a.isPrimaryName) ||
      a.displayName.localeCompare(b.displayName),
  )
}

/** Columns a freshly picked table starts with — id, name, then the usual suspects. */
const PREFERRED_DEFAULTS = [
  'createdon',
  'modifiedon',
  'statecode',
  'statuscode',
  'ownerid',
]

export function defaultSelect(meta: EntityMeta): string[] {
  const byName = new Map(meta.columns.map((c) => [c.logicalName, c]))
  const picked: string[] = []
  const push = (logicalName: string) => {
    const col = byName.get(logicalName)
    if (!col?.selectable) return
    if (!picked.includes(col.selectName)) picked.push(col.selectName)
  }
  push(meta.ref.primaryIdAttribute)
  push(meta.ref.primaryNameAttribute)
  for (const name of PREFERRED_DEFAULTS) push(name)
  return picked
}

/** Clamp a user-entered `$top` into what Dataverse actually honours. */
export function clampTop(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE
  return Math.min(MAX_TOP, Math.max(1, Math.floor(value)))
}

export interface QueryOptions {
  select?: string
  filter?: string
  orderby?: string
  expand?: string
  top?: number
}

/** Query options as the connector wants them: raw, unencoded, empty omitted. */
export function renderQueryOptions(q: ODataQuery): QueryOptions {
  const opts: QueryOptions = {}
  if (q.select.length > 0) opts.select = q.select.join(',')
  const filter = q.filterRaw?.trim()
  if (filter) opts.filter = filter
  if (q.orderBy.length > 0)
    opts.orderby = q.orderBy
      .map((o) => `${o.column} ${o.desc ? 'desc' : 'asc'}`)
      .join(',')
  const expand = q.expandRaw?.trim()
  if (expand) opts.expand = expand
  if (q.top !== null) opts.top = clampTop(q.top)
  return opts
}

/**
 * The `prefer` header. `include-annotations` is what makes the grid able to
 * show "Active" instead of 0 and a contact name instead of a GUID;
 * `maxpagesize` is what makes the server hand back an `@odata.nextLink`.
 */
export function preferHeader(q: ODataQuery): string | undefined {
  const parts: string[] = []
  if (q.annotations) parts.push('odata.include-annotations="*"')
  if (q.pageSize > 0) parts.push(`odata.maxpagesize=${Math.floor(q.pageSize)}`)
  return parts.length > 0 ? parts.join(',') : undefined
}

/** The query as a human-readable relative path — shown above the grid. */
export function toQueryPath(q: ODataQuery): string {
  if (!q.entitySet) return ''
  const opts = renderQueryOptions(q)
  const parts: string[] = []
  if (opts.select) parts.push(`$select=${opts.select}`)
  if (opts.filter) parts.push(`$filter=${opts.filter}`)
  if (opts.expand) parts.push(`$expand=${opts.expand}`)
  if (opts.orderby) parts.push(`$orderby=${opts.orderby}`)
  if (opts.top !== undefined) parts.push(`$top=${opts.top}`)
  return `/${q.entitySet}${parts.length > 0 ? `?${parts.join('&')}` : ''}`
}

/** The full, percent-encoded Web API URL — for Copy / open in a browser tab. */
export function toWebApiUrl(orgUrl: string, q: ODataQuery): string {
  if (!q.entitySet) return ''
  const opts = renderQueryOptions(q)
  const pairs: [string, string][] = []
  if (opts.select) pairs.push(['$select', opts.select])
  if (opts.filter) pairs.push(['$filter', opts.filter])
  if (opts.expand) pairs.push(['$expand', opts.expand])
  if (opts.orderby) pairs.push(['$orderby', opts.orderby])
  if (opts.top !== undefined) pairs.push(['$top', String(opts.top)])
  const query = pairs
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  const base = `${orgUrl.replace(/\/+$/, '')}/api/data/${API_VERSION}/${q.entitySet}`
  return query ? `${base}?${query}` : base
}

/**
 * Pull the continuation cursor out of an `@odata.nextLink`. Dataverse returns
 * the whole next URL; the connector only takes the token, so we extract it
 * (and un-escape it, since it arrives percent-encoded inside the URL).
 */
export function skipTokenFrom(nextLink: unknown): string | null {
  if (typeof nextLink !== 'string' || nextLink === '') return null
  const match = nextLink.match(/[?&]\$skiptoken=([^&]+)/i)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}
