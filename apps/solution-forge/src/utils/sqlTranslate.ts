import type {
  ColumnKind,
  EntityMeta,
  EntityRef,
  FilterCondition,
  FilterNode,
  ODataQuery,
} from '../types/odataBrowser'
import { logicalNameOf, operatorDef } from './odataFilter'
import { splitExpand, expandNavigationName, type Columns } from './odataQuery'
import { isoDate } from './sqlQuery'

/**
 * Data Browser — translating the other two query languages **into** SQL.
 *
 * Two pure translators, one per source:
 *  - `odataToSql`     the builder's `ODataQuery` → a Dataverse SQL statement
 *  - `fetchXmlToSql`  a FetchXML document → a Dataverse SQL statement
 *
 * Both target the T-SQL subset Dataverse documents for `?sql=` (the same
 * subset `sqlQuery.ts` parses back), so a translation can be run in the SQL
 * tab immediately. Neither is lossless, and neither pretends to be: anything
 * SQL cannot say — a user-context function like `EqualUserId`, a multi-select
 * `ContainValues`, a raw `$filter` the builder never modelled — is **dropped
 * and reported in `notes`**, and the notes are rendered as `--` comment lines
 * on top of the statement so a copied query carries its own caveats.
 * Dropping a condition widens the result, which is why the note is not
 * optional: a silently narrower-or-wider query is the one failure mode this
 * module must never have.
 *
 * Relative date operators (`Today`, `LastXDays`, …) are rendered against
 * `GETUTCDATE()`/`DATEADD` where SQL has the vocabulary and against literal
 * UTC boundaries computed from `now` otherwise (injectable for tests).
 *
 * `fetchXmlToSql` needs a DOM (`DOMParser`) — the browser has one, tests run
 * under `@vitest-environment jsdom`.
 */

export interface SqlTranslation {
  sql: string
  /** Why the SQL is not exactly the source — also written as `--` lines. */
  notes: string[]
}

// ---------------------------------------------------------------------------
// Shared rendering helpers
// ---------------------------------------------------------------------------

/** SQL string literal — single quotes doubled. */
export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Escape LIKE wildcards in a value that must match literally. */
export function likeEscape(value: string): string {
  return value.replace(/[%_[]/g, (ch) => `[${ch}]`)
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Render a raw user value as a SQL literal fitting the column's kind. */
export function sqlLiteral(kind: ColumnKind, raw: string): string {
  const value = raw.trim()
  switch (kind) {
    case 'number':
    case 'money':
    case 'choice':
    case 'multichoice':
      return NUMBER_RE.test(value) ? value : sqlString(value)
    case 'boolean':
      return /^(true|1|yes)$/i.test(value) ? '1' : '0'
    case 'guid':
    case 'lookup':
      return GUID_RE.test(value) ? sqlString(value.toLowerCase()) : sqlString(value)
    case 'datetime':
    case 'dateonly':
      return sqlString(value)
    default:
      return NUMBER_RE.test(value) && kind === 'other' ? value : sqlString(value)
  }
}

/** Start of the UTC day / month / year containing `now`, as ISO. */
function utcDayStart(now: Date, offsetDays = 0): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays))
  return isoDate(d)
}
function utcMonthStart(now: Date, offsetMonths = 0): string {
  return isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1)))
}
function utcYearStart(now: Date, offsetYears = 0): string {
  return isoDate(new Date(Date.UTC(now.getUTCFullYear() + offsetYears, 0, 1)))
}

/** `col >= 'a' AND col < 'b'` — the half-open range every date shortcut becomes. */
function range(column: string, from: string, to: string): string {
  return `(${column} >= ${sqlString(from)} AND ${column} < ${sqlString(to)})`
}

/** A `--` comment block for the notes, above the statement. */
export function withNoteHeader(sql: string, notes: string[]): string {
  if (notes.length === 0) return sql
  return `${notes.map((n) => `-- ${n}`).join('\n')}\n${sql}`
}

