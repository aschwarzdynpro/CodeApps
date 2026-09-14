/**
 * Data Browser — SQL parsing, linting and the SQL → FetchXML translation.
 *
 * Dataverse accepts a read-only T-SQL subset on the Web API
 * (`GET /<entityset>?sql=SELECT …`, see
 * https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/sql).
 * The SQL tab **runs statements natively** on that endpoint through the code
 * app's own Dataverse data source (`services/executeSqlService.ts`); this
 * module is the client side of it: it reads the FROM table (`sqlFromTable`,
 * needed for the entity-set URL), lints the statement against the documented
 * subset before it is sent (non-blocking — Dataverse decides), and translates
 * a statement to FetchXML for the "→ FetchXML" button.
 *
 * The parser understands exactly the documented subset, and the renderer
 * maps it 1:1 onto FetchXML —
 * `SELECT`/`DISTINCT`/`TOP`, `INNER`/`LEFT JOIN` (→ `<link-entity>`), the
 * `WHERE` operators (→ `<condition>`, joined-table columns via `entityname`),
 * `GROUP BY` + aggregates (→ `aggregate="true"`), `ORDER BY`. Two things are
 * deliberately *more* than the native endpoint: `OFFSET … FETCH` becomes
 * FetchXML `page`/`count` (the native endpoint rejects it), and an OData-style
 * `_x_value` column is accepted and mapped to its logical name.
 *
 * Every construct the renderer emits was verified live (INT-11, 2026-09-14):
 * `entityname` on a top-level condition, `<order entityname=…>` at entity
 * level, nested link-entities, outer joins with their own `<filter>`,
 * aggregates over a join, `page`/`count`.
 *
 * Pure and Vitest-covered — no DOM, no connector.
 */

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface SqlColumnRef {
  /** Table alias (or table name) the column was qualified with; null = unqualified. */
  table: string | null
  column: string
}

export type SqlAggregate = 'count' | 'countcolumn' | 'sum' | 'avg' | 'min' | 'max'

export interface SqlSelectItem {
  /** null only for `COUNT(*)`. */
  ref: SqlColumnRef | null
  alias: string | null
  aggregate: SqlAggregate | null
  /** `COUNT(DISTINCT col)`. */
  distinct: boolean
}

export interface SqlLiteral {
  kind: 'string' | 'number' | 'date' | 'boolean' | 'null'
  /** Rendered text — ISO for dates, digits for numbers, raw for strings. */
  text: string
}

export type SqlConditionOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'lt'
  | 'ge'
  | 'le'
  | 'like'
  | 'not-like'
  | 'in'
  | 'not-in'
  | 'between'
  | 'not-between'
  | 'null'
  | 'not-null'

export type SqlWhere =
  | { kind: 'group'; op: 'and' | 'or'; children: SqlWhere[] }
  | {
      kind: 'cond'
      ref: SqlColumnRef
      operator: SqlConditionOperator
      values: SqlLiteral[]
    }
  /** `a.col = b.col` — only legal inside `ON`. */
  | { kind: 'join'; left: SqlColumnRef; right: SqlColumnRef }

export interface SqlJoin {
  type: 'inner' | 'outer'
  table: string
  alias: string
  /** The column-to-column equality of the `ON` clause. */
  left: SqlColumnRef
  right: SqlColumnRef
  /** Additional `ON` filters (must address the joined table). */
  extra: SqlWhere | null
}

export interface SqlOrder {
  ref: SqlColumnRef
  desc: boolean
}

export interface SqlStatement {
  distinct: boolean
  top: number | null
  columns: SqlSelectItem[]
  from: { table: string; alias: string | null }
  joins: SqlJoin[]
  where: SqlWhere | null
  groupBy: SqlColumnRef[]
  orderBy: SqlOrder[]
  /** `OFFSET s ROWS FETCH NEXT n ROWS ONLY`. */
  offset: { skip: number; take: number } | null
}

export interface SqlParseOk {
  ok: true
  statement: SqlStatement
}

export interface SqlParseError {
  ok: false
  error: string
  /** Character offset the error was detected at (for the caret hint). */
  position: number
}

export type SqlParseResult = SqlParseOk | SqlParseError

