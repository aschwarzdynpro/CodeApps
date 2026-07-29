import type {
  ColumnKind,
  ColumnMeta,
  FilterCondition,
  FilterGroup,
  FilterNode,
  FilterOperator,
} from '../types/odataBrowser'

/**
 * OData Browser — the filter engine.
 *
 * Three pure transforms over the same structured tree:
 *  - `renderFilter`      tree → `$filter` expression
 *  - `parseFilter`       `$filter` expression → tree (or null → raw mode)
 *  - `filterToFetchXml`  tree → FetchXML `<filter>` (for the Count aggregate,
 *                        because the connector exposes no `$count`)
 *
 * The parser deliberately only understands **the grammar this renderer
 * produces**. Anything else — nested lambdas, hand-written functions, exotic
 * spacing — makes it return `null`, which puts the query into raw mode where
 * the text is passed through untouched. That is the whole point of the
 * coupling rule: the builder may never rewrite an expert query it did not
 * fully understand.
 */

export interface OperatorDef {
  id: FilterOperator
  label: string
  /** How many value inputs the operator needs. */
  arity: 0 | 1 | 2 | 'list'
  /** Column kinds it applies to; null = every kind. */
  kinds: ColumnKind[] | null
}

const TEXT: ColumnKind[] = ['string']
const ORDERED: ColumnKind[] = ['number', 'money', 'datetime', 'dateonly']
const DATE: ColumnKind[] = ['datetime', 'dateonly']
const REF: ColumnKind[] = ['lookup']

export const OPERATORS: OperatorDef[] = [
  { id: 'eq', label: 'equals', arity: 1, kinds: null },
  { id: 'ne', label: 'not equals', arity: 1, kinds: null },
  { id: 'contains', label: 'contains', arity: 1, kinds: TEXT },
  { id: 'notcontains', label: 'does not contain', arity: 1, kinds: TEXT },
  { id: 'startswith', label: 'starts with', arity: 1, kinds: TEXT },
  { id: 'endswith', label: 'ends with', arity: 1, kinds: TEXT },
  { id: 'gt', label: 'greater than', arity: 1, kinds: ORDERED },
  { id: 'ge', label: 'greater or equal', arity: 1, kinds: ORDERED },
  { id: 'lt', label: 'less than', arity: 1, kinds: ORDERED },
  { id: 'le', label: 'less or equal', arity: 1, kinds: ORDERED },
  { id: 'between', label: 'between', arity: 2, kinds: ORDERED },
  {
    id: 'in',
    label: 'is one of',
    arity: 'list',
    kinds: ['string', 'number', 'choice', 'guid', 'lookup'],
  },
  { id: 'null', label: 'is empty', arity: 0, kinds: null },
  { id: 'notnull', label: 'is not empty', arity: 0, kinds: null },
  { id: 'today', label: 'is today', arity: 0, kinds: DATE },
  { id: 'yesterday', label: 'is yesterday', arity: 0, kinds: DATE },
  { id: 'thismonth', label: 'is this month', arity: 0, kinds: DATE },
  { id: 'thisyear', label: 'is this year', arity: 0, kinds: DATE },
  { id: 'lastxdays', label: 'in the last X days', arity: 1, kinds: DATE },
  { id: 'nextxdays', label: 'in the next X days', arity: 1, kinds: DATE },
  { id: 'olderthanxdays', label: 'older than X days', arity: 1, kinds: DATE },
  { id: 'equaluserid', label: 'is the current user', arity: 0, kinds: REF },
  {
    id: 'equalbusinessid',
    label: "is the current user's BU",
    arity: 0,
    kinds: REF,
  },
  {
    id: 'containvalues',
    label: 'contains any of',
    arity: 'list',
    kinds: ['multichoice'],
  },
]

const BY_ID = new Map(OPERATORS.map((o) => [o.id, o]))

export function operatorDef(id: FilterOperator): OperatorDef | undefined {
  return BY_ID.get(id)
}

/** The operators offered for a column of this kind. */
export function operatorsFor(kind: ColumnKind): OperatorDef[] {
  return OPERATORS.filter((o) => o.kinds === null || o.kinds.includes(kind))
}