/** A short, unique alias for a table: first letter after the publisher prefix. */
export function shortAlias(logicalName: string, taken: Set<string>): string {
  const base = logicalName.replace(/^[a-z0-9]+_/, '') || logicalName
  const letter = (base[0] ?? 't').toLowerCase()
  let candidate = letter
  let i = 2
  while (taken.has(candidate)) candidate = `${letter}${i++}`
  taken.add(candidate)
  return candidate
}

// ---------------------------------------------------------------------------
// OData → SQL
// ---------------------------------------------------------------------------

export interface OdataToSqlContext {
  /** Column metadata of the main table (kinds drive literal quoting). */
  columns: Columns
  /** The main table, for logical name / primary columns; null for metadata sets. */
  meta: EntityMeta | null
  /** All tables, to resolve `$expand` targets to their primary key. */
  entities: EntityRef[]
  now?: Date
}

/**
 * Render one builder condition as SQL, or null when it cannot be said —
 * the caller adds the note. `qualifier` is the table alias to prefix columns
 * with (empty = none).
 */
function conditionToSql(
  cond: FilterCondition,
  columns: Columns,
  qualifier: string,
  now: Date,
): { sql: string } | { dropped: string } | null {
  const def = operatorDef(cond.operator)
  if (!def || !cond.column) return null
  const kind = columns.get(cond.column)?.kind ?? 'string'
  const column = `${qualifier}${logicalNameOf(cond.column)}`
  const values = cond.values.map((v) => v.trim())
  const label = `${cond.column} ${cond.operator}${values.length ? ` ${values.join(', ')}` : ''}`

  if (def.arity === 'list') {
    const list = values.filter((v) => v !== '')
    if (list.length === 0) return null
    if (cond.operator === 'containvalues')
      return { dropped: `“${label}” (ContainValues on a multi-select choice has no SQL form)` }
    return { sql: `${column} IN (${list.map((v) => sqlLiteral(kind, v)).join(', ')})` }
  }

  if (def.arity === 0) {
    switch (cond.operator) {
      case 'null':
        return { sql: `${column} IS NULL` }
      case 'notnull':
        return { sql: `${column} IS NOT NULL` }
      case 'today':
        return { sql: range(column, utcDayStart(now), utcDayStart(now, 1)) }
      case 'yesterday':
        return { sql: range(column, utcDayStart(now, -1), utcDayStart(now)) }
      case 'thismonth':
        return { sql: range(column, utcMonthStart(now), utcMonthStart(now, 1)) }
      case 'thisyear':
        return { sql: range(column, utcYearStart(now), utcYearStart(now, 1)) }
      case 'equaluserid':
        return { dropped: `“${label}” (EqualUserId — SQL has no current-user context)` }
      case 'equalbusinessid':
        return { dropped: `“${label}” (EqualBusinessId — SQL has no current-user context)` }
      default:
        return null
    }
  }

  if (def.arity === 2) {
    const [from, to] = values
    if (!from || !to) return null
    return { sql: `${column} BETWEEN ${sqlLiteral(kind, from)} AND ${sqlLiteral(kind, to)}` }
  }

  const value = values[0]
  if (value === undefined || value === '') return null
  const days = Math.max(1, Math.floor(Number(value)) || 1)
  switch (cond.operator) {
    case 'contains':
      return { sql: `${column} LIKE ${sqlString(`%${likeEscape(value)}%`)}` }
    case 'notcontains':
      return { sql: `${column} NOT LIKE ${sqlString(`%${likeEscape(value)}%`)}` }
    case 'startswith':
      return { sql: `${column} LIKE ${sqlString(`${likeEscape(value)}%`)}` }
    case 'endswith':
      return { sql: `${column} LIKE ${sqlString(`%${likeEscape(value)}`)}` }
    case 'lastxdays':
      return { sql: `${column} >= DATEADD(day, -${days}, GETUTCDATE())` }
    case 'nextxdays':
      return { sql: `(${column} >= GETUTCDATE() AND ${column} <= DATEADD(day, ${days}, GETUTCDATE()))` }
    case 'olderthanxdays':
      return { sql: `${column} < DATEADD(day, -${days}, GETUTCDATE())` }
    case 'eq':
      return { sql: `${column} = ${sqlLiteral(kind, value)}` }
    case 'ne':
      return { sql: `${column} <> ${sqlLiteral(kind, value)}` }
    case 'gt':
      return { sql: `${column} > ${sqlLiteral(kind, value)}` }
    case 'ge':
      return { sql: `${column} >= ${sqlLiteral(kind, value)}` }
    case 'lt':
      return { sql: `${column} < ${sqlLiteral(kind, value)}` }
    case 'le':
      return { sql: `${column} <= ${sqlLiteral(kind, value)}` }
    default:
      return null
  }
}

