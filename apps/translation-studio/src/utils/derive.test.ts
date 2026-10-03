import { describe, expect, it } from 'vitest'
import { cellId, type CellEdit, type Lcid } from '../types/translation'
import { createMockState, renderTranslationXml } from '../services/mockData'
import { applyEdits, parseTranslationFile } from './translationFile'
import { countStates, findGaps } from './gaps'
import { glossaryKey, suggestFromGlossary } from './glossary'
import { derive } from './derive'

const origin = parseTranslationFile(renderTranslationXml(createMockState(), 'ProFleet'))
const targets: Lcid[] = origin.languages.filter((l) => l !== origin.baseLanguage)

/** The same data the slow way, from scratch. */
function reference(edits: CellEdit[], ack: ReadonlySet<string>) {
  const file = applyEdits(origin, edits).file
  const gaps = findGaps(file, { languages: targets, acknowledged: ack })
  const suggestions = suggestFromGlossary(file, targets, ack)
  const sameBase = new Map<string, number>()
  for (const r of file.rows)
    for (const l of targets)
      if (suggestions.has(cellId(r.key, l))) {
        const k = `${glossaryKey(r.values[file.baseLanguage] ?? '')}|${l}`
        sameBase.set(k, (sameBase.get(k) ?? 0) + 1)
      }
  return { file, gaps, counts: countStates(gaps, targets), suggestions, sameBase }
}

const sorted = <V>(m: Map<string, V>) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

describe('derive (incremental)', () => {
  it('matches the full computation step by step through edits and acknowledgements', () => {
    expect(origin.rows.length).toBeGreaterThan(100)
    // Deterministic pseudo-random walk over gap cells.
    let seed = 7
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    const edits = new Map<string, CellEdit>()
    let ack = new Set<string>()
    let withSuggestions = 0
    for (let step = 0; step < 40; step++) {
      const row = origin.rows[rnd(origin.rows.length)]
      const lcid = targets[rnd(targets.length)]
      const action = rnd(4)
      if (action === 0) ack = new Set([...ack, cellId(row.key, lcid)])
      else if (action === 1 && edits.size > 0) edits.delete([...edits.keys()][rnd(edits.size)])
      else {
        // Reuse texts from elsewhere so glossary groups gain and lose translations.
        const donor = origin.rows[rnd(origin.rows.length)]
        const value = donor.values[lcid] || `T${step}`
        edits.set(cellId(row.key, lcid), { rowKey: row.key, lcid, value })
      }
      const list = [...edits.values()]
      const ref = reference(list, ack)
      const got = derive(origin, ref.file, targets, ack)
      expect(got.gaps.map((g) => g.states)).toEqual(ref.gaps.map((g) => g.states))
      expect(got.counts).toEqual(ref.counts)
      expect(sorted(got.suggestions)).toEqual(sorted(ref.suggestions))
      expect(sorted(got.sameBase)).toEqual(sorted(ref.sameBase))
      if (ref.suggestions.size > 0) withSuggestions++
    }
    // The walk must exercise the glossary, not just empty maps.
    expect(withSuggestions).toBeGreaterThan(20)
  })

  it('returns the same object for the same inputs', () => {
    const file = applyEdits(origin, []).file
    const ack = new Set<string>()
    const a = derive(origin, file, targets, ack)
    expect(derive(origin, file, [...targets], ack)).toBe(a)
  })

  it('recomputes fully when the target languages change', () => {
    const file = applyEdits(origin, []).file
    const ack = new Set<string>()
    const one = derive(origin, file, targets.slice(0, 1), ack)
    expect(Object.keys(one.counts)).toEqual([String(targets[0])])
    const both = derive(origin, file, targets, ack)
    expect(Object.keys(both.counts).length).toBe(targets.length)
  })
})
