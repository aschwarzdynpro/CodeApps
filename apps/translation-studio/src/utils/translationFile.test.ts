// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/CrmTranslations.sample.xml?raw'
import { applyEdits, changesOf, MAX_LABEL_LENGTH, parseTranslationFile, serializeTranslationFile } from './translationFile'
import type { TranslationFile } from '../types/translation'

const ws = (s: string) => s.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
const key = (file: TranslationFile, objectId: string, column: string) =>
  file.rows.find((r) => r.objectId === objectId && r.column === column)!.key
const wellFormed = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror').length === 0

const VEHICLE = 'a1000000-0000-4000-8000-000000000001'
const NAME_2 = 'b2000000-0000-4000-8000-000000000002'
const STATUS = 'b2000000-0000-4000-8000-000000000003'
const MILEAGE = 'b2000000-0000-4000-8000-000000000004'
const RETIRED = 'c3000000-0000-4000-8000-000000000002'

describe('parseTranslationFile', () => {
  const file = parseTranslationFile(fixture)

  it('reads languages, base language and information', () => {
    expect(file.baseLanguage).toBe(1033)
    expect(file.languages).toEqual([1033, 1031, 1036])
    expect(file.info).toContainEqual({ label: 'Organization Name', value: 'Fixture Org' })
    expect(file.sheets.map((s) => s.name)).toEqual(['Display Strings', 'Localized Labels'])
    expect(file.sheets[1].keyColumns).toEqual(['Entity Name', 'Object Id', 'Object Column Name'])
  })

  it('reads labels with kind, id and texts, honouring sparse cells', () => {
    const labels = file.rows.filter((r) => r.sheet === 'Localized Labels')
    expect(labels).toHaveLength(12)
    const vehicle = labels[0]
    expect(vehicle).toMatchObject({ type: 'Entity', objectId: VEHICLE, column: 'LocalizedName', kind: 'table' })
    expect(vehicle.original).toEqual({ 1033: 'Vehicle', 1031: 'Fahrzeug', 1036: 'Véhicule' })
    // <Cell ss:Index="6"> skips the German column.
    expect(file.rows.find((r) => r.objectId === NAME_2)!.original).toEqual({ 1033: 'Name', 1031: '', 1036: 'Nom' })
    expect(file.rows.find((r) => r.objectId === RETIRED)!.kind).toBe('choice')
    expect(labels.map((r) => r.kind)).toEqual(expect.arrayContaining(['form', 'view', 'column']))
  })

  it('decodes entities and line breaks', () => {
    const desc = file.rows.find((r) => r.objectId === STATUS && r.column === 'Description')!
    expect(desc.original[1033]).toBe('Status & condition of the vehicle\n(<internal>)')
    expect(desc.original[1031]).toBe('')
  })

  it('keys display strings by their key column', () => {
    const archive = file.rows.find((r) => r.keys[0] === 'pro_Ribbon.Archive')!
    expect(archive.key).toBe('Display Strings|pro_Ribbon.Archive')
    expect(archive.original).toEqual({ 1033: 'Archive', 1031: '', 1036: '' })
  })

  it('takes the base language from the organization when given', () => {
    expect(parseTranslationFile(fixture, { baseLanguage: 1031 }).languages).toEqual([1031, 1033, 1036])
  })

  it('a file with only the base language has no target languages', () => {
    const single = fixture.replace(/<Cell[^>]*><Data ss:Type="String">(1031|1036)<\/Data><\/Cell>/g, '')
    const file = parseTranslationFile(single)
    expect(file.languages).toEqual([1033])
    expect(file.rows.every((r) => Object.keys(r.original).join() === '1033')).toBe(true)
  })

  it('rejects text that is not a workbook', () => {
    expect(() => parseTranslationFile('<html></html>')).toThrow(/SpreadsheetML/)
  })
})