/** Render a filter tree; nested groups are parenthesised. */
function filterTreeToSql(
  node: FilterNode,
  columns: Columns,
  qualifier: string,
  now: Date,
  notes: string[],
  nested: boolean,
): string | null {
  if (node.kind === 'cond') {
    const rendered = conditionToSql(node, columns, qualifier, now)
    if (!rendered) return null
    if ('dropped' in rendered) {
      notes.push(`Dropped condition ${rendered.dropped}.`)
      return null
    }
    return rendered.sql
  }
  const parts = node.children
    .map((child) => filterTreeToSql(child, columns, qualifier, now, notes, true))
    .filter((part): part is string => part !== null && part !== '')
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  const joined = parts.join(` ${node.op.toUpperCase()} `)
  return nested ? `(${joined})` : joined
}

/**
 * The builder's query as SQL. Columns come out unqualified unless `$expand`
 * adds a join, in which case the main table gets a short alias and every
 * expanded navigation property becomes a `LEFT JOIN` aliased by its name.
 */
export function odataToSql(query: ODataQuery, ctx: OdataToSqlContext): SqlTranslation {
  const notes: string[] = []
  const now = ctx.now ?? new Date()
  const table =
    ctx.meta?.ref.logicalName ??
    ctx.entities.find((e) => e.entitySet === query.entitySet)?.logicalName ??
    query.entitySet
  if (!ctx.meta && !ctx.entities.some((e) => e.entitySet === query.entitySet))
    notes.push(`“${query.entitySet}” is not a table — metadata sets have no SQL equivalent.`)

  // Joins first: they decide whether columns need a qualifier at all.
  const expandClauses = splitExpand(query.expandRaw)
  const taken = new Set<string>()
  const joins: { alias: string; target: string; from: string; to: string; columns: string[] }[] = []
  let mainAlias = ''
  if (expandClauses.length > 0) {
    mainAlias = shortAlias(table, taken)
    for (const clause of expandClauses) {
      const nav = expandNavigationName(clause)
      const lookup = ctx.meta?.lookups.find((l) => l.navigationName === nav)
      const target = lookup && ctx.entities.find((e) => e.logicalName === lookup.targetEntity)
      if (!lookup || !target) {
        notes.push(`Dropped $expand=${clause} — ${lookup ? `the target table “${lookup.targetEntity}” is unknown` : 'not a single-valued navigation property of this table'}.`)
        continue
      }
      let alias = nav
      if (taken.has(nav)) alias = shortAlias(nav, taken)
      else taken.add(nav)
      const nestedSelect = clause.match(/\$select=([^;)]+)/)?.[1]
      const columns = nestedSelect
        ? nestedSelect.split(',').map((c) => c.trim()).filter(Boolean)
        : [target.primaryNameAttribute]
      if (!nestedSelect)
        notes.push(`$expand=${nav} had no $select — joined only “${target.primaryNameAttribute}” (SELECT * is not supported).`)
      joins.push({
        alias,
        target: target.logicalName,
        from: logicalNameOf(lookup.valueColumn),
        to: target.primaryIdAttribute,
        columns: columns.map((c) => logicalNameOf(c)),
      })
    }
  }
  const q = mainAlias ? `${mainAlias}.` : ''

  // SELECT
  let selectCols: string[]
  if (query.select.length > 0) {
    selectCols = query.select.map((s) => `${q}${logicalNameOf(s)}`)
  } else if (ctx.meta) {
    const { primaryIdAttribute, primaryNameAttribute } = ctx.meta.ref
    selectCols = [primaryIdAttribute, primaryNameAttribute].filter(Boolean).map((c) => `${q}${c}`)
    notes.push('No $select — SQL has no SELECT *; listing the primary key and name. Add the columns you need.')
  } else {
    selectCols = [`${q}*`]
    notes.push('No $select — SELECT * is not supported by Dataverse SQL; name the columns.')
  }
  for (const join of joins) for (const col of join.columns) selectCols.push(`${join.alias}.${col}`)

  const top = query.top !== null ? `TOP ${query.top} ` : ''
  const lines: string[] = [`SELECT ${top}${selectCols.join(', ')}`]
  lines.push(`FROM ${table}${mainAlias ? ` AS ${mainAlias}` : ''}`)
  for (const join of joins)
    lines.push(`LEFT JOIN ${join.target} AS ${join.alias} ON ${q}${join.from} = ${join.alias}.${join.to}`)

  // WHERE
  if (query.filter) {
    const where = filterTreeToSql(query.filter, ctx.columns, q, now, notes, false)
    if (where) lines.push(`WHERE ${where}`)
  } else if (query.filterRaw?.trim()) {
    notes.push(`Dropped the raw $filter — it is beyond the builder's grammar and cannot be translated: ${query.filterRaw.trim()}`)
  }

  // ORDER BY
  if (query.orderBy.length > 0)
    lines.push(
      `ORDER BY ${query.orderBy.map((o) => `${q}${logicalNameOf(o.column)}${o.desc ? ' DESC' : ''}`).join(', ')}`,
    )

  if (query.top === null)
    notes.push('Paging: the native ?sql= endpoint pages via Prefer: odata.maxpagesize; the SQL tab runs one page of at most 5000 rows.')

  return { sql: lines.join('\n'), notes }
}