export class SqlSyntaxError extends Error {
  readonly position: number
  constructor(message: string, position: number) {
    super(message)
    this.position = position
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType =
  | 'word' // identifier or keyword (case preserved)
  | 'string'
  | 'number'
  | 'op' // = <> != > < >= <=
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'dot'
  | 'star'
  | 'semicolon'

interface Token {
  t: TokenType
  v: string
  pos: number
}

const isIdentStart = (ch: string) => /[A-Za-z_]/.test(ch)
const isIdentChar = (ch: string) => /[A-Za-z0-9_]/.test(ch)

/**
 * Tokenize a statement. Handles `--` and `/* *\/` comments, `'…'` strings
 * with `''` escapes, `[bracketed]` and `"quoted"` identifiers, numbers and
 * the comparison operators. Throws {@link SqlSyntaxError} on an unterminated
 * string/comment or an unexpected character.
 */
export function tokenizeSql(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = input.length
  while (i < n) {
    const ch = input[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '-' && input[i + 1] === '-') {
      while (i < n && input[i] !== '\n') i++
      continue
    }
    if (ch === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2)
      if (end === -1) throw new SqlSyntaxError('Unterminated comment.', i)
      i = end + 2
      continue
    }
    if (ch === "'") {
      const start = i
      let out = ''
      i++
      for (;;) {
        if (i >= n) throw new SqlSyntaxError('Unterminated string literal.', start)
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
      tokens.push({ t: 'string', v: out, pos: start })
      continue
    }
    if (ch === '[' || ch === '"') {
      const close = ch === '[' ? ']' : '"'
      const start = i
      const end = input.indexOf(close, i + 1)
      if (end === -1)
        throw new SqlSyntaxError('Unterminated quoted identifier.', start)
      tokens.push({ t: 'word', v: input.slice(i + 1, end), pos: start })
      i = end + 1
      continue
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      const start = i
      while (i < n && /[0-9.]/.test(input[i])) i++
      tokens.push({ t: 'number', v: input.slice(start, i), pos: start })
      continue
    }
    if (isIdentStart(ch)) {
      const start = i
      while (i < n && isIdentChar(input[i])) i++
      tokens.push({ t: 'word', v: input.slice(start, i), pos: start })
      continue
    }
    const two = input.slice(i, i + 2)
    if (two === '<>' || two === '!=' || two === '>=' || two === '<=') {
      tokens.push({ t: 'op', v: two === '!=' ? '<>' : two, pos: i })
      i += 2
      continue
    }
    if (ch === '=' || ch === '<' || ch === '>') {
      tokens.push({ t: 'op', v: ch, pos: i })
      i++
      continue
    }
    const single: Partial<Record<string, TokenType>> = {
      '(': 'lparen',
      ')': 'rparen',
      ',': 'comma',
      '.': 'dot',
      '*': 'star',
      ';': 'semicolon',
    }
    const t = single[ch]
    if (t) {
      tokens.push({ t, v: ch, pos: i })
      i++
      continue
    }
    // A unary minus in front of a number is folded into the literal.
    if (ch === '-' && /[0-9.]/.test(input[i + 1] ?? '')) {
      const start = i
      i++
      while (i < n && /[0-9.]/.test(input[i])) i++
      tokens.push({ t: 'number', v: input.slice(start, i), pos: start })
      continue
    }
    throw new SqlSyntaxError(`Unexpected character “${ch}”.`, i)
  }
  return tokens
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const AGGREGATES: Record<string, SqlAggregate> = {
  count: 'countcolumn',
  sum: 'sum',
  avg: 'avg',
  min: 'min',
  max: 'max',
}

/** Words that can never be an alias — so `FROM account WHERE` does not read WHERE as one. */
const RESERVED = new Set([
  'select',
  'from',
  'where',
  'inner',
  'left',
  'right',
  'full',
  'cross',
  'outer',
  'join',
  'on',
  'group',
  'order',
  'by',
  'and',
  'or',
  'not',
  'in',
  'like',
  'between',
  'is',
  'null',
  'as',
  'top',
  'distinct',
  'offset',
  'fetch',
  'asc',
  'desc',
  'having',
  'union',
])

/** `DATEADD` date parts, normalised to what the evaluator understands. */
const DATE_PARTS: Record<string, 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second'> = {
  year: 'year',
  yy: 'year',
  yyyy: 'year',
  quarter: 'quarter',
  qq: 'quarter',
  q: 'quarter',
  month: 'month',
  mm: 'month',
  m: 'month',
  week: 'week',
  wk: 'week',
  ww: 'week',
  day: 'day',
  dd: 'day',
  d: 'day',
  hour: 'hour',
  hh: 'hour',
  minute: 'minute',
  mi: 'minute',
  n: 'minute',
  second: 'second',
  ss: 'second',
  s: 'second',
}

function addToDate(date: Date, part: keyof typeof DATE_PARTS, amount: number): Date {
  const d = new Date(date.getTime())
  switch (DATE_PARTS[part]) {
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + amount)
      break
    case 'quarter':
      d.setUTCMonth(d.getUTCMonth() + amount * 3)
      break
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + amount)
      break
    case 'week':
      d.setUTCDate(d.getUTCDate() + amount * 7)
      break
    case 'day':
      d.setUTCDate(d.getUTCDate() + amount)
      break
    case 'hour':
      d.setUTCHours(d.getUTCHours() + amount)
      break
    case 'minute':
      d.setUTCMinutes(d.getUTCMinutes() + amount)
      break
    case 'second':
      d.setUTCSeconds(d.getUTCSeconds() + amount)
      break
  }
  return d
}

/** ISO without milliseconds — what FetchXML and the Web API both accept. */
export function isoDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

class Parser {
  private pos = 0
  private readonly tokens: Token[]
  private readonly now: Date
  private readonly text: string

  constructor(tokens: Token[], now: Date, text: string) {
    this.tokens = tokens
    this.now = now
    this.text = text
  }

