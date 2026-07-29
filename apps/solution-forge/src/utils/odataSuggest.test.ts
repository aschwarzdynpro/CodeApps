import { describe, expect, it } from 'vitest'
import type {
  EntityMeta,
  EntityRef,
  OptionLabel,
  RawAttribute,
} from '../types/odataBrowser'
import { classifyColumn } from './odataQuery'
import { regionAt, signatureAt, suggest, type SuggestContext } from './odataSuggest'

function attribute(
  logicalName: string,
  attributeType = 'String',
  displayName = logicalName,
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
  }
}

const ENTITIES: EntityRef[] = [
  {
    logicalName: 'account',
    schemaName: 'Account',
    entitySet: 'accounts',
    displayName: 'Firma',
    displayCollectionName: 'Firmen',
    primaryIdAttribute: 'accountid',
    primaryNameAttribute: 'name',
    objectTypeCode: 1,
    isPrivate: false,
    isActivity: false,
    isCustomEntity: false,
    isManaged: true,
  },
  {
    logicalName: 'webresource',
    schemaName: 'WebResource',
    entitySet: 'webresourceset',
    displayName: 'Web Resource',
    displayCollectionName: 'Web Resources',
    primaryIdAttribute: 'webresourceid',
    primaryNameAttribute: 'name',
    objectTypeCode: 9333,
    isPrivate: false,
    isActivity: false,
    isCustomEntity: false,
    isManaged: true,
  },
]

const META: EntityMeta = {
  ref: ENTITIES[0],
  columns: [
    classifyColumn(attribute('name', 'String', 'Account Name')),
    classifyColumn(attribute('revenue', 'Money', 'Annual Revenue')),
    classifyColumn(attribute('statecode', 'State', 'Status')),
    classifyColumn(attribute('createdon', 'DateTime', 'Created On')),
    classifyColumn(attribute('donotemail', 'Boolean', 'Do Not Email')),
    classifyColumn(attribute('ownerid', 'Owner', 'Owner')),
    classifyColumn({ ...attribute('entityimage'), isValidForRead: false }),
  ],
  lookups: [
    {
      navigationName: 'primarycontactid',
      valueColumn: '_primarycontactid_value',
      targetEntity: 'contact',
    },
  ],
}

const OPTIONS = new Map<string, OptionLabel[]>([
  [
    'statecode',
    [
      { value: 0, label: 'Active' },
      { value: 1, label: 'Inactive' },
    ],
  ],
])

const CTX: SuggestContext = { entities: ENTITIES, meta: META, options: OPTIONS }

/** Suggest at the caret marked by `|` in the input. */
function at(textWithCaret: string, ctx: SuggestContext = CTX) {
  const caret = textWithCaret.indexOf('|')
  const text = textWithCaret.replace('|', '')
  return suggest(text, caret, ctx)
}

const labels = (textWithCaret: string, ctx?: SuggestContext) =>
  at(textWithCaret, ctx).map((s) => s.label)

describe('regionAt', () => {
  it.each([
    ['/acc|', 'path'],
    ['/accounts?$select=na|', '$select'],
    ['/accounts?$select=name&$filter=st|', '$filter'],
    ['/accounts?$filter=a eq 1&$orderby=na|', '$orderby'],
    ['/accounts?$expand=pri|', '$expand'],
    ['/accounts?$top=5|', '$top'],
  ])('locates %s as %s', (input, expected) => {
    const caret = input.indexOf('|')
    expect(regionAt(input.replace('|', ''), caret).region).toBe(expected)
  })

  it('is not confused by an ampersand inside a value', () => {
    const input = "/accounts?$filter=contains(name,'A & B')&$top=5"
    // Caret right after the $top value — must resolve to $top, not $filter.
    expect(regionAt(input, input.length).region).toBe('$top')
  })

  it('stays in the path before the question mark', () => {
    expect(regionAt('/accounts?$select=name', 4).region).toBe('path')
  })
})

describe('suggest — path', () => {
  it('offers entity sets, matched on set, logical and display name', () => {
    expect(labels('/acc|')).toContain('accounts')
    expect(labels('/Firm|')).toContain('accounts')
    expect(labels('/webresource|')).toContain('webresourceset')
  })

  it('replaces only the typed token', () => {
    const [first] = at('/acc|')
    expect(first.replaceFrom).toBe(1)
    expect(first.replaceTo).toBe(4)
  })
})