/** The default operator when a column (or its kind) changes. */
export function defaultOperatorFor(kind: ColumnKind): FilterOperator {
  return kind === 'string' ? 'contains' : 'eq'
}

// --- ids --------------------------------------------------------------------

let idSeq = 0
function nextId(prefix: string): string {
  idSeq += 1
  return `${prefix}${idSeq}`
}

export function newCondition(column = '', operator: FilterOperator = 'eq'): FilterCondition {
  return { kind: 'cond', id: nextId('c'), column, operator, values: [] }
}

export function newGroup(op: 'and' | 'or' = 'and', children: FilterNode[] = []): FilterGroup {
  return { kind: 'group', id: nextId('g'), op, children }
}

// --- literals ---------------------------------------------------------------

/** Single quotes are escaped by doubling them — the only OData string escape. */
export function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMBER_RE = /^-?\d+(\.\d+)?$/
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Normalize a user-typed date into an OData literal. */
export function odataDate(value: string, withTime: boolean): string {
  const raw = value.trim()
  if (!withTime) return DATE_ONLY_RE.test(raw) ? raw : raw
  if (DATE_ONLY_RE.test(raw)) return `${raw}T00:00:00Z`
  if (/T/.test(raw) && !/[Zz]|[+-]\d{2}:\d{2}$/.test(raw)) return `${raw}Z`
  return raw
}

/** Render one value as a literal appropriate for the column's kind. */
export function literalFor(kind: ColumnKind, raw: string): string {
  const value = raw.trim()
  switch (kind) {
    case 'number':
    case 'money':
    case 'choice':
    case 'multichoice':
      return NUMBER_RE.test(value) ? value : odataString(value)
    case 'boolean':
      return /^(true|1|yes)$/i.test(value) ? 'true' : 'false'
    case 'guid':
    case 'lookup':
      return GUID_RE.test(value) ? value : odataString(value)
    case 'datetime':
      return odataDate(value, true)
    case 'dateonly':
      return odataDate(value, false)
    default:
      return odataString(value)
  }
}

/** `_primarycontactid_value` → `primarycontactid` (CRM functions want that). */
export function logicalNameOf(selectName: string): string {
  const match = selectName.match(/^_(.+)_value$/)
  return match ? match[1] : selectName
}

// --- rendering --------------------------------------------------------------

type Columns = Map<string, ColumnMeta>

function kindOfColumn(columns: Columns, name: string): ColumnKind {
  return columns.get(name)?.kind ?? 'string'
}

function crmFunction(name: string, property: string, extra = ''): string {
  return `Microsoft.Dynamics.CRM.${name}(PropertyName='${property}'${extra})`
}

/**
 * Render one condition, or null when it is not complete enough to be sent.
 * A half-typed row must never leak into the query — it would either error or,
 * worse, silently widen the result.
 */
export function renderCondition(
  cond: FilterCondition,
  columns: Columns,
): string | null {
  const def = operatorDef(cond.operator)
  if (!def || !cond.column) return null
  const kind = kindOfColumn(columns, cond.column)
  const target = cond.column
  const logical = logicalNameOf(cond.column)
  const values = cond.values.map((v) => v.trim())

  if (def.arity === 'list') {
    const list = values.filter((v) => v !== '')
    if (list.length === 0) return null
    if (cond.operator === 'containvalues') {
      const encoded = list.map((v) => odataString(v)).join(',')
      return crmFunction('ContainValues', logical, `,PropertyValues=[${encoded}]`)
    }
    // `in` is rendered as an OR chain rather than the OData `in` operator:
    // it is guaranteed to work on every Dataverse version, and it parses back
    // into the builder as a plain group.
    const parts = list.map((v) => `${target} eq ${literalFor(kind, v)}`)
    return parts.length === 1 ? parts[0] : `(${parts.join(' or ')})`
  }

  if (def.arity === 0) {
    switch (cond.operator) {
      case 'null':
        return `${target} eq null`
      case 'notnull':
        return `${target} ne null`
      case 'today':
        return crmFunction('Today', logical)
      case 'yesterday':
        return crmFunction('Yesterday', logical)
      case 'thismonth':
        return crmFunction('ThisMonth', logical)
      case 'thisyear':
        return crmFunction('ThisYear', logical)
      case 'equaluserid':
        return crmFunction('EqualUserId', logical)
      case 'equalbusinessid':
        return crmFunction('EqualBusinessId', logical)
      default:
        return null
    }
  }

  if (def.arity === 2) {
    const [from, to] = values
    if (!from || !to) return null
    // Rendered as a group so it round-trips through the parser as two plain
    // conditions — the query text stays identical, the builder just shows two
    // rows instead of one "between".
    return `(${target} ge ${literalFor(kind, from)} and ${target} le ${literalFor(kind, to)})`
  }

  const value = values[0]
  if (value === undefined || value === '') return null
  switch (cond.operator) {
    case 'contains':
      return `contains(${target},${odataString(value)})`
    case 'notcontains':
      return `not contains(${target},${odataString(value)})`
    case 'startswith':
      return `startswith(${target},${odataString(value)})`
    case 'endswith':
      return `endswith(${target},${odataString(value)})`
    case 'lastxdays':
      return crmFunction('LastXDays', logical, `,PropertyValue=${numberOr(value, 7)}`)
    case 'nextxdays':
      return crmFunction('NextXDays', logical, `,PropertyValue=${numberOr(value, 7)}`)
    case 'olderthanxdays':
      return crmFunction(
        'OlderThanXDays',
        logical,
        `,PropertyValue=${numberOr(value, 30)}`,
      )
    default:
      return `${target} ${cond.operator} ${literalFor(kind, value)}`
  }
}