  // --- token helpers -----------------------------------------------------

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset]
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++]
  }

  private at(): number {
    return this.peek()?.pos ?? this.text.length
  }

  fail(message: string, position = this.at()): never {
    throw new SqlSyntaxError(message, position)
  }

  private isWord(word: string, offset = 0): boolean {
    const token = this.peek(offset)
    return token?.t === 'word' && token.v.toLowerCase() === word
  }

  private acceptWord(word: string): boolean {
    if (!this.isWord(word)) return false
    this.pos++
    return true
  }

  private expectWord(word: string): void {
    if (!this.acceptWord(word)) {
      const found = this.peek()
      this.fail(
        found
          ? `Expected ${word.toUpperCase()} but found “${found.v}”.`
          : `Expected ${word.toUpperCase()} but the statement ended.`,
      )
    }
  }

  private expectType(t: TokenType, what: string): Token {
    const token = this.peek()
    if (!token || token.t !== t)
      this.fail(
        token
          ? `Expected ${what} but found “${token.v}”.`
          : `Expected ${what} but the statement ended.`,
      )
    this.pos++
    return token
  }

  private identifier(what: string): Token {
    const token = this.peek()
    if (!token || token.t !== 'word' || RESERVED.has(token.v.toLowerCase()))
      this.fail(
        token
          ? `Expected ${what} but found “${token.v}”.`
          : `Expected ${what} but the statement ended.`,
      )
    this.pos++
    return token
  }

  // --- grammar -------------------------------------------------------------

  parseStatement(): SqlStatement {
    const first = this.peek()
    if (!first) this.fail('Empty statement — start with SELECT.', 0)
    if (!this.isWord('select'))
      this.fail(
        `Only SELECT statements are supported (found “${first.v}”).`,
        first.pos,
      )
    this.next()

    const distinct = this.acceptWord('distinct')
    let top: number | null = null
    if (this.acceptWord('top')) {
      const parenthesised = this.peek()?.t === 'lparen'
      if (parenthesised) this.next()
      const value = this.expectType('number', 'an integer after TOP')
      if (!/^\d+$/.test(value.v))
        this.fail('TOP only allows an integer literal.', value.pos)
      top = Number(value.v)
      if (parenthesised) this.expectType('rparen', '“)”')
    }

    const columns = this.parseSelectList()
    this.expectWord('from')
    const from = this.parseTableRef()
    const joins: SqlJoin[] = []
    for (;;) {
      const join = this.parseJoin()
      if (!join) break
      joins.push(join)
    }

    let where: SqlWhere | null = null
    if (this.acceptWord('where')) {
      where = this.parseExpression()
      assertNoJoinConditions(where, this)
    }

    const groupBy: SqlColumnRef[] = []
    if (this.acceptWord('group')) {
      this.expectWord('by')
      groupBy.push(this.parseColumnRef())
      while (this.peek()?.t === 'comma') {
        this.next()
        groupBy.push(this.parseColumnRef())
      }
    }

    if (this.isWord('having'))
      this.fail('HAVING is not supported — filter with WHERE before aggregating.')

    const orderBy: SqlOrder[] = []
    if (this.acceptWord('order')) {
      this.expectWord('by')
      orderBy.push(this.parseOrderItem())
      while (this.peek()?.t === 'comma') {
        this.next()
        orderBy.push(this.parseOrderItem())
      }
    }

    let offset: SqlStatement['offset'] = null
    if (this.acceptWord('offset')) {
      const skip = this.expectType('number', 'an integer after OFFSET')
      if (!this.acceptWord('rows')) this.acceptWord('row')
      this.expectWord('fetch')
      if (!this.acceptWord('next')) this.expectWord('first')
      const take = this.expectType('number', 'an integer after FETCH NEXT')
      if (!this.acceptWord('rows')) this.acceptWord('row')
      this.expectWord('only')
      offset = { skip: Number(skip.v), take: Number(take.v) }
      if (!Number.isInteger(offset.skip) || !Number.isInteger(offset.take) || offset.take < 1)
        this.fail('OFFSET/FETCH need non-negative integers (FETCH at least 1).', skip.pos)
    }

    if (this.peek()?.t === 'semicolon') this.next()
    const rest = this.peek()
    if (rest) {
      if (rest.t === 'word' && ['union', 'select', 'insert', 'update', 'delete'].includes(rest.v.toLowerCase()))
        this.fail('Each command must contain a single SELECT statement.', rest.pos)
      this.fail(`Unexpected “${rest.v}” after the end of the statement.`, rest.pos)
    }

    return { distinct, top, columns, from, joins, where, groupBy, orderBy, offset }
  }

  private parseSelectList(): SqlSelectItem[] {
    const items: SqlSelectItem[] = [this.parseSelectItem()]
    while (this.peek()?.t === 'comma') {
      this.next()
      items.push(this.parseSelectItem())
    }
    return items
  }

  private parseSelectItem(): SqlSelectItem {
    const token = this.peek()
    if (!token) this.fail('Expected a column after SELECT.')
    if (token.t === 'star')
      this.fail('SELECT * is not supported by Dataverse SQL — name each column.', token.pos)
    if (token.t === 'string' || token.t === 'number')
      this.fail('Selecting literal values is not supported — only columns and aggregates.', token.pos)

    // Aggregate function?
    const lower = token.v.toLowerCase()
    if (token.t === 'word' && AGGREGATES[lower] && this.peek(1)?.t === 'lparen') {
      this.next()
      this.next()
      let distinct = false
      let ref: SqlColumnRef | null = null
      let aggregate: SqlAggregate = AGGREGATES[lower]
      if (this.peek()?.t === 'star') {
        if (lower !== 'count')
          this.fail(`${token.v.toUpperCase()}(*) is not valid — name a column.`, token.pos)
        this.next()
        aggregate = 'count'
      } else {
        distinct = this.acceptWord('distinct')
        ref = this.parseColumnRef()
      }
      this.expectType('rparen', '“)” after the aggregate argument')
      return { ref, alias: this.parseAlias(), aggregate, distinct }
    }

    if (token.t === 'word' && this.peek(1)?.t === 'lparen')
      this.fail(
        `Function “${token.v}” is not supported in SELECT — only COUNT, SUM, AVG, MIN and MAX.`,
        token.pos,
      )

    const ref = this.parseColumnRef()
    return { ref, alias: this.parseAlias(), aggregate: null, distinct: false }
  }

  /** `[AS] alias` — optional, never a reserved word. */
  private parseAlias(): string | null {
    if (this.acceptWord('as')) return this.identifier('an alias after AS').v
    const token = this.peek()
    if (token?.t === 'word' && !RESERVED.has(token.v.toLowerCase())) {
      this.next()
      return token.v
    }
    return null
  }

  /** `[alias.]column` — a bare word or a dotted pair. */
  private parseColumnRef(): SqlColumnRef {
    const first = this.identifier('a column name')
    if (this.peek()?.t === 'dot') {
      this.next()
      const column = this.identifier('a column name after “.”')
      return { table: first.v, column: column.v }
    }
    return { table: null, column: first.v }
  }

  private parseTableRef(): { table: string; alias: string | null } {
    const table = this.identifier('a table name')
    if (this.peek()?.t === 'dot')
      this.fail('Schema-qualified table names are not supported — use the logical name.', this.at())
    return { table: table.v, alias: this.parseAlias() }
  }

  private parseJoin(): SqlJoin | null {
    let type: 'inner' | 'outer'
    const start = this.peek()
    if (!start) return null
    if (this.isWord('inner')) {
      this.next()
      type = 'inner'
    } else if (this.isWord('left')) {
      this.next()
      this.acceptWord('outer')
      type = 'outer'
    } else if (this.isWord('join')) {
      type = 'inner'
    } else if (this.isWord('right') || this.isWord('full') || this.isWord('cross')) {
      this.fail(
        `${start.v.toUpperCase()} JOIN is not supported — only INNER JOIN and LEFT JOIN.`,
        start.pos,
      )
    } else {
      return null
    }
    this.expectWord('join')
    const { table, alias } = this.parseTableRef()
    this.expectWord('on')
    const onStart = this.at()
    const on = this.parseExpression()

    // The ON clause must be an AND chain holding exactly one column-to-column
    // equality; everything else is an extra filter on the joined table.
    const parts = on.kind === 'group' && on.op === 'and' ? on.children : [on]
    if (on.kind === 'group' && on.op === 'or')
      this.fail('JOIN … ON must combine its conditions with AND.', onStart)
    const equalities = parts.filter((p) => p.kind === 'join')
    if (equalities.length !== 1)
      this.fail(
        'JOIN … ON needs exactly one “a.col = b.col” equality between the two tables.',
        onStart,
      )
    const eq = equalities[0] as Extract<SqlWhere, { kind: 'join' }>
    const extras = parts.filter((p) => p.kind !== 'join')
    for (const extra of extras) assertNoJoinConditions(extra, this)
    const extra: SqlWhere | null =
      extras.length === 0
        ? null
        : extras.length === 1
          ? extras[0]
          : { kind: 'group', op: 'and', children: extras }
    return { type, table, alias: alias ?? table, left: eq.left, right: eq.right, extra }
  }

  private parseOrderItem(): SqlOrder {
    const ref = this.parseColumnRef()
    if (this.peek()?.t === 'lparen')
      this.fail('ORDER BY can only reference columns, not expressions.', this.at())
    let desc = false
    if (this.acceptWord('desc')) desc = true
    else this.acceptWord('asc')
    return { ref, desc }
  }

  // --- boolean expressions -------------------------------------------------

  parseExpression(): SqlWhere {
    const children: SqlWhere[] = [this.parseAnd()]
    while (this.acceptWord('or')) children.push(this.parseAnd())
    return children.length === 1 ? children[0] : { kind: 'group', op: 'or', children }
  }

  private parseAnd(): SqlWhere {
    const children: SqlWhere[] = [this.parsePrimary()]
    while (this.acceptWord('and')) children.push(this.parsePrimary())
    return children.length === 1 ? children[0] : { kind: 'group', op: 'and', children }
  }

  private parsePrimary(): SqlWhere {
    const token = this.peek()
    if (!token) this.fail('Expected a condition.')
    if (token.t === 'lparen') {
      this.next()
      const inner = this.parseExpression()
      this.expectType('rparen', '“)”')
      return inner
    }
    if (this.isWord('not'))
      this.fail('NOT before a condition is not supported — use NOT LIKE / NOT IN / IS NOT NULL / <>.', token.pos)
    if (this.isWord('exists'))
      this.fail('EXISTS is not supported by Dataverse SQL.', token.pos)
    if (token.t !== 'word')
      this.fail('A condition must start with a column — literal-to-literal comparisons are not supported.', token.pos)
    if (token.v.toLowerCase() === 'select')
      this.fail('Subqueries are not supported by Dataverse SQL.', token.pos)
    return this.parseCondition()
  }

  private parseCondition(): SqlWhere {
    const refStart = this.at()
    const ref = this.parseColumnRef()
    if (this.peek()?.t === 'lparen')
      this.fail('Functions cannot be applied to column values.', refStart)

    const negated = this.acceptWord('not')
    const token = this.peek()
    if (!token) this.fail('Expected an operator after the column.')

    if (this.isWord('is')) {
      if (negated) this.fail('Use “IS NOT NULL”, not “NOT IS NULL”.', token.pos)
      this.next()
      const not = this.acceptWord('not')
      this.expectWord('null')
      return { kind: 'cond', ref, operator: not ? 'not-null' : 'null', values: [] }
    }

    if (this.isWord('like')) {
      this.next()
      const pattern = this.expectType('string', 'a string pattern after LIKE')
      return {
        kind: 'cond',
        ref,
        operator: negated ? 'not-like' : 'like',
        values: [{ kind: 'string', text: pattern.v }],
      }
    }

    if (this.isWord('in')) {
      this.next()
      this.expectType('lparen', '“(” after IN')
      if (this.isWord('select'))
        this.fail('Subqueries are not supported by Dataverse SQL.', this.at())
      const values: SqlLiteral[] = [this.parseLiteral()]
      while (this.peek()?.t === 'comma') {
        this.next()
        values.push(this.parseLiteral())
      }
      this.expectType('rparen', '“)” after the IN list')
      return { kind: 'cond', ref, operator: negated ? 'not-in' : 'in', values }
    }

    if (this.isWord('between')) {
      this.next()
      const from = this.parseLiteral()
      this.expectWord('and')
      const to = this.parseLiteral()
      return {
        kind: 'cond',
        ref,
        operator: negated ? 'not-between' : 'between',
        values: [from, to],
      }
    }

    if (negated) this.fail('Unexpected NOT — supported forms: NOT LIKE, NOT IN, NOT BETWEEN.', token.pos)

    if (token.t !== 'op')
      this.fail(`Expected a comparison operator but found “${token.v}”.`, token.pos)
    this.next()
    const operator = COMPARE[token.v]

    // Column-to-column — only meaningful in ON, checked by the caller.
    const rhs = this.peek()
    if (rhs?.t === 'word' && !isLiteralWord(rhs.v)) {
      const right = this.parseColumnRef()
      if (operator !== 'eq')
        this.fail('Column-to-column comparisons other than “=” in JOIN … ON are not supported.', token.pos)
      return { kind: 'join', left: ref, right }
    }

    const value = this.parseLiteral()
    if (value.kind === 'null')
      this.fail('Do not compare with NULL — use IS NULL / IS NOT NULL.', token.pos)
    return { kind: 'cond', ref, operator, values: [value] }
  }

  /** A constant: string, number, NULL, TRUE/FALSE, GETUTCDATE(), DATEADD(...). */
  private parseLiteral(): SqlLiteral {
    const token = this.next()
    if (!token) this.fail('Expected a value.')
    if (token.t === 'string') return { kind: 'string', text: token.v }
    if (token.t === 'number') {
      if (!/^-?\d+(\.\d+)?$/.test(token.v))
        this.fail(`“${token.v}” is not a valid number.`, token.pos)
      return { kind: 'number', text: token.v }
    }
    if (token.t === 'word') {
      const lower = token.v.toLowerCase()
      if (lower === 'null') return { kind: 'null', text: 'null' }
      if (lower === 'true') return { kind: 'boolean', text: 'true' }
      if (lower === 'false') return { kind: 'boolean', text: 'false' }
      if (lower === 'getutcdate' || lower === 'getdate' || lower === 'sysutcdatetime') {
        this.expectType('lparen', '“(”')
        this.expectType('rparen', '“)”')
        return { kind: 'date', text: isoDate(this.now) }
      }
      if (lower === 'dateadd') return this.parseDateAdd()
      this.fail(
        `“${token.v}” is not a supported value — expected a literal, GETUTCDATE() or DATEADD(...).`,
        token.pos,
      )
    }
    if (token.t === 'lparen')
      this.fail('Expressions and subqueries are not supported as values.', token.pos)
    this.fail(`Unexpected “${token.v}” — expected a value.`, token.pos)
  }

  private parseDateAdd(): SqlLiteral {
    this.expectType('lparen', '“(” after DATEADD')
    const part = this.expectType('word', 'a date part (day, month, year, …)')
    const partKey = part.v.toLowerCase()
    if (!(partKey in DATE_PARTS))
      this.fail(`“${part.v}” is not a supported DATEADD date part.`, part.pos)
    this.expectType('comma', '“,”')
    const amount = this.expectType('number', 'an integer amount')
    if (!/^-?\d+$/.test(amount.v))
      this.fail('DATEADD amount must be an integer.', amount.pos)
    this.expectType('comma', '“,”')
    const baseStart = this.at()
    const base = this.parseLiteral()
    if (base.kind !== 'date' && base.kind !== 'string')
      this.fail('DATEADD must be applied to a date literal or another date function, not a column.', baseStart)
    const baseDate = base.kind === 'date' ? new Date(base.text) : parseDateLiteral(base.text)
    if (!baseDate || Number.isNaN(baseDate.getTime()))
      this.fail(`“${base.text}” is not a date.`, baseStart)
    this.expectType('rparen', '“)”')
    return {
      kind: 'date',
      text: isoDate(addToDate(baseDate, partKey, Number(amount.v))),
    }
  }
}

