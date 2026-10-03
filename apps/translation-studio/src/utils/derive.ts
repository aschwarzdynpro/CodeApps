import { cellId, type LabelRow, type Lcid, type TranslationFile } from '../types/translation'
import { cellState, type GapRow, type StateCounts } from './gaps'
import { glossaryKey, type Suggestion } from './glossary'

/**
 * Everything the studio derives from the edited file: the state of every
 * target cell, counts per language, glossary suggestions and how many gaps
 * share a base text.
 *
 * Recomputed incrementally. Edits keep the row order and replace only the
 * rows they touch ({@link applyEdits}), and the base text is never edited.
 * So a change affects the touched rows and, for suggestions, the rows that
 * share their base text (one glossary group) — not the 50 000 others.
 *
 * Results match {@link findGaps}, {@link countStates} and
 * {@link suggestFromGlossary} (tests compare them).
 */
export interface Derived {
  file: TranslationFile
  targets: readonly Lcid[]
  acknowledged: ReadonlySet<string>
  /** One entry per row, in file order. */
  gaps: GapRow[]
  counts: Record<Lcid, StateCounts>
  /** Keyed by {@link cellId}. */
  suggestions: Map<string, Suggestion>
  /** `${glossaryKey(base)}|${lcid}` → gaps with a suggestion for that base text. */
  sameBase: Map<string, number>
}

/** Positions and glossary groups of a loaded file — the parts edits never change. */
interface Shape {
  pos: Map<string, number>
  /** Glossary key (normalised base text) per position. */
  group: string[]
  groups: Map<string, number[]>
}

const shapes = new WeakMap<readonly LabelRow[], Shape>()
/** Last result per loaded file: the starting point of the next incremental step. */
const latest = new WeakMap<readonly LabelRow[], Derived>()

function shapeOf(origin: TranslationFile): Shape {
  let s = shapes.get(origin.rows)
  if (s) return s
  const pos = new Map<string, number>()
  const group: string[] = []
  const groups = new Map<string, number[]>()
  origin.rows.forEach((r, i) => {
    pos.set(r.key, i)
    const k = glossaryKey(r.values[origin.baseLanguage] ?? '')
    group.push(k)
    if (!k) return
    const list = groups.get(k)
    if (list) list.push(i)
    else groups.set(k, [i])
  })
  s = { pos, group, groups }
  shapes.set(origin.rows, s)
  return s
}

/** Row position by key in a loaded file (cached). */
export function rowPositions(origin: TranslationFile): ReadonlyMap<string, number> {
  return shapeOf(origin).pos
}

const sameList = (a: readonly Lcid[], b: readonly Lcid[]) => a.length === b.length && a.every((x, i) => x === b[i])
const emptyCounts = (): StateCounts => ({ missing: 0, untranslated: 0, changed: 0, ok: 0 })

function gapRow(row: LabelRow, langs: readonly Lcid[], base: Lcid, ack: ReadonlySet<string>): GapRow {
  const states: GapRow['states'] = {}
  for (const l of langs) if (l in row.original) states[l] = cellState(row, l, base, ack)
  return { row, states }
}

