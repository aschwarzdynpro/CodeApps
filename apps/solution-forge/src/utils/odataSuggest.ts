import type {
  ColumnMeta,
  EntityMeta,
  EntityRef,
  OptionLabel,
} from '../types/odataBrowser'
import { OPERATORS, operatorsFor } from './odataFilter'

/**
 * OData Browser — the IntelliSense engine.
 *
 * One pure function drives completion for every input. It takes the text and
 * a caret position, works out **which part of the query the caret sits in**,
 * and returns replacements. The UI is deliberately dumb: it applies
 * `replaceFrom..replaceTo` and moves the caret.
 *
 * The raw query line gets the same completions as any single-purpose field,
 * because "which option am I inside" is resolved by scanning back to the last
 * `&$option=` and then reusing the very same per-option rules.
 */

export type SuggestionKind =
  | 'table'
  | 'column'
  | 'lookup'
  | 'operator'
  | 'function'
  | 'value'
  | 'keyword'

export interface Suggestion {
  /** Primary text in the list. */
  label: string
  /** What gets written into the input. */
  insert: string
  /** Secondary text (type, target table, option code…). */
  detail?: string
  kind: SuggestionKind
  /** Range in the original text that `insert` replaces. */
  replaceFrom: number
  replaceTo: number
}

export interface SuggestContext {
  entities: EntityRef[]
  meta: EntityMeta | null
  /** Choice options per `$select` column name, where already loaded. */
  options?: Map<string, OptionLabel[]>
}

/** Which `$option` (or the path) the caret is in. */
export type QueryRegion =
  | 'path'
  | '$select'
  | '$filter'
  | '$orderby'
  | '$expand'
  | '$top'
  | 'unknown'

const CRM_PREFIX = 'Microsoft.Dynamics.CRM.'

/** Query functions offered in `$filter`, with their signature for the hint strip. */
export const CRM_FUNCTIONS: { name: string; signature: string }[] = [
  { name: 'Today', signature: "Today(PropertyName='column')" },
  { name: 'Yesterday', signature: "Yesterday(PropertyName='column')" },
  { name: 'Tomorrow', signature: "Tomorrow(PropertyName='column')" },
  { name: 'ThisWeek', signature: "ThisWeek(PropertyName='column')" },
  { name: 'ThisMonth', signature: "ThisMonth(PropertyName='column')" },
  { name: 'ThisYear', signature: "ThisYear(PropertyName='column')" },
  {
    name: 'LastXDays',
    signature: "LastXDays(PropertyName='column',PropertyValue=n)",
  },
  {
    name: 'NextXDays',
    signature: "NextXDays(PropertyName='column',PropertyValue=n)",
  },
  {
    name: 'OlderThanXDays',
    signature: "OlderThanXDays(PropertyName='column',PropertyValue=n)",
  },
  { name: 'EqualUserId', signature: "EqualUserId(PropertyName='ownerid')" },
  {
    name: 'EqualBusinessId',
    signature: "EqualBusinessId(PropertyName='ownerid')",
  },
  {
    name: 'ContainValues',
    signature: "ContainValues(PropertyName='column',PropertyValues=['1'])",
  },
]

const STRING_FUNCTIONS = [
  { name: 'contains', signature: "contains(column,'text')" },
  { name: 'startswith', signature: "startswith(column,'text')" },
  { name: 'endswith', signature: "endswith(column,'text')" },
]

/**
 * Locate the caret: the region it is in and where that region's value starts.
 * Splitting is done on `&` **only where a `$option=` follows**, mirroring
 * `parseQueryPath` — an ampersand inside a value must not confuse this either.
 */
export function regionAt(
  text: string,
  caret: number,
): { region: QueryRegion; valueStart: number } {
  const questionMark = text.indexOf('?')
  if (questionMark === -1 || caret <= questionMark)
    return { region: 'path', valueStart: text.startsWith('/') ? 1 : 0 }

  // The last `?$x=` / `&$x=` that starts at or before the caret wins.
  const pattern = /[?&](\$[a-zA-Z]+)=/g
  let region: QueryRegion = 'unknown'
  let valueStart = questionMark + 1
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index + match[0].length
    if (start > caret) break
    const name = match[1].toLowerCase()
    region = (
      ['$select', '$filter', '$orderby', '$expand', '$top'] as const
    ).includes(name as '$select')
      ? (name as QueryRegion)
      : 'unknown'
    valueStart = start
  }
  return { region, valueStart }
}

/** The word under the caret, and the range it occupies. */
function tokenAt(
  text: string,
  caret: number,
  extra = '',
): { word: string; from: number; to: number } {
  const isWord = (ch: string) => /[\w.]/.test(ch) || extra.includes(ch)
  let from = caret
  while (from > 0 && isWord(text[from - 1])) from--
  let to = caret
  while (to < text.length && isWord(text[to])) to++
  return { word: text.slice(from, caret), from, to }
}