const COMPARE: Record<string, SqlConditionOperator> = {
  '=': 'eq',
  '<>': 'ne',
  '>': 'gt',
  '<': 'lt',
  '>=': 'ge',
  '<=': 'le',
}

const LITERAL_WORDS = new Set(['null', 'true', 'false', 'getutcdate', 'getdate', 'sysutcdatetime', 'dateadd'])

function isLiteralWord(word: string): boolean {
  return LITERAL_WORDS.has(word.toLowerCase())
}

/** `'2023-01-01 17:00:00'` / `'2023-01-01'` / ISO → Date (UTC). */
function parseDateLiteral(text: string): Date | null {
  const trimmed = text.trim()
  const normalised = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00Z`
    : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(trimmed)
      ? `${trimmed.replace(' ', 'T')}Z`
      : trimmed
  const date = new Date(normalised)
  return Number.isNaN(date.getTime()) ? null : date
}

/** A `WHERE` (or an extra `ON` filter) may not contain column-to-column terms. */
function assertNoJoinConditions(node: SqlWhere, parser: { fail(message: string): never }): void {
  if (node.kind === 'join')
    parser.fail(
      `Column-to-column comparisons (${refText(node.left)} = ${refText(node.right)}) are only allowed in JOIN … ON.`,
    )
  if (node.kind === 'group') for (const child of node.children) assertNoJoinConditions(child, parser)
}

function refText(ref: SqlColumnRef): string {
  return ref.table ? `${ref.table}.${ref.column}` : ref.column
}

/**
 * Parse one SELECT statement of the Dataverse T-SQL subset. Never throws;
 * date functions are evaluated against `now` (injectable for tests).
 */
export function parseSql(text: string, now: Date = new Date()): SqlParseResult {
  try {
    const tokens = tokenizeSql(text)
    const parser = new Parser(tokens, now, text)
    return { ok: true, statement: parser.parseStatement() }
  } catch (err) {
    if (err instanceof SqlSyntaxError)
      return { ok: false, error: err.message, position: err.position }
    return { ok: false, error: err instanceof Error ? err.message : String(err), position: 0 }
  }
}

// ---------------------------------------------------------------------------
// FetchXML rendering
// ---------------------------------------------------------------------------

export interface SqlRenderContext {
  /**
   * Primary id attribute per table logical name — needed for `COUNT(*)`,
   * which FetchXML expresses as `aggregate="count"` on a column. Falls back
   * to the `<table>id` convention when unknown.
   */
  primaryIdOf?: (table: string) => string | undefined
}

export interface SqlRenderOk {
  ok: true
  fetchXml: string
  /** Logical name of the main table (the FROM table). */
  entity: string
  /** Non-fatal remarks about the translation. */
  notes: string[]
}

export interface SqlRenderError {
  ok: false
  error: string
  position: number
}

export type SqlRenderResult = SqlRenderOk | SqlRenderError

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** An OData-style `_x_value` is accepted and mapped to the logical name. */
function logicalColumn(column: string, notes: string[]): string {
  const match = column.match(/^_(.+)_value$/)
  if (!match) return column
  notes.push(`“${column}” was read as the lookup column “${match[1]}”.`)
  return match[1]
}

interface LinkNode {
  join: SqlJoin
  /** Alias of the table this link hangs off (main or another link). */
  parentAlias: string
  /** `from` = column on the joined table, `to` = column on the parent. */
  from: string
  to: string
  children: LinkNode[]
  attributes: string[]
  filter: string | null
}

function literalValue(literal: SqlLiteral): string {
  switch (literal.kind) {
    case 'boolean':
      return literal.text === 'true' ? '1' : '0'
    default:
      return literal.text
  }
}

/**
 * Render a parsed statement as FetchXML. The alias model is resolved here:
 * every column reference is attributed to the main table or to one join,
 * and an unknown qualifier is an error rather than a guess.
 */
export function renderFetchXml(
  statement: SqlStatement,
  ctx: SqlRenderContext = {},
): SqlRenderResult {
  const notes: string[] = []
  const main = statement.from
  const mainAlias = (main.alias ?? main.table).toLowerCase()
  const aliasToTable = new Map<string, string>([[mainAlias, main.table]])
  // Allow the bare table name as a qualifier even when an alias exists — as
  // long as it is unambiguous.
  const tableQualifiers = new Map<string, string>([[main.table.toLowerCase(), mainAlias]])

  const fail = (error: string): SqlRenderError => ({ ok: false, error, position: 0 })

  // --- joins → link tree --------------------------------------------------
  const links = new Map<string, LinkNode>()
  const roots: LinkNode[] = []
  for (const join of statement.joins) {
    const alias = join.alias.toLowerCase()
    if (aliasToTable.has(alias)) return fail(`Alias “${join.alias}” is used twice.`)
    aliasToTable.set(alias, join.table)
    if (!tableQualifiers.has(join.table.toLowerCase()))
      tableQualifiers.set(join.table.toLowerCase(), alias)
    else tableQualifiers.set(join.table.toLowerCase(), '')

    const resolveSide = (ref: SqlColumnRef): string | null => {
      if (!ref.table) return null
      const key = ref.table.toLowerCase()
      if (aliasToTable.has(key)) return key
      const viaTable = tableQualifiers.get(key)
      return viaTable ? viaTable : null
    }
    const leftAlias = resolveSide(join.left)
    const rightAlias = resolveSide(join.right)
    if (!leftAlias || !rightAlias)
      return fail(
        `JOIN … ON must qualify both columns with a table alias (${refText(join.left)} = ${refText(join.right)}).`,
      )
    let joined: SqlColumnRef
    let parent: SqlColumnRef
    let parentAlias: string
    if (leftAlias === alias && rightAlias !== alias) {
      joined = join.left
      parent = join.right
      parentAlias = rightAlias
    } else if (rightAlias === alias && leftAlias !== alias) {
      joined = join.right
      parent = join.left
      parentAlias = leftAlias
    } else {
      return fail(
        `JOIN … ON for “${join.alias}” must relate a column of “${join.alias}” to a column of a table joined before it.`,
      )
    }
    const node: LinkNode = {
      join,
      parentAlias,
      from: logicalColumn(joined.column, notes),
      to: logicalColumn(parent.column, notes),
      children: [],
      attributes: [],
      filter: null,
    }
    links.set(alias, node)
    const parentNode = links.get(parentAlias)
    if (parentNode) parentNode.children.push(node)
    else roots.push(node)
  }

  /** The alias as written (the map keys are lowercased for matching). */
  const aliasText = (owner: string): string => links.get(owner)?.join.alias ?? owner

  /** Resolve a column reference to the alias that owns it (main = mainAlias). */
  const ownerOf = (ref: SqlColumnRef): string | SqlRenderError => {
    if (!ref.table) return mainAlias
    const key = ref.table.toLowerCase()
    if (aliasToTable.has(key)) return key
    const viaTable = tableQualifiers.get(key)
    if (viaTable) return viaTable
    if (viaTable === '')
      return fail(`“${ref.table}” is joined more than once — qualify the column with its alias.`)
    return fail(`Unknown table alias “${ref.table}” in ${refText(ref)}.`)
  }

  // --- aggregate mode ---------------------------------------------------
  const aggregate =
    statement.groupBy.length > 0 || statement.columns.some((c) => c.aggregate !== null)

  // Alias per select item in aggregate mode — FetchXML insists on one.
  const autoAlias = (item: SqlSelectItem): string => {
    if (item.alias) return item.alias
    if (!item.ref) return 'count'
    const column = logicalColumn(item.ref.column, notes)
    return item.ref.table ? `${item.ref.table}_${column}` : column
  }

  const attributeLines = new Map<string, string[]>() // owner alias → <attribute> lines
  const push = (owner: string, line: string) => {
    const list = attributeLines.get(owner) ?? []
    list.push(line)
    attributeLines.set(owner, list)
  }

  const groupKeys = new Set(
    statement.groupBy.map((g) => `${(g.table ?? '').toLowerCase()}|${g.column.toLowerCase()}`),
  )
  const sameRef = (a: SqlColumnRef, b: SqlColumnRef): boolean =>
    a.column.toLowerCase() === b.column.toLowerCase() &&
    (a.table ?? '').toLowerCase() === (b.table ?? '').toLowerCase()
  const isGrouped = (ref: SqlColumnRef): boolean =>
    groupKeys.has(`${(ref.table ?? '').toLowerCase()}|${ref.column.toLowerCase()}`) ||
    statement.groupBy.some((g) => sameRef(g, ref))

  /** Alias of the attribute an ORDER BY / GROUP BY ref maps onto in aggregate mode. */
  const aliasByRef: { ref: SqlColumnRef; alias: string }[] = []

  for (const item of statement.columns) {
    if (item.aggregate === 'count' && !item.ref) {
      const primaryId = ctx.primaryIdOf?.(main.table) ?? `${main.table}id`
      if (!ctx.primaryIdOf?.(main.table))
        notes.push(`COUNT(*) counts “${primaryId}” (the primary key by convention).`)
      push(
        mainAlias,
        `<attribute name="${xmlEscape(primaryId)}" alias="${xmlEscape(autoAlias(item))}" aggregate="count" />`,
      )
      continue
    }
    const ref = item.ref!
    const owner = ownerOf(ref)
    if (typeof owner !== 'string') return owner
    const column = logicalColumn(ref.column, notes)
    if (aggregate) {
      const alias = autoAlias(item)
      aliasByRef.push({ ref, alias })
      if (item.aggregate) {
        push(
          owner,
          `<attribute name="${xmlEscape(column)}" alias="${xmlEscape(alias)}" aggregate="${item.aggregate}"${item.distinct ? ' distinct="true"' : ''} />`,
        )
      } else {
        if (!isGrouped(ref))
          return fail(
            `“${refText(ref)}” must appear in GROUP BY or inside an aggregate function.`,
          )
        push(
          owner,
          `<attribute name="${xmlEscape(column)}" alias="${xmlEscape(alias)}" groupby="true" />`,
        )
      }
    } else {
      push(
        owner,
        `<attribute name="${xmlEscape(column)}"${item.alias ? ` alias="${xmlEscape(item.alias)}"` : ''} />`,
      )
    }
  }

  // GROUP BY columns that are not selected still have to be grouping
  // attributes in FetchXML — they come back as extra columns, which is the
  // closest FetchXML can get.
  for (const group of statement.groupBy) {
    const selected = statement.columns.some((c) => c.ref && !c.aggregate && sameRef(c.ref, group))
    if (selected) continue
    const owner = ownerOf(group)
    if (typeof owner !== 'string') return owner
    const column = logicalColumn(group.column, notes)
    const alias = group.table ? `${group.table}_${column}` : column
    aliasByRef.push({ ref: group, alias })
    push(owner, `<attribute name="${xmlEscape(column)}" alias="${xmlEscape(alias)}" groupby="true" />`)
    notes.push(`GROUP BY “${refText(group)}” is not selected — FetchXML returns it anyway.`)
  }

  // --- filters ------------------------------------------------------------
  const renderCondition = (
    node: Extract<SqlWhere, { kind: 'cond' }>,
    scope: string | null,
  ): string | SqlRenderError => {
    const owner = ownerOf(node.ref)
    if (typeof owner !== 'string') return owner
    const column = logicalColumn(node.ref.column, notes)
    // Inside a link-entity's own <filter> the alias is implicit; at the top
    // level a joined column needs `entityname`.
    let entityAttr = ''
    if (scope === null && owner !== mainAlias)
      entityAttr = ` entityname="${xmlEscape(aliasText(owner))}"`
    else if (scope !== null && owner !== scope)
      return fail(
        `Additional JOIN … ON filters must address the joined table (found ${refText(node.ref)}).`,
      )
    const attr = `attribute="${xmlEscape(column)}"${entityAttr}`
    const op = node.operator
    if (op === 'null' || op === 'not-null')
      return `<condition ${attr} operator="${op}" />`
    if (op === 'in' || op === 'not-in' || op === 'between' || op === 'not-between') {
      const values = node.values.map((v) => `<value>${xmlEscape(literalValue(v))}</value>`).join('')
      return `<condition ${attr} operator="${op}">${values}</condition>`
    }
    return `<condition ${attr} operator="${op}" value="${xmlEscape(literalValue(node.values[0]))}" />`
  }

  const renderWhere = (node: SqlWhere, scope: string | null): string | SqlRenderError => {
    if (node.kind === 'join')
      return fail('Column-to-column comparisons are only allowed in JOIN … ON.')
    if (node.kind === 'cond') return renderCondition(node, scope)
    const parts: string[] = []
    for (const child of node.children) {
      const rendered = renderWhere(child, scope)
      if (typeof rendered !== 'string') return rendered
      parts.push(rendered)
    }
    return `<filter type="${node.op}">${parts.join('')}</filter>`
  }

  const wrap = (xml: string): string =>
    xml.startsWith('<filter') ? xml : `<filter type="and">${xml}</filter>`

  let mainFilter = ''
  if (statement.where) {
    const rendered = renderWhere(statement.where, null)
    if (typeof rendered !== 'string') return rendered
    mainFilter = wrap(rendered)
  }
  for (const [alias, node] of links) {
    if (!node.join.extra) continue
    const rendered = renderWhere(node.join.extra, alias)
    if (typeof rendered !== 'string') return rendered
    node.filter = wrap(rendered)
  }

  // --- order --------------------------------------------------------------
  const orderLines: string[] = []
  for (const order of statement.orderBy) {
    if (aggregate) {
      // Order by the alias of a selected/grouped attribute, or by an alias name.
      const byAliasName = order.ref.table
        ? undefined
        : [...statement.columns.map((c) => c.alias), ...aliasByRef.map((a) => a.alias)].find(
            (a) => a && a.toLowerCase() === order.ref.column.toLowerCase(),
          )
      const match =
        byAliasName ??
        aliasByRef.find((a) => sameRef(a.ref, order.ref))?.alias ??
        statement.columns.find((c) => c.ref && sameRef(c.ref, order.ref))?.alias
      if (!match)
        return fail(
          `ORDER BY “${refText(order.ref)}” must be a selected column or aggregate alias in a GROUP BY query.`,
        )
      orderLines.push(`<order alias="${xmlEscape(match)}"${order.desc ? ' descending="true"' : ''} />`)
      continue
    }
    const owner = ownerOf(order.ref)
    if (typeof owner !== 'string') return owner
    const column = logicalColumn(order.ref.column, notes)
    const entityAttr =
      owner !== mainAlias ? ` entityname="${xmlEscape(aliasText(owner))}"` : ''
    orderLines.push(
      `<order attribute="${xmlEscape(column)}"${entityAttr}${order.desc ? ' descending="true"' : ''} />`,
    )
  }

  // --- paging -------------------------------------------------------------
  const fetchAttrs: string[] = []
  if (statement.distinct) fetchAttrs.push('distinct="true"')
  if (aggregate) fetchAttrs.push('aggregate="true"')
  if (statement.offset) {
    if (statement.top !== null) return fail('Use either TOP or OFFSET … FETCH, not both.')
    const { skip, take } = statement.offset
    if (skip % take !== 0)
      return fail(
        `OFFSET must be a multiple of the FETCH size (FetchXML pages: OFFSET ${take * Math.floor(skip / take)} or ${take * Math.ceil(skip / take)}).`,
      )
    fetchAttrs.push(`count="${take}" page="${skip / take + 1}"`)
    notes.push(
      `OFFSET/FETCH became page ${skip / take + 1} of ${take} rows — the native Web API SQL endpoint does not support OFFSET.`,
    )
  } else if (statement.top !== null) {
    if (statement.top > 5000) notes.push('TOP is capped at 5000 rows by Dataverse.')
    fetchAttrs.push(`top="${Math.min(statement.top, 5000)}"`)
  }

  // --- assemble -----------------------------------------------------------
  const renderLink = (node: LinkNode): string => {
    const attrs = attributeLines.get(node.join.alias.toLowerCase()) ?? []
    const inner = [
      ...attrs,
      node.filter ?? '',
      ...node.children.map(renderLink),
    ].join('')
    return (
      `<link-entity name="${xmlEscape(node.join.table)}" from="${xmlEscape(node.from)}" to="${xmlEscape(node.to)}" ` +
      `alias="${xmlEscape(node.join.alias)}" link-type="${node.join.type}">${inner}</link-entity>`
    )
  }

  const fetchXml =
    `<fetch${fetchAttrs.length ? ' ' + fetchAttrs.join(' ') : ''}>` +
    `<entity name="${xmlEscape(main.table)}">` +
    (attributeLines.get(mainAlias) ?? []).join('') +
    roots.map(renderLink).join('') +
    mainFilter +
    orderLines.join('') +
    `</entity></fetch>`

  return { ok: true, fetchXml, entity: main.table, notes: [...new Set(notes)] }
}

/**
 * The FROM table of a statement — parsed when the parser can read it,
 * otherwise a lenient regex (comments stripped), so a statement the parser
 * rejects still finds its entity set and Dataverse gets to decide.
 */
export function sqlFromTable(text: string): string | null {
  const parsed = parseSql(text)
  if (parsed.ok) return parsed.statement.from.table
  const stripped = text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const match = stripped.match(/\bfrom\s+\[?([A-Za-z_][A-Za-z0-9_]*)\]?/i)
  return match ? match[1] : null
}

/** Parse + render in one go — the "→ FetchXML" translation. */
export function sqlToFetchXml(
  text: string,
  ctx: SqlRenderContext = {},
  now: Date = new Date(),
): SqlRenderResult {
  const parsed = parseSql(text, now)
  if (!parsed.ok) return { ok: false, error: parsed.error, position: parsed.position }
  return renderFetchXml(parsed.statement, ctx)
}

/**
 * The native Web API URL for a SQL statement — for Copy URL / a browser tab
 * where the caller has their own token. This is the endpoint the connector
 * cannot reach; the browser itself runs the FetchXML translation.
 */
export function sqlWebApiUrl(orgUrl: string, entitySet: string, sql: string): string {
  const base = orgUrl.replace(/\/+$/, '')
  return `${base}/api/data/v9.2/${entitySet}?sql=${encodeURIComponent(sql.trim())}`
}

/** `line:column` for an error position — the textarea has no gutter. */
export function describePosition(text: string, position: number): string {
  const before = text.slice(0, Math.max(0, Math.min(position, text.length)))
  const line = before.split('\n').length
  const column = before.length - before.lastIndexOf('\n')
  return `line ${line}, column ${column}`
}
