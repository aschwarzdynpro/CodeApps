import { describe, expect, it } from 'vitest'
import {
  cellValue,
  dataKeys,
  isAnnotationKey,
  lookupTarget,
  rawText,
} from './odataFormat'

const FV = '@OData.Community.Display.V1.FormattedValue'
const LLN = '@Microsoft.Dynamics.CRM.lookuplogicalname'

describe('isAnnotationKey', () => {
  it('recognises value annotations and control keys', () => {
    expect(isAnnotationKey(`statecode${FV}`)).toBe(true)
    expect(isAnnotationKey('@odata.etag')).toBe(true)
    expect(isAnnotationKey('statecode')).toBe(false)
    expect(isAnnotationKey('_ownerid_value')).toBe(false)
  })
})

describe('dataKeys', () => {
  it('keeps first-seen order and drops annotations', () => {
    const rows = [
      { name: 'A', [`statecode${FV}`]: 'Active', statecode: 0 },
      { '@odata.etag': 'W/"1"', name: 'B', revenue: 10 },
    ]
    expect(dataKeys(rows)).toEqual(['name', 'statecode', 'revenue'])
  })

  it('picks up columns that only later rows carry — Dataverse omits nulls', () => {
    const rows = [{ name: 'A' }, { name: 'B', description: 'x' }]
    expect(dataKeys(rows)).toEqual(['name', 'description'])
  })

  it('is empty for no rows', () => {
    expect(dataKeys([])).toEqual([])
  })
})

describe('cellValue', () => {
  it('prefers the formatted annotation over the raw code', () => {
    const cell = cellValue({ statecode: 0, [`statecode${FV}`]: 'Active' }, 'statecode')
    expect(cell).toEqual({
      text: 'Active',
      raw: 0,
      formatted: true,
      empty: false,
    })
  })

  it('falls back to the raw value when there is no annotation', () => {
    expect(cellValue({ revenue: 4200 }, 'revenue')).toEqual({
      text: '4200',
      raw: 4200,
      formatted: false,
      empty: false,
    })
  })

  it('flags null, undefined and empty string as empty', () => {
    expect(cellValue({ description: null }, 'description').empty).toBe(true)
    expect(cellValue({}, 'description').empty).toBe(true)
    expect(cellValue({ description: '' }, 'description').empty).toBe(true)
  })

  it('does not treat 0 or false as empty', () => {
    expect(cellValue({ statecode: 0 }, 'statecode').empty).toBe(false)
    expect(cellValue({ flag: false }, 'flag')).toMatchObject({
      text: 'false',
      empty: false,
    })
  })

  it('ignores a blank annotation', () => {
    const cell = cellValue({ name: 'X', [`name${FV}`]: '' }, 'name')
    expect(cell.formatted).toBe(false)
    expect(cell.text).toBe('X')
  })
})

describe('rawText', () => {
  it('stringifies scalars and JSON, and renders nullish as empty', () => {
    expect(rawText(null)).toBe('')
    expect(rawText(undefined)).toBe('')
    expect(rawText('x')).toBe('x')
    expect(rawText(3)).toBe('3')
    expect(rawText(true)).toBe('true')
    expect(rawText({ a: 1 })).toBe('{"a":1}')
  })

  it('survives a cyclic value instead of throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => rawText(cyclic)).not.toThrow()
  })
})

describe('lookupTarget', () => {
  it('reads the target table off the row, not the metadata', () => {
    const row = {
      _primarycontactid_value: 'abc',
      [`_primarycontactid_value${LLN}`]: 'contact',
    }
    expect(lookupTarget(row, '_primarycontactid_value')).toBe('contact')
  })

  it('is null for non-lookup columns', () => {
    expect(lookupTarget({ name: 'A' }, 'name')).toBeNull()
  })
})
