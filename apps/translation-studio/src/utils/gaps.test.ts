import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/CrmTranslations.sample.xml?raw'
import { applyEdits, parseTranslationFile } from './translationFile'
import { countStates, filterRows, findGaps, looksUntranslated, NO_TABLE, type MatrixFilter } from './gaps'
import { cellId } from '../types/translation'

const file = parseTranslationFile(fixture)
const row = (id: string, column = 'DisplayName') => file.rows.find((r) => r.objectId.startsWith(id) && r.column === column)!
const all: MatrixFilter = { state: 'all', kinds: null, table: '', text: '', languages: [1031, 1036] }

describe('findGaps', () => {
  it('marks missing, probably untranslated and ok cells', () => {
    const gaps = findGaps(file)
    const states = (key: string) => gaps.find((g) => g.row.key === key)!.states
    expect(states(row('a1000000-0000-4000-8000-000000000001', 'LocalizedName').key)).toEqual({ 1031: 'ok', 1036: 'ok' })
    expect(states(row('b2000000-0000-4000-8000-000000000002').key)).toEqual({ 1031: 'missing', 1036: 'ok' })
    // "Status" in German equals the base text: a marker, not an error.
    expect(states(row('b2000000-0000-4000-8000-000000000003').key)).toEqual({ 1031: 'untranslated', 1036: 'ok' })
    // "Inspection" is also French — same heuristic.
    expect(states(row('a1000000-0000-4000-8000-000000000002', 'LocalizedName').key)[1036]).toBe('untranslated')
  })

  it('acknowledged cells count as ok, edited cells as changed', () => {
    const status = row('b2000000-0000-4000-8000-000000000003')
    const mileage = row('b2000000-0000-4000-8000-000000000004')
    const { file: edited } = applyEdits(file, [{ rowKey: mileage.key, lcid: 1031, value: 'Kilometerstand' }])
    const gaps = findGaps(edited, { acknowledged: new Set([cellId(status.key, 1031)]) })
    expect(gaps.find((g) => g.row.key === status.key)!.states[1031]).toBe('ok')
    expect(gaps.find((g) => g.row.key === mileage.key)!.states).toEqual({ 1031: 'changed', 1036: 'missing' })
  })

  it('counts per language', () => {
    const counts = countStates(findGaps(file), [1031, 1036])
    expect(counts[1031]).toEqual({ missing: 4, untranslated: 3, changed: 0, ok: 7 })
    expect(counts[1036].missing).toBe(6)
    const total = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0)
    expect(total(counts[1031])).toBe(file.rows.length)
  })

  it('heuristic needs a letter', () => {
    expect(looksUntranslated('Status', ' Status ')).toBe(true)
    expect(looksUntranslated('2024', '2024')).toBe(false)
    expect(looksUntranslated('Name', 'Nom')).toBe(false)
  })
})

describe('filterRows', () => {
  const gaps = findGaps(file)
  it('filters by state over the chosen languages', () => {
    expect(filterRows(gaps, { ...all, state: 'missing', languages: [1031] })).toHaveLength(4)
    expect(filterRows(gaps, { ...all, state: 'gaps' }).length).toBeGreaterThan(filterRows(gaps, { ...all, state: 'missing' }).length)
    expect(filterRows(gaps, { ...all, state: 'changed' })).toEqual([])
  })

  it('filters by kind, table and text', () => {
    expect(filterRows(gaps, { ...all, kinds: new Set(['choice']) }).map((g) => g.row.type)).toEqual(['AttributePicklistValue', 'AttributePicklistValue'])
    const components = new Map([['b2000000-0000-4000-8000-000000000004', { table: 'pro_vehicle', name: 'pro_mileage' }]])
    expect(filterRows(gaps, { ...all, table: 'pro_vehicle' }, components)).toHaveLength(1)
    expect(filterRows(gaps, { ...all, table: NO_TABLE }, components)).toHaveLength(file.rows.length - 1)
    expect(filterRows(gaps, { ...all, text: 'pro_mileage' }, components)).toHaveLength(1)
    expect(filterRows(gaps, { ...all, text: 'aktive fahrz' })).toHaveLength(1)
  })
})
