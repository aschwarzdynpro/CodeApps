import { cellId, type Lcid, type TranslationFile } from '../types/translation'
import { cellState } from './gaps'

/**
 * Glossary from the file itself: the same base text is already translated
 * somewhere else → offer that translation for every gap with this base text.
 * Matching is on the trimmed base text with collapsed whitespace, case
 * sensitive ("Name" and "name" are different labels).
 */

export interface Suggestion {
  value: string
  /** How many labels use this translation. */
  count: number
  /** Other translations of the same base text, most used first. */
  alternatives: { value: string; count: number }[]
}

export const glossaryKey = (base: string): string => base.trim().replace(/\s+/g, ' ')

type Glossary = Map<string, Map<Lcid, Map<string, number>>>

/** Translations per base text and language, from cells that count as translated. */
export function buildGlossary(file: TranslationFile, languages: Lcid[], acknowledged: ReadonlySet<string> = new Set()): Glossary {
  const g: Glossary = new Map()
  for (const row of file.rows) {
    const base = glossaryKey(row.values[file.baseLanguage] ?? '')
    if (!base) continue
    for (const lcid of languages) {
      if (lcid === file.baseLanguage || !(lcid in row.original)) continue
      const state = cellState(row, lcid, file.baseLanguage, acknowledged)
      if (state !== 'ok' && state !== 'changed') continue
      const text = row.values[lcid]
      if (!text || !text.trim()) continue
      let byLang = g.get(base)
      if (!byLang) g.set(base, (byLang = new Map()))
      let counts = byLang.get(lcid)
      if (!counts) byLang.set(lcid, (counts = new Map()))
      counts.set(text, (counts.get(text) ?? 0) + 1)
    }
  }
  return g
}

function ranked(counts: Map<string, number>): { value: string; count: number }[] {
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** Suggestions for missing and probably-untranslated cells, keyed by {@link cellId}. */
export function suggestFromGlossary(
  file: TranslationFile,
  languages: Lcid[],
  acknowledged: ReadonlySet<string> = new Set(),
): Map<string, Suggestion> {
  const g = buildGlossary(file, languages, acknowledged)
  const out = new Map<string, Suggestion>()
  for (const row of file.rows) {
    const byLang = g.get(glossaryKey(row.values[file.baseLanguage] ?? ''))
    if (!byLang) continue
    for (const lcid of languages) {
      if (lcid === file.baseLanguage || !(lcid in row.original)) continue
      const state = cellState(row, lcid, file.baseLanguage, acknowledged)
      if (state !== 'missing' && state !== 'untranslated') continue
      const counts = byLang.get(lcid)
      if (!counts) continue
      const [best, ...rest] = ranked(counts).filter((c) => c.value !== row.values[lcid])
      if (best) out.set(cellId(row.key, lcid), { value: best.value, count: best.count, alternatives: rest })
    }
  }
  return out
}

export interface Inconsistency {
  base: string
  lcid: Lcid
  /** Distinct translations, most used first, with the labels using them. */
  variants: { value: string; count: number; rowKeys: string[] }[]
}

/** Same base text, different translations in one language. */
export function consistencyReport(file: TranslationFile, languages: Lcid[]): Inconsistency[] {
  const map = new Map<string, Map<string, string[]>>()
  for (const row of file.rows) {
    const base = glossaryKey(row.values[file.baseLanguage] ?? '')
    if (!base) continue
    for (const lcid of languages) {
      if (lcid === file.baseLanguage) continue
      const text = (row.values[lcid] ?? '').trim()
      if (!text) continue
      const k = `${lcid}\u0001${base}`
      let variants = map.get(k)
      if (!variants) map.set(k, (variants = new Map()))
      const list = variants.get(text) ?? []
      list.push(row.key)
      variants.set(text, list)
    }
  }
  const out: Inconsistency[] = []
  for (const [k, variants] of map) {
    if (variants.size < 2) continue
    const [lcid, base] = k.split('\u0001')
    out.push({
      base,
      lcid: Number(lcid),
      variants: [...variants]
        .map(([value, rowKeys]) => ({ value, count: rowKeys.length, rowKeys }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    })
  }
  return out.sort((a, b) => a.lcid - b.lcid || a.base.localeCompare(b.base))
}