function numberOr(value: string, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/**
 * Render a filter tree; null when nothing complete is in it.
 *
 * A nested group with more than one part is parenthesised — without that,
 * `(a or b) and c` would flatten to `a or b and c`, which OData reads as
 * `a or (b and c)`. Silently changing the meaning of a filter is the worst
 * thing this module could do.
 */
function renderNode(
  node: FilterNode,
  columns: Columns,
  nested: boolean,
): string | null {
  if (node.kind === 'cond') return renderCondition(node, columns)
  const parts = node.children
    .map((child) => renderNode(child, columns, true))
    .filter((part): part is string => part !== null && part !== '')
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  const joined = parts.join(` ${node.op} `)
  return nested ? `(${joined})` : joined
}

export function renderFilter(node: FilterNode, columns: Columns): string | null {
  return renderNode(node, columns, false)
}

/** Top-level render — the root group needs no parentheses of its own. */
export function renderRootFilter(
  group: FilterGroup | null,
  columns: Columns,
): string | null {
  if (!group) return null
  return renderNode(group, columns, false)
}

// --- parsing ----------------------------------------------------------------

interface Token {
  t: 'lparen' | 'rparen' | 'comma' | 'lbracket' | 'rbracket' | 'eq' | 'word' | 'string'
  v: string
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '(') {
      tokens.push({ t: 'lparen', v: ch })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ t: 'rparen', v: ch })
      i++
      continue
    }
    if (ch === ',') {
      tokens.push({ t: 'comma', v: ch })
      i++
      continue
    }
    if (ch === '[') {
      tokens.push({ t: 'lbracket', v: ch })
      i++
      continue
    }
    if (ch === ']') {
      tokens.push({ t: 'rbracket', v: ch })
      i++
      continue
    }
    if (ch === '=') {
      tokens.push({ t: 'eq', v: ch })
      i++
      continue
    }
    if (ch === "'") {
      let out = ''
      i++
      for (;;) {
        if (i >= input.length) return null // unterminated string
        if (input[i] === "'") {
          if (input[i + 1] === "'") {
            out += "'"
            i += 2
            continue
          }
          i++
          break
        }
        out += input[i]
        i++
      }
      tokens.push({ t: 'string', v: out })
      continue
    }
    const start = i
    while (i < input.length && !/[\s(),[\]=']/.test(input[i])) i++
    if (i === start) return null
    tokens.push({ t: 'word', v: input.slice(start, i) })
  }
  return tokens
}

const COMPARISONS = new Set(['eq', 'ne', 'gt', 'ge', 'lt', 'le'])

const CRM_ZERO_ARG: Record<string, FilterOperator> = {
  today: 'today',
  yesterday: 'yesterday',
  thismonth: 'thismonth',
  thisyear: 'thisyear',
  equaluserid: 'equaluserid',
  equalbusinessid: 'equalbusinessid',
}