function ranked(counts: Map<string, number>): { value: string; count: number }[] {
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** Suggestions of one glossary group (rows with the same base text). */
function suggestGroup(
  key: string,
  idxs: readonly number[],
  rows: readonly LabelRow[],
  gaps: readonly GapRow[],
  langs: readonly Lcid[],
  out: Map<string, Suggestion>,
  same: Map<string, number>,
): void {
  if (idxs.length < 2) return
  const byLang = new Map<Lcid, Map<string, number>>()
  for (const i of idxs) {
    const row = rows[i]
    for (const l of langs) {
      const s = gaps[i].states[l]
      if (s !== 'ok' && s !== 'changed') continue
      const text = row.values[l]
      if (!text || !text.trim()) continue
      let counts = byLang.get(l)
      if (!counts) byLang.set(l, (counts = new Map()))
      counts.set(text, (counts.get(text) ?? 0) + 1)
    }
  }
  if (byLang.size === 0) return
  const rankedByLang = new Map([...byLang].map(([l, c]) => [l, ranked(c)]))
  for (const i of idxs) {
    const row = rows[i]
    for (const l of langs) {
      const s = gaps[i].states[l]
      if (s !== 'missing' && s !== 'untranslated') continue
      const list = rankedByLang.get(l)
      if (!list) continue
      const [best, ...rest] = list.filter((c) => c.value !== row.values[l])
      if (!best) continue
      out.set(cellId(row.key, l), { value: best.value, count: best.count, alternatives: rest })
      const k = `${key}|${l}`
      same.set(k, (same.get(k) ?? 0) + 1)
    }
  }
}

function full(origin: TranslationFile, file: TranslationFile, targets: readonly Lcid[], ack: ReadonlySet<string>): Derived {
  const shape = shapeOf(origin)
  const base = file.baseLanguage
  const langs = targets.filter((l) => l !== base)
  const gaps = file.rows.map((r) => gapRow(r, langs, base, ack))
  const counts: Record<Lcid, StateCounts> = {}
  for (const l of langs) counts[l] = emptyCounts()
  for (const g of gaps) for (const l of langs) if (g.states[l]) counts[l][g.states[l]]++
  const suggestions = new Map<string, Suggestion>()
  const sameBase = new Map<string, number>()
  for (const [key, idxs] of shape.groups) suggestGroup(key, idxs, file.rows, gaps, langs, suggestions, sameBase)
  return { file, targets, acknowledged: ack, gaps, counts, suggestions, sameBase }
}

function incremental(origin: TranslationFile, prev: Derived, file: TranslationFile, ack: ReadonlySet<string>): Derived {
  const shape = shapeOf(origin)
  const rows = file.rows
  const old = prev.file.rows
  const changed = new Set<number>()
  for (let i = 0; i < rows.length; i++) if (rows[i] !== old[i]) changed.add(i)
  if (prev.acknowledged !== ack) {
    const touch = (id: string) => {
      const i = shape.pos.get(id.slice(0, id.lastIndexOf('\u0001')))
      if (i !== undefined) changed.add(i)
    }
    for (const id of ack) if (!prev.acknowledged.has(id)) touch(id)
    for (const id of prev.acknowledged) if (!ack.has(id)) touch(id)
  }
  if (changed.size === 0) return { ...prev, file, acknowledged: ack }
  // Many rows at once (CSV, unify): a full pass is as fast and simpler.
  if (changed.size > rows.length / 8) return full(origin, file, prev.targets, ack)

  const base = file.baseLanguage
  const langs = prev.targets.filter((l) => l !== base)
  const gaps = prev.gaps.slice()
  const counts: Record<Lcid, StateCounts> = {}
  for (const l of langs) counts[l] = { ...prev.counts[l] }
  const affected = new Set<string>()
  for (const i of changed) {
    const before = gaps[i]
    const after = gapRow(rows[i], langs, base, ack)
    for (const l of langs) {
      if (before.states[l]) counts[l][before.states[l]]--
      if (after.states[l]) counts[l][after.states[l]]++
    }
    gaps[i] = after
    if (shape.group[i]) affected.add(shape.group[i])
  }
  const suggestions = new Map(prev.suggestions)
  const sameBase = new Map(prev.sameBase)
  for (const key of affected) {
    const idxs = shape.groups.get(key)!
    for (const i of idxs) for (const l of langs) suggestions.delete(cellId(rows[i].key, l))
    for (const l of langs) sameBase.delete(`${key}|${l}`)
    suggestGroup(key, idxs, rows, gaps, langs, suggestions, sameBase)
  }
  return { file, targets: prev.targets, acknowledged: ack, gaps, counts, suggestions, sameBase }
}

/**
 * Derived data of `file` (the loaded file `origin` with edits applied).
 * Same inputs return the same object; a step from the previous result of
 * the same origin touches only what changed.
 */
export function derive(origin: TranslationFile, file: TranslationFile, targets: readonly Lcid[], acknowledged: ReadonlySet<string>): Derived {
  const prev = latest.get(origin.rows)
  if (prev && prev.file === file && prev.acknowledged === acknowledged && sameList(prev.targets, targets)) return prev
  const next =
    prev && sameList(prev.targets, targets) && prev.file.rows.length === file.rows.length
      ? incremental(origin, prev, file, acknowledged)
      : full(origin, file, [...targets], acknowledged)
  latest.set(origin.rows, next)
  return next
}