describe('serializeTranslationFile', () => {
  it('roundtrip: without edits the export comes back byte for byte', () => {
    const file = parseTranslationFile(fixture)
    expect(serializeTranslationFile(file)).toBe(fixture)
    expect(ws(serializeTranslationFile(applyEdits(file, []).file))).toBe(ws(fixture))
  })

  it('writes edits into existing, empty, self-closing and missing cells', () => {
    const file = parseTranslationFile(fixture)
    const edits = [
      { rowKey: key(file, VEHICLE, 'LocalizedCollectionName'), lcid: 1036, value: 'Véhicules' }, // empty <Data>
      { rowKey: key(file, NAME_2, 'DisplayName'), lcid: 1031, value: 'Name' }, // gap before ss:Index cell
      { rowKey: key(file, STATUS, 'Description'), lcid: 1031, value: 'Zustand & Lage\n<intern>' }, // <Cell/>
      { rowKey: key(file, STATUS, 'Description'), lcid: 1036, value: 'État' }, // <Cell/>
      { rowKey: key(file, MILEAGE, 'DisplayName'), lcid: 1036, value: 'Kilométrage' }, // no cell, after a gap
      { rowKey: key(file, MILEAGE, 'DisplayName'), lcid: 1031, value: 'Kilometerstand' },
      { rowKey: key(file, RETIRED, 'DisplayName'), lcid: 1031, value: 'Ausgemustert' }, // existing text
      { rowKey: key(file, RETIRED, 'DisplayName'), lcid: 1036, value: 'Retiré' }, // <Cell ss:Index="6"/>
      { rowKey: 'Display Strings|pro_Ribbon.Archive', lcid: 1036, value: 'Archiver' },
    ]
    const { file: edited, changes, skipped } = applyEdits(file, edits)
    expect(skipped).toEqual([])
    expect(changes).toHaveLength(edits.length)

    const xml = serializeTranslationFile(edited)
    expect(wellFormed(xml)).toBe(true)
    expect(xml).toContain('Zustand &amp; Lage&#10;&lt;intern&gt;')

    const reread = parseTranslationFile(xml)
    for (const e of edits) expect(reread.rows.find((r) => r.key === e.rowKey)!.original[e.lcid]).toBe(e.value)
    // Everything else is unchanged.
    const touched = new Set(edits.map((e) => e.rowKey))
    for (const r of reread.rows) {
      const before = file.rows.find((x) => x.key === r.key)!
      if (!touched.has(r.key)) expect(r.original).toEqual(before.original)
      expect(r.original[1033]).toBe(before.original[1033])
    }
    expect(reread.rows.map((r) => r.key)).toEqual(file.rows.map((r) => r.key))
    // Applying the same edits to the re-read file is no change at all.
    expect(applyEdits(reread, edits).changes).toEqual([])
  })

  it('leaves untouched rows verbatim', () => {
    const file = parseTranslationFile(fixture)
    const { file: edited } = applyEdits(file, [{ rowKey: key(file, MILEAGE, 'DisplayName'), lcid: 1031, value: 'Kilometerstand' }])
    const xml = serializeTranslationFile(edited)
    const vehicleRow = fixture.split('\n').find((l) => l.includes('LocalizedCollectionName'))!
    expect(xml).toContain(vehicleRow)
    expect(xml.length - fixture.length).toBe('<Cell><Data ss:Type="String">Kilometerstand</Data></Cell>'.length)
  })
})

describe('applyEdits guards', () => {
  const file = parseTranslationFile(fixture)
  const k = key(file, VEHICLE, 'LocalizedName')

  it('never writes the base language', () => {
    const r = applyEdits(file, [{ rowKey: k, lcid: 1033, value: 'Car' }])
    expect(r.changes).toEqual([])
    expect(r.skipped[0].reason).toMatch(/Basissprache/)
  })

  it('refuses unknown rows, unknown languages, clearing and over-long text', () => {
    const r = applyEdits(file, [
      { rowKey: 'nope', lcid: 1031, value: 'x' },
      { rowKey: k, lcid: 1040, value: 'Veicolo' },
      { rowKey: k, lcid: 1031, value: '  ' },
      { rowKey: k, lcid: 1036, value: 'x'.repeat(MAX_LABEL_LENGTH + 1) },
    ])
    expect(r.changes).toEqual([])
    expect(r.skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/gibt es/),
      expect.stringMatching(/keine Spalte/),
      expect.stringMatching(/leeren/),
      expect.stringMatching(/500/),
    ])
  })

  it('last edit wins; an edit back to the export is no change', () => {
    const r = applyEdits(file, [
      { rowKey: k, lcid: 1031, value: 'Auto' },
      { rowKey: k, lcid: 1031, value: 'Kfz' },
      { rowKey: k, lcid: 1036, value: 'Voiture' },
      { rowKey: k, lcid: 1036, value: 'Véhicule' },
    ])
    expect(r.changes).toEqual([{ rowKey: k, lcid: 1031, before: 'Fahrzeug', after: 'Kfz' }])
    expect(changesOf(r.file)).toEqual(r.changes)
  })
})