// ---------------------------------------------------------------------------
// FetchXML → SQL
// ---------------------------------------------------------------------------

export interface FetchXmlToSqlOk {
  ok: true
  sql: string
  notes: string[]
}
export interface FetchXmlToSqlError {
  ok: false
  error: string
}
export type FetchXmlToSqlResult = FetchXmlToSqlOk | FetchXmlToSqlError

/** FetchXML condition operators with a direct SQL comparison. */
const FETCH_COMPARE: Record<string, string> = {
  eq: '=',
  ne: '<>',
  neq: '<>',
  gt: '>',
  ge: '>=',
  lt: '<',
  le: '<=',
  on: '=',
  'on-or-after': '>=',
  'on-or-before': '<=',
}

interface FetchScope {
  /** Alias prefix (`c.`) or '' for the main table when there are no joins. */
  q: string
}

function attrValue(el: Element, name: string): string | null {
  const value = el.getAttribute(name)
  return value === null ? null : value
}

/** The literal a `<condition value>` carries — quoted unless it is a number/GUID-free numeric. */
function fetchLiteral(value: string): string {
  const trimmed = value.trim()
  return NUMBER_RE.test(trimmed) ? trimmed : sqlString(trimmed)
}

/**
 * Translate one `<condition>` — null when the operator has no SQL
 * equivalent (the caller notes it). `aliasOf` resolves `entityname`.
 */
