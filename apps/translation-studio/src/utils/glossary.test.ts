import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/CrmTranslations.sample.xml?raw'
import { applyEdits, parseTranslationFile } from './translationFile'
import { consistencyReport, glossaryKey, suggestFromGlossary } from './glossary'
import { cellId } from '../types/translation'

const file = parseTranslationFile(fixture)
const byId = (id: string) => file.rows.find((r) => r.objectId === id)!

describe('suggestFromGlossary', () => {
  it('suggests the translation of the same base text from elsewhere', () => {
    const s = suggestFromGlossary(file, [1031, 1036])
    // Name #2 has no German text; Name #1 has "Name" — but that one is "probably untranslated", so no source.
    expect(s.get(cellId(byId('b2000000-0000-4000-8000-000000000002').key, 1031))).toBeUndefined()
    expect([...s.keys()]).toEqual([])
  })

  it('learns from acknowledged and edited cells', () => {
    const name1 = byId('b2000000-0000-4000-8000-000000000001')
    const name2 = byId('b2000000-0000-4000-8000-000000000002')
    const ack = new Set([cellId(name1.key, 1031)])
    expect(suggestFromGlossary(file, [1031], ack).get(cellId(name2.key, 1031))).toEqual({ value: 'Name', count: 1, alternatives: [] })

    const inspection = file.rows.find((r) => r.original[1033] === 'Inspection')!
    const { file: edited } = applyEdits(file, [{ rowKey: name2.key, lcid: 1031, value: 'Bezeichnung' }])
    const s = suggestFromGlossary(edited, [1031, 1036], ack)
    // Name #2 is now edited (changed), so only gaps get suggestions.
    expect(s.get(cellId(name2.key, 1031))).toBeUndefined()
    expect(s.has(cellId(inspection.key, 1036))).toBe(false)
  })

  it('normalises whitespace of the base text only', () => {
    expect(glossaryKey('  Active   Vehicles ')).toBe('Active Vehicles')
  })
})

describe('consistencyReport', () => {
  it('lists base texts with several translations', () => {
    expect(consistencyReport(file, [1031, 1036])).toEqual([])
    const name2 = byId('b2000000-0000-4000-8000-000000000002')
    const { file: edited } = applyEdits(file, [{ rowKey: name2.key, lcid: 1031, value: 'Bezeichnung' }])
    const report = consistencyReport(edited, [1031, 1036])
    expect(report).toHaveLength(1)
    expect(report[0]).toMatchObject({ base: 'Name', lcid: 1031 })
    expect(report[0].variants.map((v) => v.value).sort()).toEqual(['Bezeichnung', 'Name'])
  })
})
