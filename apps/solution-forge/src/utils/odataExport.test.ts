import { describe, expect, it } from 'vitest'
import { csvField, exportFileName, toCsv, toJson } from './odataExport'

const FV = '@OData.Community.Display.V1.FormattedValue'

describe('csvField', () => {
  it('leaves a plain value alone', () => {
    expect(csvField('Contoso')).toBe('Contoso')
  })

  it('quotes on a delimiter, a quote or a line break', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line1\nline2')).toBe('"line1\nline2"')
  })

  it('honours a custom delimiter', () => {
    expect(csvField('a,b', ';')).toBe('a,b')
    expect(csvField('a;b', ';')).toBe('"a;b"')
  })
})

describe('toCsv', () => {
  const rows = [
    { name: 'Contoso', statecode: 0, [`statecode${FV}`]: 'Active' },
    { name: 'A, B "Ltd"', statecode: 1, [`statecode${FV}`]: 'Inactive' },
  ]

  it('writes a header and CRLF line endings', () => {
    const csv = toCsv(rows, ['name', 'statecode'])
    expect(csv.split('\r\n')[0]).toBe('name,statecode')
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('exports the formatted values by default', () => {
    expect(toCsv(rows, ['statecode'])).toContain('Active')
  })

  it('exports raw values when asked', () => {
    const csv = toCsv(rows, ['statecode'], { formatted: false })
    expect(csv).toContain('0')
    expect(csv).not.toContain('Active')
  })

  it('escapes a value carrying both a comma and quotes', () => {
    expect(toCsv(rows, ['name'])).toContain('"A, B ""Ltd"""')
  })

  it('handles no rows and missing keys', () => {
    expect(toCsv([], ['name'])).toBe('name')
    expect(toCsv([{ name: 'x' }], ['name', 'absent'])).toContain('x,')
  })
})

describe('toJson', () => {
  it('keeps the annotations — the raw payload is the point', () => {
    const json = toJson([{ a: 1, [`a${FV}`]: 'One' }])
    expect(json).toContain(FV)
    expect(JSON.parse(json)).toHaveLength(1)
  })
})

describe('exportFileName', () => {
  it('stamps the date and keeps the name filesystem-safe', () => {
    expect(exportFileName('account', 'csv', new Date('2026-07-29T10:00:00Z'))).toBe(
      'account-2026-07-29.csv',
    )
    expect(
      exportFileName('EntityDefinitions/x', 'json', new Date('2026-01-02T00:00:00Z')),
    ).toBe('EntityDefinitions_x-2026-01-02.json')
  })

  it('falls back when the table is unknown', () => {
    expect(exportFileName('', 'csv', new Date('2026-07-29T00:00:00Z'))).toBe(
      'result-2026-07-29.csv',
    )
  })
})