function fetchConditionToSql(
  el: Element,
  scope: FetchScope,
  aliasOf: (entityName: string) => string | null,
  now: Date,
  notes: string[],
): string | null {
  const attribute = attrValue(el, 'attribute') ?? ''
  const operator = (attrValue(el, 'operator') ?? '').toLowerCase()
  const entityName = attrValue(el, 'entityname')
  let column: string
  if (entityName) {
    const alias = aliasOf(entityName)
    if (!alias) {
      notes.push(`Dropped condition on “${entityName}.${attribute}” — unknown link alias.`)
      return null
    }
    column = `${alias}.${attribute}`
  } else {
    column = `${scope.q}${attribute}`
  }
  const value = attrValue(el, 'value')
  const values = [...el.getElementsByTagName('value')].map((v) => v.textContent ?? '')
  const n = Math.max(1, Math.floor(Number(value ?? '1')) || 1)

  const drop = (why: string): null => {
    notes.push(`Dropped condition “${attribute} ${operator}${value !== null ? ` ${value}` : ''}” (${why}).`)
    return null
  }

  if (operator in FETCH_COMPARE) {
    if (value === null) return drop('no value')
    return `${column} ${FETCH_COMPARE[operator]} ${fetchLiteral(value)}`
  }
  switch (operator) {
    case 'like':
      return value === null ? drop('no value') : `${column} LIKE ${sqlString(value)}`
    case 'not-like':
      return value === null ? drop('no value') : `${column} NOT LIKE ${sqlString(value)}`
    case 'begins-with':
      return value === null ? drop('no value') : `${column} LIKE ${sqlString(`${likeEscape(value)}%`)}`
    case 'not-begin-with':
      return value === null ? drop('no value') : `${column} NOT LIKE ${sqlString(`${likeEscape(value)}%`)}`
    case 'ends-with':
      return value === null ? drop('no value') : `${column} LIKE ${sqlString(`%${likeEscape(value)}`)}`
    case 'not-end-with':
      return value === null ? drop('no value') : `${column} NOT LIKE ${sqlString(`%${likeEscape(value)}`)}`
    case 'contains':
      return value === null ? drop('no value') : `${column} LIKE ${sqlString(`%${likeEscape(value)}%`)}`
    case 'does-not-contain':
      return value === null ? drop('no value') : `${column} NOT LIKE ${sqlString(`%${likeEscape(value)}%`)}`
    case 'null':
      return `${column} IS NULL`
    case 'not-null':
      return `${column} IS NOT NULL`
    case 'in':
    case 'not-in': {
      const list = values.length > 0 ? values : value !== null ? [value] : []
      if (list.length === 0) return drop('no values')
      return `${column} ${operator === 'in' ? 'IN' : 'NOT IN'} (${list.map(fetchLiteral).join(', ')})`
    }
    case 'between':
    case 'not-between': {
      if (values.length < 2) return drop('needs two values')
      return `${column} ${operator === 'between' ? 'BETWEEN' : 'NOT BETWEEN'} ${fetchLiteral(values[0])} AND ${fetchLiteral(values[1])}`
    }
    case 'today':
      return range(column, utcDayStart(now), utcDayStart(now, 1))
    case 'yesterday':
      return range(column, utcDayStart(now, -1), utcDayStart(now))
    case 'tomorrow':
      return range(column, utcDayStart(now, 1), utcDayStart(now, 2))
    case 'this-month':
      return range(column, utcMonthStart(now), utcMonthStart(now, 1))
    case 'last-month':
      return range(column, utcMonthStart(now, -1), utcMonthStart(now))
    case 'next-month':
      return range(column, utcMonthStart(now, 1), utcMonthStart(now, 2))
    case 'this-year':
      return range(column, utcYearStart(now), utcYearStart(now, 1))
    case 'last-year':
      return range(column, utcYearStart(now, -1), utcYearStart(now))
    case 'next-year':
      return range(column, utcYearStart(now, 1), utcYearStart(now, 2))
    case 'last-x-days':
      return `${column} >= DATEADD(day, -${n}, GETUTCDATE())`
    case 'next-x-days':
      return `(${column} >= GETUTCDATE() AND ${column} <= DATEADD(day, ${n}, GETUTCDATE()))`
    case 'last-x-hours':
      return `${column} >= DATEADD(hour, -${n}, GETUTCDATE())`
    case 'next-x-hours':
      return `(${column} >= GETUTCDATE() AND ${column} <= DATEADD(hour, ${n}, GETUTCDATE()))`
    case 'last-x-weeks':
      return `${column} >= DATEADD(week, -${n}, GETUTCDATE())`
    case 'next-x-weeks':
      return `(${column} >= GETUTCDATE() AND ${column} <= DATEADD(week, ${n}, GETUTCDATE()))`
    case 'last-x-months':
      return `${column} >= DATEADD(month, -${n}, GETUTCDATE())`
    case 'next-x-months':
      return `(${column} >= GETUTCDATE() AND ${column} <= DATEADD(month, ${n}, GETUTCDATE()))`
    case 'last-x-years':
      return `${column} >= DATEADD(year, -${n}, GETUTCDATE())`
    case 'next-x-years':
      return `(${column} >= GETUTCDATE() AND ${column} <= DATEADD(year, ${n}, GETUTCDATE()))`
    case 'olderthan-x-minutes':
      return `${column} < DATEADD(minute, -${n}, GETUTCDATE())`
    case 'olderthan-x-hours':
      return `${column} < DATEADD(hour, -${n}, GETUTCDATE())`
    case 'olderthan-x-days':
      return `${column} < DATEADD(day, -${n}, GETUTCDATE())`
    case 'olderthan-x-weeks':
      return `${column} < DATEADD(week, -${n}, GETUTCDATE())`
    case 'olderthan-x-months':
      return `${column} < DATEADD(month, -${n}, GETUTCDATE())`
    case 'olderthan-x-years':
      return `${column} < DATEADD(year, -${n}, GETUTCDATE())`
    default:
      return drop('no SQL equivalent — user/team/hierarchy/fiscal operators need FetchXML')
  }
}