const CRM_ONE_ARG: Record<string, FilterOperator> = {
  lastxdays: 'lastxdays',
  nextxdays: 'nextxdays',
  olderthanxdays: 'olderthanxdays',
}

class Parser {
  private pos = 0
  /** Every column name seen — the caller rejects the parse if one is unknown. */
  readonly seen: string[] = []
  // Written out rather than a parameter property: `erasableSyntaxOnly` is on.
  private readonly tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++]
  }

  private expect(t: Token['t']): boolean {
    const token = this.tokens[this.pos]
    if (!token || token.t !== t) return false
    this.pos++
    return true
  }

  atEnd(): boolean {
    return this.pos >= this.tokens.length
  }

  /** or-level (lowest precedence). */
  parseExpression(): FilterNode | null {
    let left = this.parseAnd()
    if (!left) return null
    const children: FilterNode[] = [left]
    while (this.peek()?.t === 'word' && this.peek()?.v.toLowerCase() === 'or') {
      this.next()
      const right = this.parseAnd()
      if (!right) return null
      children.push(right)
    }
    if (children.length === 1) return left
    left = newGroup('or', children)
    return left
  }

  private parseAnd(): FilterNode | null {
    const first = this.parsePrimary()
    if (!first) return null
    const children: FilterNode[] = [first]
    while (this.peek()?.t === 'word' && this.peek()?.v.toLowerCase() === 'and') {
      this.next()
      const right = this.parsePrimary()
      if (!right) return null
      children.push(right)
    }
    if (children.length === 1) return first
    return newGroup('and', children)
  }

  private parsePrimary(): FilterNode | null {
    const token = this.peek()
    if (!token) return null
    if (token.t === 'lparen') {
      this.next()
      const inner = this.parseExpression()
      if (!inner) return null
      if (!this.expect('rparen')) return null
      return inner
    }
    return this.parseCondition()
  }

  private parseCondition(): FilterCondition | null {
    const token = this.next()
    if (!token || token.t !== 'word') return null
    const word = token.v

    if (word.toLowerCase() === 'not') {
      const fn = this.parseFunctionCall()
      if (!fn || fn.name !== 'contains') return null
      this.seen.push(fn.column)
      return {
        ...newCondition(fn.column, 'notcontains'),
        values: [fn.value ?? ''],
      }
    }

    const lower = word.toLowerCase()
    if (lower === 'contains' || lower === 'startswith' || lower === 'endswith') {
      this.pos-- // let the helper consume the name again
      const fn = this.parseFunctionCall()
      if (!fn) return null
      this.seen.push(fn.column)
      return {
        ...newCondition(fn.column, lower as FilterOperator),
        values: [fn.value ?? ''],
      }
    }

    if (word.startsWith('Microsoft.Dynamics.CRM.')) {
      this.pos--
      return this.parseCrmFunction()
    }

    // Plain comparison: <column> <op> <literal>
    const op = this.next()
    if (!op || op.t !== 'word' || !COMPARISONS.has(op.v.toLowerCase())) return null
    const value = this.next()
    if (!value) return null
    this.seen.push(word)
    if (value.t === 'word' && value.v.toLowerCase() === 'null') {
      const operator: FilterOperator = op.v.toLowerCase() === 'ne' ? 'notnull' : 'null'
      return newCondition(word, operator)
    }
    return {
      ...newCondition(word, op.v.toLowerCase() as FilterOperator),
      values: [value.v],
    }
  }

  /** `name(column,'value')` — used for contains/startswith/endswith. */
  private parseFunctionCall(): { name: string; column: string; value?: string } | null {
    const name = this.next()
    if (!name || name.t !== 'word') return null
    if (!this.expect('lparen')) return null
    const column = this.next()
    if (!column || column.t !== 'word') return null
    if (!this.expect('comma')) return null
    const value = this.next()
    if (!value) return null
    if (!this.expect('rparen')) return null
    return { name: name.v.toLowerCase(), column: column.v, value: value.v }
  }

  /** `Microsoft.Dynamics.CRM.X(PropertyName='c'[,PropertyValue=n])`. */
  private parseCrmFunction(): FilterCondition | null {
    const name = this.next()
    if (!name || name.t !== 'word') return null
    const fn = name.v.slice('Microsoft.Dynamics.CRM.'.length).toLowerCase()
    if (!this.expect('lparen')) return null
    const key = this.next()
    if (!key || key.t !== 'word' || key.v !== 'PropertyName') return null
    if (!this.expect('eq')) return null
    const column = this.next()
    if (!column || column.t !== 'string') return null

    // Zero-argument date / user-context functions.
    if (this.peek()?.t === 'rparen') {
      this.next()
      const operator = CRM_ZERO_ARG[fn]
      if (!operator) return null
      const selectName = this.selectNameFor(column.v, operator)
      this.seen.push(selectName)
      return newCondition(selectName, operator)
    }

    if (!this.expect('comma')) return null
    const key2 = this.next()
    if (!key2 || key2.t !== 'word') return null
    if (!this.expect('eq')) return null

    if (key2.v === 'PropertyValue') {
      const value = this.next()
      if (!value) return null
      if (!this.expect('rparen')) return null
      const operator = CRM_ONE_ARG[fn]
      if (!operator) return null
      this.seen.push(column.v)
      return { ...newCondition(column.v, operator), values: [value.v] }
    }

    if (key2.v === 'PropertyValues' && fn === 'containvalues') {
      if (!this.expect('lbracket')) return null
      const values: string[] = []
      for (;;) {
        const item = this.next()
        if (!item) return null
        values.push(item.v)
        const sep = this.next()
        if (!sep) return null
        if (sep.t === 'rbracket') break
        if (sep.t !== 'comma') return null
      }
      if (!this.expect('rparen')) return null
      this.seen.push(column.v)
      return { ...newCondition(column.v, 'containvalues'), values }
    }
    return null
  }

  /**
   * CRM functions carry the logical name; the builder keys conditions by the
   * `$select` name. For lookup-only operators that means restoring `_x_value`.
   */
  private selectNameFor(logical: string, operator: FilterOperator): string {
    return operator === 'equaluserid' || operator === 'equalbusinessid'
      ? `_${logical}_value`
      : logical
  }
}