function matches(candidate: string, needle: string): boolean {
  return needle === '' || candidate.toLowerCase().includes(needle.toLowerCase())
}

/** Columns that may appear in `$select` / `$orderby` / `$filter`. */
function selectableColumns(meta: EntityMeta | null): ColumnMeta[] {
  return (meta?.columns ?? []).filter((c) => c.selectable)
}

function columnSuggestions(
  columns: ColumnMeta[],
  word: string,
  from: number,
  to: number,
): Suggestion[] {
  return columns
    .filter(
      (c) => matches(c.selectName, word) || matches(c.displayName, word),
    )
    .map((c) => ({
      label: c.selectName,
      insert: c.selectName,
      detail: `${c.displayName} · ${c.kind}`,
      kind: c.kind === 'lookup' ? ('lookup' as const) : ('column' as const),
      replaceFrom: from,
      replaceTo: to,
    }))
}

/**
 * Suggestions for the caret position. Returns an empty list when there is
 * nothing useful to offer — the popup then stays closed.
 */
export function suggest(
  text: string,
  caret: number,
  ctx: SuggestContext,
): Suggestion[] {
  const { region, valueStart } = regionAt(text, caret)
  const columns = selectableColumns(ctx.meta)

  if (region === 'path') {
    const { word, from, to } = tokenAt(text, caret)
    return ctx.entities
      .filter(
        (e) =>
          matches(e.entitySet, word) ||
          matches(e.logicalName, word) ||
          matches(e.displayName, word),
      )
      .slice(0, 50)
      .map((e) => ({
        label: e.entitySet,
        insert: e.entitySet,
        detail: `${e.displayName}${e.isCustomEntity ? ' · custom' : ''}`,
        kind: 'table' as const,
        replaceFrom: from,
        replaceTo: to,
      }))
  }

  if (region === '$select') {
    const { word, from, to } = tokenAt(text, caret)
    return columnSuggestions(columns, word, from, to).slice(0, 50)
  }

  if (region === '$orderby') {
    const { word, from, to } = tokenAt(text, caret)
    // After a complete column plus a space, the direction is what's missing.
    const before = text.slice(valueStart, from)
    if (/[\w]\s+$/.test(before) && word === '')
      return ['asc', 'desc'].map((direction) => ({
        label: direction,
        insert: direction,
        detail: 'sort direction',
        kind: 'keyword' as const,
        replaceFrom: from,
        replaceTo: to,
      }))
    return columnSuggestions(columns, word, from, to).slice(0, 50)
  }

  if (region === '$expand') {
    const { word, from, to } = tokenAt(text, caret)
    const insideParens = /\([^)]*$/.test(text.slice(valueStart, caret))
    if (insideParens) {
      // Inside `nav(...)` — offer $select and, once past it, nothing useful
      // without the target table's metadata (that is P4's job).
      if (!text.slice(valueStart, caret).includes('$select='))
        return [
          {
            label: '$select=',
            insert: '$select=',
            detail: 'columns of the expanded table',
            kind: 'keyword' as const,
            replaceFrom: from,
            replaceTo: to,
          },
        ]
      return []
    }
    return (ctx.meta?.lookups ?? [])
      .filter((l) => matches(l.navigationName, word))
      .slice(0, 50)
      .map((l) => ({
        label: l.navigationName,
        insert: l.navigationName,
        detail: `→ ${l.targetEntity}`,
        kind: 'lookup' as const,
        replaceFrom: from,
        replaceTo: to,
      }))
  }

  if (region === '$filter') return filterSuggestions(text, caret, valueStart, ctx, columns)

  return []
}

