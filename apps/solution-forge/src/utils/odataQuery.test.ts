import { describe, expect, it } from 'vitest'
import type { EntityMeta, RawAttribute } from '../types/odataBrowser'
import {
  classifyColumn,
  clampTop,
  defaultSelect,
  emptyQuery,
  preferHeader,
  renderQueryOptions,
  skipTokenFrom,
  sortColumns,
  toQueryPath,
  toWebApiUrl,
} from './odataQuery'

function raw(overrides: Partial<RawAttribute> = {}): RawAttribute {
  return {
    logicalName: 'name',
    displayName: 'Name',
    attributeType: 'String',
    attributeTypeName: 'StringType',
    attributeOf: null,
    isValidForRead: true,
    isValidForCreate: true,
    isValidForUpdate: true,
    isValidForAdvancedFind: true,
    isPrimaryId: false,
    isPrimaryName: false,
    ...overrides,
  }
}

describe('classifyColumn', () => {
  it('selects a plain string column by its logical name', () => {
    const col = classifyColumn(raw())
    expect(col.selectable).toBe(true)
    expect(col.selectName).toBe('name')
    expect(col.kind).toBe('string')
  })

  it('selects lookups as _x_value, not by the navigation name', () => {
    const col = classifyColumn(
      raw({ logicalName: 'primarycontactid', attributeType: 'Lookup' }),
    )
    expect(col.kind).toBe('lookup')
    expect(col.selectName).toBe('_primarycontactid_value')
  })

  it.each(['Customer', 'Owner'])('treats %s as a lookup too', (type) => {
    const col = classifyColumn(raw({ logicalName: 'ownerid', attributeType: type }))
    expect(col.kind).toBe('lookup')
    expect(col.selectName).toBe('_ownerid_value')
  })

  it('blocks derived siblings — $select rejects them', () => {
    const col = classifyColumn(
      raw({ logicalName: 'revenue_base', attributeOf: 'revenue' }),
    )
    expect(col.selectable).toBe(false)
    expect(col.selectName).toBe('')
    expect(col.unselectableReason).toContain('revenue')
  })

  it('blocks unreadable, party-list, file and image columns', () => {
    expect(classifyColumn(raw({ isValidForRead: false })).selectable).toBe(false)
    expect(
      classifyColumn(raw({ attributeType: 'PartyList' })).selectable,
    ).toBe(false)
    expect(
      classifyColumn(
        raw({ attributeType: 'Virtual', attributeTypeName: 'FileType' }),
      ).selectable,
    ).toBe(false)
    expect(
      classifyColumn(
        raw({ attributeType: 'Virtual', attributeTypeName: 'ImageType' }),
      ).selectable,
    ).toBe(false)
  })

  it('keeps multi-select choices selectable despite AttributeType "Virtual"', () => {
    const col = classifyColumn(
      raw({
        logicalName: 'pro_areas',
        attributeType: 'Virtual',
        attributeTypeName: 'MultiSelectPicklistType',
      }),
    )
    expect(col.selectable).toBe(true)
    expect(col.kind).toBe('multichoice')
    expect(col.selectName).toBe('pro_areas')
  })

  it('blocks the remaining virtual attributes', () => {
    const col = classifyColumn(
      raw({ attributeType: 'Virtual', attributeTypeName: 'VirtualType' }),
    )
    expect(col.selectable).toBe(false)
    expect(col.unselectableReason).toBe('virtual attribute')
  })

  it.each([
    ['Integer', 'number'],
    ['Double', 'number'],
    ['BigInt', 'number'],
    ['Money', 'money'],
    ['Boolean', 'boolean'],
    ['DateTime', 'datetime'],
    ['Picklist', 'choice'],
    ['State', 'choice'],
    ['Status', 'choice'],
    ['Uniqueidentifier', 'guid'],
    ['Memo', 'string'],
    ['ManagedProperty', 'other'],
  ])('maps %s to kind %s', (attributeType, kind) => {
    expect(classifyColumn(raw({ attributeType })).kind).toBe(kind)
  })
})

describe('sortColumns', () => {
  it('puts selectable columns first, then id and name', () => {
    const columns = [
      classifyColumn(raw({ logicalName: 'zzz', displayName: 'Zzz' })),
      classifyColumn(raw({ logicalName: 'blocked', isValidForRead: false })),
      classifyColumn(
        raw({ logicalName: 'name', displayName: 'Name', isPrimaryName: true }),
      ),
      classifyColumn(
        raw({
          logicalName: 'accountid',
          displayName: 'Account',
          attributeType: 'Uniqueidentifier',
          isPrimaryId: true,
        }),
      ),
    ]
    expect(sortColumns(columns).map((c) => c.logicalName)).toEqual([
      'accountid',
      'name',
      'zzz',
      'blocked',
    ])
  })
})