describe('suggest — $select and $orderby', () => {
  it('offers selectable columns and leaves out unreadable ones', () => {
    const result = labels('/accounts?$select=|')
    expect(result).toContain('name')
    expect(result).toContain('_ownerid_value')
    expect(result).not.toContain('entityimage')
  })

  it('selects a lookup as _x_value, never by its navigation name', () => {
    expect(labels('/accounts?$select=owner|')).toEqual(['_ownerid_value'])
  })

  it('completes after a comma', () => {
    expect(labels('/accounts?$select=name,rev|')).toEqual(['revenue'])
  })

  it('matches on the display name too', () => {
    expect(labels('/accounts?$select=Annual|')).toEqual(['revenue'])
  })

  it('offers a sort direction once a column is typed', () => {
    expect(labels('/accounts?$orderby=name |')).toEqual(['asc', 'desc'])
  })

  it('offers columns at the start of $orderby', () => {
    expect(labels('/accounts?$orderby=|')).toContain('createdon')
  })
})

describe('suggest — $filter', () => {
  it('offers columns and functions at the start of an expression', () => {
    const result = labels('/accounts?$filter=|')
    expect(result).toContain('name')
    expect(result).toContain('contains')
    expect(result).toContain('Microsoft.Dynamics.CRM.LastXDays')
  })

  it('offers comparison operators right after a column', () => {
    const result = labels('/accounts?$filter=revenue |')
    expect(result).toContain('eq')
    expect(result).toContain('gt')
    expect(result).toContain('eq null')
  })

  it('offers choice labels as values after eq', () => {
    const result = at('/accounts?$filter=statecode eq |')
    expect(result.map((s) => s.label)).toEqual(['0', '1'])
    expect(result.map((s) => s.detail)).toEqual(['Active', 'Inactive'])
  })

  it('offers booleans for a two-option column', () => {
    expect(labels('/accounts?$filter=donotemail eq |')).toEqual([
      'true',
      'false',
    ])
  })

  it('completes columns inside a CRM function PropertyName', () => {
    const result = labels(
      "/accounts?$filter=Microsoft.Dynamics.CRM.LastXDays(PropertyName='created|",
    )
    expect(result).toEqual(['createdon'])
  })

  it('offers columns again after and/or', () => {
    expect(labels("/accounts?$filter=name eq 'A' and |")).toContain('revenue')
  })

  it('inserts a CRM function with its opening PropertyName', () => {
    const [suggestion] = at('/accounts?$filter=Microsoft.Dynamics.CRM.Last|')
    expect(suggestion.insert).toBe(
      "Microsoft.Dynamics.CRM.LastXDays(PropertyName='",
    )
  })
})

describe('suggest — $expand', () => {
  it('offers navigation properties with their target table', () => {
    const [suggestion] = at('/accounts?$expand=prim|')
    expect(suggestion.label).toBe('primarycontactid')
    expect(suggestion.detail).toBe('→ contact')
  })

  it('offers $select inside the parentheses', () => {
    expect(labels('/accounts?$expand=primarycontactid(|')).toEqual(['$select='])
  })

  it('offers nothing without relationship metadata', () => {
    expect(
      labels('/accounts?$expand=|', { ...CTX, meta: { ...META, lookups: [] } }),
    ).toEqual([])
  })
})

describe('suggest — nothing to offer', () => {
  it('is empty for $top and without metadata', () => {
    expect(labels('/accounts?$top=1|')).toEqual([])
    expect(labels('/accounts?$select=na|', { ...CTX, meta: null })).toEqual([])
  })
})

describe('signatureAt', () => {
  it('names the CRM function the caret sits in', () => {
    const text = "Microsoft.Dynamics.CRM.LastXDays(PropertyName='createdon',"
    expect(signatureAt(text, text.length)).toBe(
      "LastXDays(PropertyName='column',PropertyValue=n)",
    )
  })

  it('names a string function', () => {
    expect(signatureAt("contains(name,'A", 16)).toBe("contains(column,'text')")
  })

  it('is null once the call is closed or never opened', () => {
    const closed = "contains(name,'A')"
    expect(signatureAt(closed, closed.length)).toBeNull()
    expect(signatureAt('name eq 1', 9)).toBeNull()
  })
})
