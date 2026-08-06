import { describe, expect, it } from 'vitest'
import type { EntityRef, RawAttribute } from '../types/odataBrowser'
import { classifyColumn } from './odataQuery'
import {
  fieldsOfGroup,
  filterRecordFields,
  groupRecordFields,
  recordId,
  recordLabel,
} from './odataRecord'

function attribute(
  logicalName: string,
  attributeType = 'String',
  displayName = logicalName,
  extra: Partial<RawAttribute> = {},
): RawAttribute {
  return {
    logicalName,
    displayName,
    attributeType,
    attributeTypeName: '',
    attributeOf: null,
    isValidForRead: true,
    isValidForCreate: true,
    isValidForUpdate: true,
    isValidForAdvancedFind: true,
    isPrimaryId: false,
    isPrimaryName: false,
    ...extra,
  }
}

const REF: EntityRef = {
  logicalName: 'account',
  schemaName: 'Account',
  entitySet: 'accounts',
  displayName: 'Account',
  displayCollectionName: 'Accounts',
  primaryIdAttribute: 'accountid',
  primaryNameAttribute: 'name',
  objectTypeCode: 1,
  isPrivate: false,
  isActivity: false,
  isCustomEntity: false,
  isManaged: true,
}

const COLUMNS = [
  attribute('accountid', 'Uniqueidentifier', 'Account', { isPrimaryId: true }),
  attribute('name', 'String', 'Account Name', { isPrimaryName: true }),
  attribute('revenue', 'Money', 'Annual Revenue'),
  attribute('primarycontactid', 'Lookup', 'Primary Contact'),
  attribute('createdon', 'DateTime', 'Created On'),
  attribute('ownerid', 'Owner', 'Owner'),
].map(classifyColumn)

const ROW = {
  accountid: '11111111-1111-1111-1111-111111111101',
  name: 'Contoso',
  revenue: 4200,
  'revenue@OData.Community.Display.V1.FormattedValue': '€4,200.00',
  _primarycontactid_value: '22222222-2222-2222-2222-222222222201',
  '_primarycontactid_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'contact',
  createdon: '2024-03-11T09:12:00Z',
  _ownerid_value: '33333333-3333-3333-3333-333333333301',
  statecode: 0,
  description: null,
  '@odata.etag': 'W/"1234"',
}

describe('groupRecordFields', () => {
  const fields = groupRecordFields(ROW, COLUMNS, REF)
  const keysOf = (group: Parameters<typeof fieldsOfGroup>[1]) =>
    fieldsOfGroup(fields, group).map((f) => f.key)

  it('drops annotation and control keys', () => {
    expect(fields.map((f) => f.key)).not.toContain('@odata.etag')
    expect(
      fields.map((f) => f.key).some((k) => k.includes('@')),
    ).toBe(false)
  })

  it('puts the primary id and name into Identity', () => {
    expect(keysOf('identity').sort()).toEqual(['accountid', 'name'])
  })

  it('groups lookups by their _value key', () => {
    expect(keysOf('lookups')).toContain('_primarycontactid_value')
  })

  it('treats ownership, audit stamps and state as System', () => {
    const system = keysOf('system')
    expect(system).toContain('createdon')
    expect(system).toContain('_ownerid_value')
    expect(system).toContain('statecode')
  })

  it('leaves the business columns in Data', () => {
    expect(keysOf('data')).toContain('revenue')
  })

  it('uses display names and keeps the raw key', () => {
    const revenue = fields.find((f) => f.key === 'revenue')
    expect(revenue?.label).toBe('Annual Revenue')
    expect(revenue?.logicalName).toBe('revenue')
  })

  it('flags empty values', () => {
    expect(fields.find((f) => f.key === 'description')?.empty).toBe(true)
    expect(fields.find((f) => f.key === 'revenue')?.empty).toBe(false)
  })

  it('shows a column the metadata does not know, rather than hiding it', () => {
    // A stale schema cache must not make data disappear from the panel.
    const field = fields.find((f) => f.key === 'description')
    expect(field).toBeDefined()
    expect(field?.column).toBeNull()
    expect(field?.label).toBe('description')
  })

  it('still recognises a lookup without metadata, by its key shape', () => {
    const fromRowOnly = groupRecordFields(
      { _somelookup_value: 'x' },
      [],
      REF,
    )
    expect(fromRowOnly[0].group).toBe('lookups')
    expect(fromRowOnly[0].logicalName).toBe('somelookup')
  })

  it('orders groups identity → data → lookups → system', () => {
    const order = fields.map((f) => f.group)
    const firstOf = (g: string) => order.indexOf(g as never)
    expect(firstOf('identity')).toBeLessThan(firstOf('data'))
    expect(firstOf('data')).toBeLessThan(firstOf('lookups'))
    expect(firstOf('lookups')).toBeLessThan(firstOf('system'))
  })

  it('copes with no metadata and no ref at all', () => {
    expect(() => groupRecordFields(ROW, [], null)).not.toThrow()
  })
})

