import { describe, expect, it } from 'vitest'
import { cellTexts, mergeTranslationXml, onlyRows } from './mergeTranslations'
import { applyEdits, changesOf, parseTranslationFile, serializeTranslationFile } from './translationFile'
import fixture from '../fixtures/CrmTranslations.sample.xml?raw'

const cell = (t: string, style = 's24') => `<Cell ss:StyleID="${style}"><Data ss:Type="String">${t}</Data></Cell>`
const row = (...cells: string[]) => `<Row ss:AutoFitHeight="0">${cells.map((c, i) => cell(c, i < 3 ? 's22' : 's24')).join('')}</Row>`
const head = (...cells: string[]) => `<Row ss:AutoFitHeight="0">${cells.map((c) => cell(c, 's21')).join('')}</Row>`
const sheet = (name: string, rows: string[]) =>
  `<Worksheet ss:Name="${name}" ss:Id="${name}" ss:Protected="1"><Table><Column ss:Width="80" />${rows.join('')}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel" /></Worksheet>`

function workbook(solution: string, labels: string[][], strings: string[][] = []): string {
  const info = sheet('Information', [
    `<Row>${cell('Base language ID:', 's21')}<Cell ss:StyleID="s22"><Data ss:Type="Number">1033</Data></Cell></Row>`,
    `<Row>${cell('Solution Name:', 's21')}${cell(solution, 's22')}</Row>`,
  ])
  return (
    '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    info +
    sheet('Display Strings', [head('Entity name', 'Display String Key', '1033', '1031'), ...strings.map((r) => row(...r))]) +
    sheet('Localized Labels', [head('Entity name', 'Object ID', 'Object Column Name', '1033', '1031'), ...labels.map((r) => row(...r))]) +
    '</Workbook>'
  )
}

const labelsOf = (xml: string) => {
  const s = xml.slice(xml.indexOf('ss:Name="Localized Labels"'))
  return (s.match(/<Row\b[\s\S]*?<\/Row>/g) ?? []).slice(1).map(cellTexts)
}

describe('mergeTranslationXml', () => {
  const a = workbook('tsexport_x_0', [
    ['Solution', 's0', 'friendlyname', 'temp', 'temp'],
    ['pro_vehicle', 'v1', 'DisplayName', 'Vehicle', 'Fahrzeug'],
    ['RibbonCustomization', 'r1', 'Button.Label', 'Copy', ''],
  ], [['pro_vehicle', 'Error_1', 'Broken', 'Kaputt']])
  const b = workbook('tsexport_x_1', [
    ['Solution', 's1', 'friendlyname', 'temp', 'temp'],
    ['pro_site', 's1', 'DisplayName', 'Site', 'Standort'],
    ['RibbonCustomization', 'r1', 'Button.Label', 'Copy', ''],
    ['msdyn_dragged', 'd1', 'DisplayName', 'Dragged', ''],
  ], [['pro_vehicle', 'Error_1', 'Broken', 'Kaputt'], ['pro_site', 'Error_2', 'Gone', 'Weg']])

  it('unions the rows of all parts, each label once, filtered', () => {
    const tables = new Set(['pro_vehicle', 'pro_site', 'msdyn_dragged'])
    const own = new Set(['pro_vehicle', 'pro_site'])
    const xml = mergeTranslationXml([a, b], {
      keep: (_, [group]) => group !== 'Solution' && (!tables.has(group) || own.has(group)),
      extra: [{ group: 'appaction', objectId: 'x1', column: 'buttonlabeltext', texts: { 1033: 'Sync & go', 1031: 'Abgleichen', 1036: 'ignored' } }],
      solutionName: 'ProFleet',
    })
    expect(labelsOf(xml)).toEqual([
      ['pro_vehicle', 'v1', 'DisplayName', 'Vehicle', 'Fahrzeug'],
      ['RibbonCustomization', 'r1', 'Button.Label', 'Copy', ''],
      ['pro_site', 's1', 'DisplayName', 'Site', 'Standort'],
      ['appaction', 'x1', 'buttonlabeltext', 'Sync & go', 'Abgleichen'],
    ])
    expect(xml).toContain('<Data ss:Type="String">ProFleet</Data>')
    // The result is a file the studio reads like a single export.
    const file = parseTranslationFile(xml)
    expect(file.rows.filter((r) => r.sheet === 'Display Strings')).toHaveLength(2)
    expect(file.rows.find((r) => r.objectId === 'x1')?.original[1031]).toBe('Abgleichen')
  })

  it('refuses parts with different language columns', () => {
    const other = a.replace(/<Data ss:Type="String">1031<\/Data>/g, '<Data ss:Type="String">1036</Data>')
    expect(() => mergeTranslationXml([a, other])).toThrow(/unterschiedliche Spalten/)
  })
})

describe('onlyRows', () => {
  it('keeps only the edited rows, with the frame and the headers', () => {
    const base = parseTranslationFile(fixture)
    const target = base.rows.find((r) => r.sheet === 'Localized Labels' && r.original[1031] === '')!
    const ds = base.rows.find((r) => r.sheet === 'Display Strings')!
    const edited = applyEdits(base, [
      { rowKey: target.key, lcid: 1031, value: 'Neu' },
      { rowKey: ds.key, lcid: 1036, value: 'Nouveau' },
    ]).file
    const xml = onlyRows(serializeTranslationFile(edited), new Set(changesOf(edited).map((c) => c.rowKey)))
    const reduced = parseTranslationFile(xml)
    expect(reduced.rows.map((r) => r.key).sort()).toEqual([target.key, ds.key].sort())
    expect(reduced.rows.find((r) => r.key === target.key)!.original[1031]).toBe('Neu')
    expect(reduced.languages).toEqual(base.languages)
    expect(reduced.info).toEqual(base.info)
  })

  it('tells repeated keys apart (#2)', () => {
    const twice = workbook('s', [
      ['pro_vehicle', 'v1', 'DisplayName', 'A', 'A1'],
      ['pro_vehicle', 'v1', 'DisplayName', 'B', 'B1'],
    ])
    expect(labelsOf(onlyRows(twice, new Set(['Localized Labels|pro_vehicle|v1|DisplayName#2'])))).toEqual([['pro_vehicle', 'v1', 'DisplayName', 'B', 'B1']])
  })
})