/**
 * Parse a `$filter` expression into a tree, or return null to signal
 * "keep this as raw text".
 *
 * Returns null when a column is not in `columns` as well: without knowing the
 * column's kind the renderer could quote a literal differently than it was
 * written, which would silently change the query on the next render. Raw mode
 * is the honest answer there.
 */
export function parseFilter(
  text: string,
  columns: Columns,
): FilterGroup | null {
  const trimmed = text.trim()
  if (trimmed === '') return newGroup('and')
  const tokens = tokenize(trimmed)
  if (!tokens || tokens.length === 0) return null
  const parser = new Parser(tokens)
  const node = parser.parseExpression()
  if (!node || !parser.atEnd()) return null
  for (const name of parser.seen) if (!columns.has(name)) return null
  return node.kind === 'group' ? node : newGroup('and', [node])
}

// --- FetchXML (Count) -------------------------------------------------------

const FETCH_OPS: Partial<Record<FilterOperator, string>> = {
  eq: 'eq',
  ne: 'ne',
  gt: 'gt',
  ge: 'ge',
  lt: 'lt',
  le: 'le',
  null: 'null',
  notnull: 'not-null',
  today: 'today',
  yesterday: 'yesterday',
  thismonth: 'this-month',
  thisyear: 'this-year',
  lastxdays: 'last-x-days',
  nextxdays: 'next-x-days',
  olderthanxdays: 'olderthan-x-days',
  equaluserid: 'eq-userid',
  equalbusinessid: 'eq-businessid',
  containvalues: 'contain-values',
  in: 'in',
  between: 'between',
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function conditionToFetchXml(cond: FilterCondition): string | null {
  const def = operatorDef(cond.operator)
  if (!def || !cond.column) return null
  // FetchXML addresses lookups by their logical name, never as `_x_value`.
  const attribute = xmlEscape(logicalNameOf(cond.column))
  const values = cond.values.map((v) => v.trim())
  const like = (pattern: string, negate: boolean): string =>
    `<condition attribute="${attribute}" operator="${negate ? 'not-like' : 'like'}" value="${xmlEscape(pattern)}" />`

  switch (cond.operator) {
    case 'contains':
      return values[0] ? like(`%${values[0]}%`, false) : null
    case 'notcontains':
      return values[0] ? like(`%${values[0]}%`, true) : null
    case 'startswith':
      return values[0] ? like(`${values[0]}%`, false) : null
    case 'endswith':
      return values[0] ? like(`%${values[0]}`, false) : null
    default:
      break
  }

  const op = FETCH_OPS[cond.operator]
  if (!op) return null

  if (def.arity === 0)
    return `<condition attribute="${attribute}" operator="${op}" />`

  if (def.arity === 2 || def.arity === 'list') {
    const list = values.filter((v) => v !== '')
    if (list.length === 0) return null
    if (def.arity === 2 && list.length < 2) return null
    const items = list.map((v) => `<value>${xmlEscape(v)}</value>`).join('')
    return `<condition attribute="${attribute}" operator="${op}">${items}</condition>`
  }

  if (!values[0]) return null
  return `<condition attribute="${attribute}" operator="${op}" value="${xmlEscape(values[0])}" />`
}

/**
 * Translate the tree into a FetchXML `<filter>`. Returns null when any part
 * cannot be expressed — the caller then disables Count rather than counting
 * something other than what the grid shows.
 */
export function filterToFetchXml(
  node: FilterNode,
  columns: Columns,
): string | null {
  if (node.kind === 'cond') return conditionToFetchXml(node)
  const parts: string[] = []
  for (const child of node.children) {
    const rendered = filterToFetchXml(child, columns)
    // An incomplete child is skipped (it is skipped when rendering $filter
    // too); a child that cannot be translated at all aborts the whole thing.
    if (rendered === null) {
      if (isRenderable(child, columns)) return null
      continue
    }
    parts.push(rendered)
  }
  if (parts.length === 0) return ''
  if (parts.length === 1 && node.children.length === 1) return parts[0]
  return `<filter type="${node.op}">${parts.join('')}</filter>`
}

/** Would this node contribute to `$filter`? Used to tell "incomplete" from
 *  "untranslatable" when building the FetchXML count. */
function isRenderable(node: FilterNode, columns: Columns): boolean {
  return renderFilter(node, columns) !== null
}

/** The aggregate query behind the Count button. */
export function buildCountFetchXml(
  entityLogicalName: string,
  primaryIdAttribute: string,
  filterXml: string | null,
): string {
  const inner = filterXml && filterXml !== '' ? wrapFilter(filterXml) : ''
  return (
    `<fetch aggregate="true"><entity name="${xmlEscape(entityLogicalName)}">` +
    `<attribute name="${xmlEscape(primaryIdAttribute)}" alias="cnt" aggregate="countcolumn" distinct="true" />` +
    `${inner}</entity></fetch>`
  )
}

/** A bare `<condition>` needs a `<filter>` around it to be valid FetchXML. */
function wrapFilter(xml: string): string {
  return xml.startsWith('<filter') ? xml : `<filter type="and">${xml}</filter>`
}

/** Does the tree hold at least one complete condition? */
export function hasConditions(group: FilterGroup | null): boolean {
  if (!group) return false
  return group.children.length > 0
}

// --- tree edits (pure, used by the builder UI) ------------------------------

/** Replace a node by id, returning a new tree. */
export function updateNode(
  root: FilterGroup,
  id: string,
  update: (node: FilterNode) => FilterNode,
): FilterGroup {
  const walk = (node: FilterNode): FilterNode => {
    if (node.id === id) return update(node)
    if (node.kind === 'group')
      return { ...node, children: node.children.map(walk) }
    return node
  }
  return walk(root) as FilterGroup
}

/** Remove a node by id (the root is never removed). */
export function removeNode(root: FilterGroup, id: string): FilterGroup {
  const walk = (group: FilterGroup): FilterGroup => ({
    ...group,
    children: group.children
      .filter((child) => child.id !== id)
      .map((child) => (child.kind === 'group' ? walk(child) : child)),
  })
  return walk(root)
}

/** Append a child to the group with this id. */
export function addToGroup(
  root: FilterGroup,
  groupId: string,
  child: FilterNode,
): FilterGroup {
  return updateNode(root, groupId, (node) =>
    node.kind === 'group' ? { ...node, children: [...node.children, child] } : node,
  ) as FilterGroup
}