/** The `$filter` grammar is the only one that needs to look at what precedes. */
function filterSuggestions(
  text: string,
  caret: number,
  valueStart: number,
  ctx: SuggestContext,
  columns: ColumnMeta[],
): Suggestion[] {
  const { word, from, to } = tokenAt(text, caret)
  const before = text.slice(valueStart, from).trimEnd()

  // Typing a CRM function path — offer the function names.
  if (word.startsWith(CRM_PREFIX) || CRM_PREFIX.startsWith(word)) {
    if (word.includes('.')) {
      const partial = word.slice(word.lastIndexOf('.') + 1)
      return CRM_FUNCTIONS.filter((f) => matches(f.name, partial)).map((f) => ({
        label: `${CRM_PREFIX}${f.name}`,
        insert: `${CRM_PREFIX}${f.name}(PropertyName='`,
        detail: f.signature,
        kind: 'function' as const,
        replaceFrom: from,
        replaceTo: to,
      }))
    }
  }

  // Inside a CRM function's PropertyName string → column names.
  const openCall = before.match(/Microsoft\.Dynamics\.CRM\.\w+\(PropertyName='$/)
  if (openCall || /PropertyName='$/.test(text.slice(valueStart, caret))) {
    const quoted = tokenAt(text, caret, '')
    return columns
      .filter((c) => matches(c.logicalName, quoted.word))
      .slice(0, 50)
      .map((c) => ({
        label: c.logicalName,
        insert: c.logicalName,
        detail: `${c.displayName} · ${c.kind}`,
        kind: 'column' as const,
        replaceFrom: quoted.from,
        replaceTo: quoted.to,
      }))
  }

  const lastWord = /([\w.]+)$/.exec(before)?.[1] ?? ''
  const column = columns.find((c) => c.selectName === lastWord)

  // After a column → the operators valid for its type.
  if (column && word === '') {
    const ops = operatorsFor(column.kind)
      .filter((o) => ['eq', 'ne', 'gt', 'ge', 'lt', 'le'].includes(o.id))
      .map((o) => ({
        label: o.id,
        insert: o.id,
        detail: o.label,
        kind: 'operator' as const,
        replaceFrom: from,
        replaceTo: to,
      }))
    return [
      ...ops,
      {
        label: 'eq null',
        insert: 'eq null',
        detail: 'is empty',
        kind: 'operator' as const,
        replaceFrom: from,
        replaceTo: to,
      },
    ]
  }

  // After a comparison operator → values for that column.
  const comparison = /([\w.]+)\s+(eq|ne|gt|ge|lt|le)\s*$/.exec(before)
  if (comparison) {
    const target = columns.find((c) => c.selectName === comparison[1])
    if (target) return valueSuggestions(target, ctx, word, from, to)
  }

  // Start of an expression, or after and/or/( → columns and functions.
  const atExpressionStart =
    before === '' || /(\band\b|\bor\b|\bnot\b|\()$/i.test(before)
  if (atExpressionStart || word !== '') {
    const cols = columnSuggestions(columns, word, from, to).slice(0, 40)
    const fns = [
      ...STRING_FUNCTIONS.map((f) => ({
        label: f.name,
        insert: `${f.name}(`,
        detail: f.signature,
        kind: 'function' as const,
        replaceFrom: from,
        replaceTo: to,
      })),
      ...CRM_FUNCTIONS.map((f) => ({
        label: `${CRM_PREFIX}${f.name}`,
        insert: `${CRM_PREFIX}${f.name}(PropertyName='`,
        detail: f.signature,
        kind: 'function' as const,
        replaceFrom: from,
        replaceTo: to,
      })),
    ].filter((f) => matches(f.label, word))
    return [...cols, ...fns]
  }

  return []
}

/** Literal suggestions for a column: option labels, booleans, null, dates. */
function valueSuggestions(
  column: ColumnMeta,
  ctx: SuggestContext,
  word: string,
  from: number,
  to: number,
): Suggestion[] {
  const wrap = (insert: string, label: string, detail: string): Suggestion => ({
    label,
    insert,
    detail,
    kind: 'value',
    replaceFrom: from,
    replaceTo: to,
  })

  if (column.kind === 'boolean')
    return [wrap('true', 'true', 'yes'), wrap('false', 'false', 'no')].filter(
      (s) => matches(s.label, word),
    )

  if (column.kind === 'choice' || column.kind === 'multichoice') {
    const options = ctx.options?.get(column.selectName) ?? []
    return options
      .filter((o) => matches(o.label, word) || matches(String(o.value), word))
      .map((o) => wrap(String(o.value), String(o.value), o.label))
  }

  if (column.kind === 'datetime' || column.kind === 'dateonly')
    return [
      wrap(
        `${CRM_PREFIX}Today(PropertyName='${column.logicalName}')`,
        'today',
        'rewrite as the Today function',
      ),
    ]

  if (column.kind === 'lookup' || column.kind === 'guid')
    return [wrap('null', 'null', 'no value')]

  return [wrap('null', 'null', 'no value')].filter((s) => matches(s.label, word))
}

/**
 * The signature strip under the input: which function call the caret is in.
 * Null when it is not inside one.
 */
export function signatureAt(text: string, caret: number): string | null {
  const upto = text.slice(0, caret)
  const open = upto.lastIndexOf('(')
  if (open === -1) return null
  if (upto.slice(open).includes(')')) return null
  const name = /([\w.]+)\($/.exec(upto.slice(0, open + 1))?.[1]
  if (!name) return null
  const bare = name.startsWith(CRM_PREFIX) ? name.slice(CRM_PREFIX.length) : name
  return (
    CRM_FUNCTIONS.find((f) => f.name.toLowerCase() === bare.toLowerCase())
      ?.signature ??
    STRING_FUNCTIONS.find((f) => f.name.toLowerCase() === bare.toLowerCase())
      ?.signature ??
    null
  )
}

/** Operator ids the filter builder knows, for the validation messages. */
export const KNOWN_OPERATOR_IDS = OPERATORS.map((o) => o.id)