describe('filterRecordFields', () => {
  const fields = groupRecordFields(ROW, COLUMNS, REF)
  const keys = (search: string) =>
    filterRecordFields(fields, ROW, search).map((f) => f.key)

  it('returns everything for an empty or blank search', () => {
    expect(filterRecordFields(fields, ROW, '')).toHaveLength(fields.length)
    expect(filterRecordFields(fields, ROW, '   ')).toHaveLength(fields.length)
  })

  it('matches the display name, case-insensitively', () => {
    expect(keys('annual')).toEqual(['revenue'])
  })

  it('matches the row key with its lookup decoration', () => {
    expect(keys('_primarycontactid_value')).toEqual(['_primarycontactid_value'])
  })

  it('matches the base logical name without the decoration', () => {
    // Nobody types the underscores when looking for a lookup.
    expect(keys('primarycontactid')).toEqual(['_primarycontactid_value'])
  })

  it('matches a plain value', () => {
    expect(keys('contoso')).toEqual(['name'])
  })

  it('matches the formatted value', () => {
    // '€4,200.00' is what the panel shows for revenue.
    expect(keys('€4,200')).toEqual(['revenue'])
  })

  it('matches the raw value behind a formatted one', () => {
    // The formatted text is '€4,200.00' — the comma means it does NOT contain
    // '4200'. Only the raw 4200 does, which is the whole point of matching both.
    expect(keys('4200')).toEqual(['revenue'])
  })

  it('finds a field that has no value at all by its name', () => {
    expect(keys('description')).toEqual(['description'])
  })

  it('returns nothing when neither name nor value matches', () => {
    expect(keys('zzz-not-here')).toEqual([])
  })

  it('keeps a term containing spaces intact', () => {
    // 'Annual Revenue' is the display name, so the term matches as a substring.
    expect(keys('annual revenue')).toEqual(['revenue'])
  })

  it('does not split the term into words', () => {
    // Reversed, both words are still in 'Annual Revenue' — an implementation
    // that split on spaces and ANDed the parts would match here. Substring
    // does not, which is the behaviour anyone pasting a value expects.
    expect(keys('revenue annual')).toEqual([])
  })
})

describe('recordLabel / recordId', () => {
  it('prefers the primary name', () => {
    expect(recordLabel(ROW, REF)).toBe('Contoso')
  })

  it('falls back to the id when the name is missing', () => {
    expect(recordLabel({ accountid: 'abc' }, REF)).toBe('abc')
  })

  it('degrades gracefully without a ref', () => {
    expect(recordLabel(ROW, null)).toBe('(record)')
    expect(recordId(ROW, null)).toBeNull()
  })

  it('reads the primary id', () => {
    expect(recordId(ROW, REF)).toBe('11111111-1111-1111-1111-111111111101')
    expect(recordId({}, REF)).toBeNull()
  })
})