/** Translate a `<filter>` element (recursively). Returns null when empty. */
function fetchFilterToSql(
  el: Element,
  scope: FetchScope,
  aliasOf: (entityName: string) => string | null,
  now: Date,
  notes: string[],
  nested: boolean,
): string | null {
  const op = (attrValue(el, 'type') ?? 'and').toLowerCase() === 'or' ? 'OR' : 'AND'
  const parts: string[] = []
  for (const child of [...el.children]) {
    let rendered: string | null = null
    if (child.tagName === 'condition') rendered = fetchConditionToSql(child, scope, aliasOf, now, notes)
    else if (child.tagName === 'filter') rendered = fetchFilterToSql(child, scope, aliasOf, now, notes, true)
    else notes.push(`Ignored <${child.tagName}> inside <filter>.`)
    if (rendered) parts.push(rendered)
  }
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  const joined = parts.join(` ${op} `)
  return nested ? `(${joined})` : joined
}

interface FetchJoin {
  type: 'INNER' | 'LEFT'
  table: string
  alias: string
  parentQ: string
  from: string
  to: string
  extra: string | null
}

/**
 * Translate a FetchXML document to SQL. Every `<link-entity>` becomes a
 * join (nested links chain on their parent's alias), link filters go into
 * the `ON` clause so an outer join keeps its meaning, aggregates map to the
 * five SQL functions and `count`/`page` to `OFFSET … FETCH`.
 */