describe('defaultSelect', () => {
  const meta: EntityMeta = {
    ref: {
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
    },
    columns: [
      classifyColumn(
        raw({
          logicalName: 'accountid',
          attributeType: 'Uniqueidentifier',
          isPrimaryId: true,
        }),
      ),
      classifyColumn(raw({ logicalName: 'name', isPrimaryName: true })),
      classifyColumn(raw({ logicalName: 'createdon', attributeType: 'DateTime' })),
      classifyColumn(raw({ logicalName: 'ownerid', attributeType: 'Owner' })),
      classifyColumn(raw({ logicalName: 'unrelated' })),
    ],
  }

  it('picks id, name and the usual system columns — lookups as _value', () => {
    expect(defaultSelect(meta)).toEqual([
      'accountid',
      'name',
      'createdon',
      '_ownerid_value',
    ])
  })

  it('skips columns the table does not have', () => {
    const slim: EntityMeta = { ...meta, columns: meta.columns.slice(0, 2) }
    expect(defaultSelect(slim)).toEqual(['accountid', 'name'])
  })
})

describe('emptyQuery', () => {
  it('starts without $top so paging can work', () => {
    // $top equal to the page size would be satisfied by the first page, the
    // server would send no @odata.nextLink and "load more" would look broken.
    const query = emptyQuery('accounts')
    expect(query.top).toBeNull()
    expect(query.pageSize).toBe(50)
    expect(query.annotations).toBe(true)
    expect(renderQueryOptions(query)).toEqual({})
  })
})

describe('clampTop', () => {
  it.each([
    [0, 1],
    [1, 1],
    [50, 50],
    [9999, 5000],
    [12.7, 12],
    [Number.NaN, 50],
  ])('clamps %s to %s', (input, expected) => {
    expect(clampTop(input)).toBe(expected)
  })
})

describe('renderQueryOptions', () => {
  it('omits everything empty', () => {
    expect(renderQueryOptions({ ...emptyQuery('accounts'), top: null })).toEqual(
      {},
    )
  })

  it('renders select, filter, orderby, expand and top', () => {
    const options = renderQueryOptions({
      ...emptyQuery('accounts'),
      select: ['name', '_primarycontactid_value'],
      filterRaw: "statecode eq 0 and contains(name,'Contoso')",
      expandRaw: 'primarycontactid($select=fullname)',
      orderBy: [
        { column: 'name', desc: false },
        { column: 'createdon', desc: true },
      ],
      top: 25,
    })
    expect(options).toEqual({
      select: 'name,_primarycontactid_value',
      filter: "statecode eq 0 and contains(name,'Contoso')",
      expand: 'primarycontactid($select=fullname)',
      orderby: 'name asc,createdon desc',
      top: 25,
    })
  })

  it('trims blank raw expressions instead of sending them', () => {
    const options = renderQueryOptions({
      ...emptyQuery('accounts'),
      filterRaw: '   ',
      expandRaw: '',
    })
    expect(options.filter).toBeUndefined()
    expect(options.expand).toBeUndefined()
  })

  it('clamps an over-large $top', () => {
    expect(
      renderQueryOptions({ ...emptyQuery('accounts'), top: 100000 }).top,
    ).toBe(5000)
  })
})

describe('preferHeader', () => {
  it('asks for annotations and a server page size', () => {
    expect(preferHeader({ ...emptyQuery('accounts'), pageSize: 100 })).toBe(
      'odata.include-annotations="*",odata.maxpagesize=100',
    )
  })

  it('drops annotations when switched off', () => {
    expect(
      preferHeader({
        ...emptyQuery('accounts'),
        annotations: false,
        pageSize: 50,
      }),
    ).toBe('odata.maxpagesize=50')
  })

  it('returns undefined when there is nothing to prefer', () => {
    expect(
      preferHeader({
        ...emptyQuery('accounts'),
        annotations: false,
        pageSize: 0,
      }),
    ).toBeUndefined()
  })
})

describe('toQueryPath / toWebApiUrl', () => {
  const query = {
    ...emptyQuery('accounts'),
    select: ['name'],
    filterRaw: "contains(name,'A & B')",
    top: 10,
  }

  it('renders a readable relative path, unencoded', () => {
    expect(toQueryPath(query)).toBe(
      "/accounts?$select=name&$filter=contains(name,'A & B')&$top=10",
    )
  })

  it('percent-encodes the copyable URL and strips a trailing slash', () => {
    expect(toWebApiUrl('https://org.crm4.dynamics.com/', query)).toBe(
      'https://org.crm4.dynamics.com/api/data/v9.2/accounts' +
        '?$select=name&$filter=contains(name%2C\'A%20%26%20B\')&$top=10',
    )
  })

  it('is empty without a table', () => {
    expect(toQueryPath(emptyQuery())).toBe('')
    expect(toWebApiUrl('https://org.crm4.dynamics.com', emptyQuery())).toBe('')
  })
})

describe('skipTokenFrom', () => {
  it('extracts and decodes the token out of a nextLink', () => {
    expect(
      skipTokenFrom(
        'https://org.crm4.dynamics.com/api/data/v9.2/accounts?$select=name&$skiptoken=%3Ccookie%20pagenumber%3D%222%22%2F%3E',
      ),
    ).toBe('<cookie pagenumber="2"/>')
  })

  it('returns null when there is no next page', () => {
    expect(skipTokenFrom(undefined)).toBeNull()
    expect(skipTokenFrom('')).toBeNull()
    expect(skipTokenFrom(42)).toBeNull()
    expect(
      skipTokenFrom('https://org.crm4.dynamics.com/api/data/v9.2/accounts'),
    ).toBeNull()
  })
})
