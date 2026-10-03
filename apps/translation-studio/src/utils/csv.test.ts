import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/CrmTranslations.sample.xml?raw'
import { parseTranslationFile } from './translationFile'
import { csvToEdits, exportCsv, KEY_HEADER, parseCsv } from './csv'

const file = parseTranslationFile(fixture)

describe('csv', () => {
  it('exports chosen rows with key, base and target columns', () => {
    const csv = exportCsv(file, file.rows.slice(0, 3), { languages: [1033, 1031, 1036] })
    expect(csv.startsWith('﻿')).toBe(true)
    const rows = parseCsv(csv)
    expect(rows[0]).toEqual([KEY_HEADER, 'Blatt', 'Typ', 'Objekt-ID', 'Spalte', 'Tabelle', '1033 Basis (nicht ändern)', '1031 Deutsch', '1036 Französisch'])
    expect(rows).toHaveLength(4)
    expect(rows[1][0]).toBe(file.rows[0].key)
  })

  it('quotes delimiters, quotes and line breaks; guards formulas', () => {
    const rows = parseCsv(exportCsv(file, file.rows, { languages: [1031] }))
    const desc = rows.find((r) => r[4] === 'Description')!
    expect(desc[6]).toBe('Status & condition of the vehicle\n(<internal>)')
    const p = parseCsv('a;b\r\n"x;y";"he said ""hi"""\r\n\'=1+1;z\r\n')
    expect(p).toEqual([['a', 'b'], ['x;y', 'he said "hi"'], ["'=1+1", 'z']])
  })

  it('reads a filled export back as edits', () => {
    const rows = parseCsv(exportCsv(file, file.rows, { languages: [1031, 1036] }))
    const name2 = rows.findIndex((r) => r[0].includes('b2000000-0000-4000-8000-000000000002'))
    rows[name2][7] = 'Name'
    const mileage = rows.findIndex((r) => r[0].includes('b2000000-0000-4000-8000-000000000004'))
    rows[mileage][8] = '=Kilométrage'
    rows[mileage][6] = 'Odometer' // base changes are ignored
    rows.push(['unknown|key', '', '', '', '', '', 'x', 'y', 'z'])
    const text = rows.map((r) => r.map((f) => (/[;"\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(';')).join('\n')
    const res = csvToEdits(text, file)
    expect(res.edits).toEqual([
      { rowKey: file.rows.find((r) => r.objectId === 'b2000000-0000-4000-8000-000000000002')!.key, lcid: 1031, value: 'Name' },
      { rowKey: file.rows.find((r) => r.objectId === 'b2000000-0000-4000-8000-000000000004')!.key, lcid: 1036, value: '=Kilométrage' },
    ])
    expect(res.languages).toEqual([1031, 1036])
    expect(res.issues).toEqual([expect.stringMatching(/unbekanntem Schlüssel/), expect.stringMatching(/Basissprache/)])
  })

  it('strips the formula guard and accepts comma files', () => {
    const csv = exportCsv(file, file.rows, { languages: [1031], delimiter: ',' })
    expect(csvToEdits(csv, file).edits).toEqual([])
    const res = csvToEdits(`${KEY_HEADER},1031\r\n"${file.rows[0].key}",'=Fahrzeug`, file)
    expect(res.edits).toEqual([{ rowKey: file.rows[0].key, lcid: 1031, value: '=Fahrzeug' }])
  })

  it('explains a file without key column or languages', () => {
    expect(csvToEdits('a;b\r\n1;2', file).issues[0]).toMatch(KEY_HEADER)
    expect(csvToEdits(`${KEY_HEADER};1040\r\nx;y`, file).issues.slice(0, 2)).toEqual([expect.stringMatching(/1040/), expect.stringMatching(/Keine Spalte/)])
  })
})