export function fetchXmlToSql(xml: string, now: Date = new Date()): FetchXmlToSqlResult {
  const trimmed = xml.trim()
  if (!trimmed) return { ok: false, error: 'FetchXML is empty.' }
  const doc = new DOMParser().parseFromString(trimmed, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0)
    return { ok: false, error: 'Not well-formed XML.' }
  const fetch = doc.documentElement
  if (fetch.tagName !== 'fetch')
    return { ok: false, error: `Root element must be <fetch> (found <${fetch.tagName}>).` }
  const entity = [...fetch.children].find((c) => c.tagName === 'entity')
  if (!entity) return { ok: false, error: 'No <entity> under <fetch>.' }
  const table = attrValue(entity, 'name')?.trim() ?? ''
  if (!table) return { ok: false, error: '<entity> has no name attribute.' }

  const notes: string[] = []
  const aggregate = /^(true|1)$/i.test(attrValue(fetch, 'aggregate') ?? '')
  const distinct = /^(true|1)$/i.test(attrValue(fetch, 'distinct') ?? '')
  const top = attrValue(fetch, 'top')
  const count = attrValue(fetch, 'count')
  const page = attrValue(fetch, 'page')
  for (const ignored of ['returntotalrecordcount', 'no-lock', 'useraworderby', 'latematerialize'])
    if (fetch.hasAttribute(ignored)) notes.push(`Ignored <fetch ${ignored}> — no SQL equivalent.`)

  // Aliases: only qualify when there is at least one link-entity.
  const hasLinks = entity.getElementsByTagName('link-entity').length > 0
  const taken = new Set<string>()
  const mainAlias = hasLinks ? shortAlias(table, taken) : ''
  const mainQ = mainAlias ? `${mainAlias}.` : ''
  /** entityname (link alias as written, or link table name) → SQL alias. */
  const aliasByEntityName = new Map<string, string>()

  const selectCols: string[] = []
  const groupBy: string[] = []
  const orderBy: string[] = []
  const joins: FetchJoin[] = []
  /** Aliases available for `<order alias>` / aggregate ordering. */
  const outputAliases = new Set<string>()

  const readAttributes = (owner: Element, q: string) => {
    for (const child of [...owner.children]) {
      if (child.tagName === 'all-attributes') {
        selectCols.push(`${q}*`)
        notes.push('<all-attributes/> became SELECT * — not supported by Dataverse SQL; list the columns.')
        continue
      }
      if (child.tagName !== 'attribute') continue
      const name = attrValue(child, 'name') ?? ''
      if (!name) continue
      const alias = attrValue(child, 'alias')
      const agg = (attrValue(child, 'aggregate') ?? '').toLowerCase()
      const isGroup = /^(true|1)$/i.test(attrValue(child, 'groupby') ?? '')
      const dategroup = attrValue(child, 'dategrouping')
      if (dategroup) notes.push(`Ignored dategrouping="${dategroup}" on “${name}” — SQL cannot group by date parts.`)
      const column = `${q}${name}`
      let expr: string
      if (agg === 'count') expr = 'COUNT(*)'
      else if (agg === 'countcolumn')
        expr = `COUNT(${/^(true|1)$/i.test(attrValue(child, 'distinct') ?? '') ? 'DISTINCT ' : ''}${column})`
      else if (agg === 'sum' || agg === 'avg' || agg === 'min' || agg === 'max')
        expr = `${agg.toUpperCase()}(${column})`
      else if (agg) {
        notes.push(`Ignored aggregate="${agg}" on “${name}” — not a SQL aggregate.`)
        expr = column
      } else expr = column
      if (alias) outputAliases.add(alias)
      selectCols.push(alias ? `${expr} AS ${alias}` : expr)
      if (isGroup) groupBy.push(column)
    }
  }

  const readOrders = (owner: Element, q: string) => {
    for (const child of [...owner.children]) {
      if (child.tagName !== 'order') continue
      const desc = /^(true|1)$/i.test(attrValue(child, 'descending') ?? '')
      const alias = attrValue(child, 'alias')
      const attribute = attrValue(child, 'attribute')
      const entityName = attrValue(child, 'entityname')
      let target: string | null = null
      if (alias) target = alias
      else if (attribute && entityName) {
        const resolved = aliasByEntityName.get(entityName)
        if (!resolved) {
          notes.push(`Dropped order on “${entityName}.${attribute}” — unknown link alias.`)
          continue
        }
        target = `${resolved}.${attribute}`
      } else if (attribute) target = `${q}${attribute}`
      if (target) orderBy.push(`${target}${desc ? ' DESC' : ''}`)
    }
  }

  const aliasOf = (entityName: string): string | null => aliasByEntityName.get(entityName) ?? null

  const readLinks = (owner: Element, parentQ: string) => {
    for (const child of [...owner.children]) {
      if (child.tagName !== 'link-entity') continue
      const linkTable = attrValue(child, 'name') ?? ''
      const from = attrValue(child, 'from') ?? ''
      const to = attrValue(child, 'to') ?? ''
      if (!linkTable || !from || !to) {
        notes.push(`Dropped a <link-entity> without name/from/to.`)
        continue
      }
      const written = attrValue(child, 'alias')
      let alias: string
      if (written && !taken.has(written)) {
        taken.add(written)
        alias = written
      } else alias = shortAlias(linkTable, taken)
      if (written) aliasByEntityName.set(written, alias)
      if (!aliasByEntityName.has(linkTable)) aliasByEntityName.set(linkTable, alias)
      const linkType = (attrValue(child, 'link-type') ?? 'inner').toLowerCase()
      if (linkType !== 'inner' && linkType !== 'outer')
        notes.push(`link-type="${linkType}" on “${linkTable}” became ${linkType === 'exists' || linkType === 'in' || linkType === 'any' || linkType === 'matchfirstrowusingcrossapply' ? 'INNER JOIN' : 'LEFT JOIN'} — SQL has no ${linkType} join.`)
      const type: FetchJoin['type'] =
        linkType === 'outer' || linkType === 'not any' || linkType === 'not exists' ? 'LEFT' : 'INNER'
      if (/^(true|1)$/i.test(attrValue(child, 'intersect') ?? ''))
        notes.push(`“${linkTable}” is an intersect link — SQL joins it as a plain table.`)
      const q = `${alias}.`
      const join: FetchJoin = { type, table: linkTable, alias, parentQ, from, to, extra: null }
      joins.push(join)
      readAttributes(child, q)
      const filters = [...child.children].filter((c) => c.tagName === 'filter')
      const extras = filters
        .map((f) => fetchFilterToSql(f, { q }, aliasOf, now, notes, true))
        .filter((f): f is string => f !== null)
      if (extras.length > 0) join.extra = extras.join(' AND ')
      readOrders(child, q)
      readLinks(child, q)
    }
  }

  readAttributes(entity, mainQ)
  readLinks(entity, mainQ)
  const filters = [...entity.children].filter((c) => c.tagName === 'filter')
  const whereParts = filters
    .map((f) => fetchFilterToSql(f, { q: mainQ }, aliasOf, now, notes, filters.length > 1))
    .filter((f): f is string => f !== null)
  readOrders(entity, mainQ)

  if (selectCols.length === 0) {
    selectCols.push(`${mainQ}${table}id`)
    notes.push(`No <attribute> — Dataverse returns only the primary key; SQL selects “${table}id” (by convention).`)
  }

  const lines: string[] = []
  const topClause = top && !count ? `TOP ${top} ` : ''
  lines.push(`SELECT ${distinct ? 'DISTINCT ' : ''}${topClause}${selectCols.join(', ')}`)
  lines.push(`FROM ${table}${mainAlias ? ` AS ${mainAlias}` : ''}`)
  for (const join of joins)
    lines.push(
      `${join.type} JOIN ${join.table} AS ${join.alias} ON ${join.parentQ}${join.to} = ${join.alias}.${join.from}${join.extra ? ` AND ${join.extra}` : ''}`,
    )
  if (whereParts.length > 0) lines.push(`WHERE ${whereParts.join(' AND ')}`)
  if (groupBy.length > 0) lines.push(`GROUP BY ${groupBy.join(', ')}`)
  else if (aggregate && !selectCols.some((c) => /^(COUNT|SUM|AVG|MIN|MAX)\(/.test(c)))
    notes.push('aggregate="true" without aggregates or groupby — translated as a plain SELECT.')
  if (orderBy.length > 0) lines.push(`ORDER BY ${orderBy.join(', ')}`)
  if (count) {
    const take = Math.max(1, Math.floor(Number(count)) || 1)
    const pageNo = Math.max(1, Math.floor(Number(page ?? '1')) || 1)
    if (orderBy.length === 0) {
      lines.push(`ORDER BY ${mainQ}${table}id`)
      notes.push('OFFSET … FETCH needs an ORDER BY — added the primary key (by convention).')
    }
    lines.push(`OFFSET ${(pageNo - 1) * take} ROWS FETCH NEXT ${take} ROWS ONLY`)
    notes.push('count/page became OFFSET … FETCH — the SQL tab maps it back to a FetchXML page; the native ?sql= endpoint rejects OFFSET.')
    if (top) notes.push('Ignored <fetch top> because count/page is set.')
  }

  return { ok: true, sql: lines.join('\n'), notes: [...new Set(notes)] }
}
