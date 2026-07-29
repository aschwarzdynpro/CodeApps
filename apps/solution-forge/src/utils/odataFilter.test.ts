import { describe, expect, it } from 'vitest'
import type {
  ColumnMeta,
  FilterCondition,
  FilterGroup,
  FilterNode,
  FilterOperator,
  RawAttribute,
} from '../types/odataBrowser'
import { classifyColumn } from './odataQuery'
import {
  addToGroup,
  buildCountFetchXml,
  defaultOperatorFor,
  filterToFetchXml,
  literalFor,
  logicalNameOf,
  newCondition,
  newGroup,
  odataString,
  operatorsFor,
  parseFilter,
  removeNode,
  renderRootFilter,
  updateNode,
} from './odataFilter'

function attribute(
  logicalName: string,
  attributeType: string,
  attributeTypeName = '',
): RawAttribute {
  return {
    logicalName,
    displayName: logicalName,
    attributeType,
    attributeTypeName,
    attributeOf: null,
    isValidForRead: true,
    isValidForCreate: true,
    isValidForUpdate: true,
    isValidForAdvancedFind: true,
    isPrimaryId: false,
    isPrimaryName: false,
  }
}

/** The account-ish column set every test below works against. */
const COLUMNS: Map<string, ColumnMeta> = new Map(
  [
    attribute('name', 'String'),
    attribute('revenue', 'Money'),
    attribute('numberofemployees', 'Integer'),
    attribute('statecode', 'State'),
    attribute('createdon', 'DateTime'),
    attribute('accountid', 'Uniqueidentifier'),
    attribute('ownerid', 'Owner'),
    attribute('donotemail', 'Boolean'),
    attribute('pro_areas', 'Virtual', 'MultiSelectPicklistType'),
  ]
    .map(classifyColumn)
    .map((c) => [c.selectName, c] as const),
)

function cond(
  column: string,
  operator: FilterOperator,
  values: string[] = [],
): FilterCondition {
  return { ...newCondition(column, operator), values }
}

const render = (node: FilterGroup): string | null =>
  renderRootFilter(node, COLUMNS)

/** Compare trees without the generated ids. */
function shape(node: FilterNode): unknown {
  if (node.kind === 'group')
    return { op: node.op, children: node.children.map(shape) }
  return { column: node.column, operator: node.operator, values: node.values }
}

describe('literals', () => {
  it('escapes single quotes by doubling them', () => {
    expect(odataString("O'Brien")).toBe("'O''Brien'")
  })

  it('quotes strings, leaves numbers, guids and dates bare', () => {
    expect(literalFor('string', 'Contoso')).toBe("'Contoso'")
    expect(literalFor('number', '42')).toBe('42')
    expect(literalFor('money', '-1.5')).toBe('-1.5')
    expect(literalFor('choice', '0')).toBe('0')
    expect(literalFor('boolean', 'true')).toBe('true')
    expect(literalFor('boolean', 'nope')).toBe('false')
    expect(literalFor('guid', '3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    )
  })

  it('quotes a non-numeric value even on a numeric column instead of emitting junk', () => {
    expect(literalFor('number', 'abc')).toBe("'abc'")
  })

  it('completes a bare date into a datetime literal', () => {
    expect(literalFor('datetime', '2026-07-29')).toBe('2026-07-29T00:00:00Z')
    expect(literalFor('datetime', '2026-07-29T10:00:00Z')).toBe(
      '2026-07-29T10:00:00Z',
    )
    expect(literalFor('dateonly', '2026-07-29')).toBe('2026-07-29')
  })
})

describe('logicalNameOf', () => {
  it('strips the lookup _value wrapper for CRM functions', () => {
    expect(logicalNameOf('_ownerid_value')).toBe('ownerid')
    expect(logicalNameOf('name')).toBe('name')
  })
})

describe('operatorsFor / defaultOperatorFor', () => {
  it('offers text operators only on text', () => {
    expect(operatorsFor('string').map((o) => o.id)).toContain('contains')
    expect(operatorsFor('number').map((o) => o.id)).not.toContain('contains')
  })

  it('offers date functions only on dates and user context only on lookups', () => {
    expect(operatorsFor('datetime').map((o) => o.id)).toContain('lastxdays')
    expect(operatorsFor('string').map((o) => o.id)).not.toContain('lastxdays')
    expect(operatorsFor('lookup').map((o) => o.id)).toContain('equaluserid')
    expect(operatorsFor('string').map((o) => o.id)).not.toContain('equaluserid')
  })

  it('defaults to contains on text and equals elsewhere', () => {
    expect(defaultOperatorFor('string')).toBe('contains')
    expect(defaultOperatorFor('number')).toBe('eq')
  })
})

describe('renderRootFilter', () => {
  it('renders comparisons with type-correct literals', () => {
    expect(render(newGroup('and', [cond('name', 'eq', ['Contoso'])]))).toBe(
      "name eq 'Contoso'",
    )
    expect(render(newGroup('and', [cond('revenue', 'gt', ['1000'])]))).toBe(
      'revenue gt 1000',
    )
    expect(render(newGroup('and', [cond('statecode', 'eq', ['0'])]))).toBe(
      'statecode eq 0',
    )
  })

  it('renders the string functions', () => {
    expect(render(newGroup('and', [cond('name', 'contains', ['Con'])]))).toBe(
      "contains(name,'Con')",
    )
    expect(render(newGroup('and', [cond('name', 'notcontains', ['Con'])]))).toBe(
      "not contains(name,'Con')",
    )
    expect(render(newGroup('and', [cond('name', 'startswith', ['Con'])]))).toBe(
      "startswith(name,'Con')",
    )
  })

  it('renders null checks and CRM functions', () => {
    expect(render(newGroup('and', [cond('name', 'null')]))).toBe('name eq null')
    expect(render(newGroup('and', [cond('name', 'notnull')]))).toBe(
      'name ne null',
    )
    expect(render(newGroup('and', [cond('createdon', 'today')]))).toBe(
      "Microsoft.Dynamics.CRM.Today(PropertyName='createdon')",
    )
    expect(render(newGroup('and', [cond('createdon', 'lastxdays', ['7'])]))).toBe(
      "Microsoft.Dynamics.CRM.LastXDays(PropertyName='createdon',PropertyValue=7)",
    )
  })

  it('uses the logical name inside CRM functions, not the _value column', () => {
    expect(render(newGroup('and', [cond('_ownerid_value', 'equaluserid')]))).toBe(
      "Microsoft.Dynamics.CRM.EqualUserId(PropertyName='ownerid')",
    )
  })

  it('expands "is one of" into an or-chain rather than the in operator', () => {
    expect(render(newGroup('and', [cond('name', 'in', ['A', 'B'])]))).toBe(
      "(name eq 'A' or name eq 'B')",
    )
  })

  it('expands between into a bounded pair', () => {
    expect(
      render(newGroup('and', [cond('revenue', 'between', ['10', '20'])])),
    ).toBe('(revenue ge 10 and revenue le 20)')
  })

  it('joins children with the group operator', () => {
    expect(
      render(
        newGroup('and', [
          cond('name', 'contains', ['Con']),
          cond('statecode', 'eq', ['0']),
        ]),
      ),
    ).toBe("contains(name,'Con') and statecode eq 0")
  })

  it('parenthesises a nested group — otherwise precedence silently flips', () => {
    const tree = newGroup('and', [
      newGroup('or', [cond('name', 'eq', ['A']), cond('name', 'eq', ['B'])]),
      cond('statecode', 'eq', ['0']),
    ])
    expect(render(tree)).toBe("(name eq 'A' or name eq 'B') and statecode eq 0")
  })

  it('skips incomplete conditions instead of emitting a broken filter', () => {
    expect(render(newGroup('and', [cond('name', 'eq', [''])]))).toBeNull()
    expect(render(newGroup('and', [cond('', 'eq', ['x'])]))).toBeNull()
    expect(
      render(newGroup('and', [cond('revenue', 'between', ['10'])])),
    ).toBeNull()
    expect(
      render(
        newGroup('and', [
          cond('name', 'eq', ['A']),
          cond('statecode', 'eq', ['']),
        ]),
      ),
    ).toBe("name eq 'A'")
  })

  it('is null for an empty tree', () => {
    expect(render(newGroup('and'))).toBeNull()
    expect(renderRootFilter(null, COLUMNS)).toBeNull()
  })
})

describe('parseFilter', () => {
  const roundTrip = (tree: FilterGroup) => {
    const text = render(tree)
    expect(text).not.toBeNull()
    const parsed = parseFilter(text as string, COLUMNS)
    expect(parsed).not.toBeNull()
    return { text, reRendered: render(parsed as FilterGroup) }
  }

  it('round-trips comparisons, functions and CRM operators unchanged', () => {
    for (const tree of [
      newGroup('and', [cond('name', 'eq', ['Contoso'])]),
      newGroup('and', [cond('name', 'contains', ['Con'])]),
      newGroup('and', [cond('name', 'notcontains', ['Con'])]),
      newGroup('and', [cond('name', 'startswith', ['Con'])]),
      newGroup('and', [cond('name', 'endswith', ['so'])]),
      newGroup('and', [cond('revenue', 'ge', ['1000'])]),
      newGroup('and', [cond('statecode', 'eq', ['0'])]),
      newGroup('and', [cond('createdon', 'lt', ['2026-01-01T00:00:00Z'])]),
      newGroup('and', [cond('name', 'null')]),
      newGroup('and', [cond('name', 'notnull')]),
      newGroup('and', [cond('createdon', 'today')]),
      newGroup('and', [cond('createdon', 'thismonth')]),
      newGroup('and', [cond('createdon', 'lastxdays', ['30'])]),
      newGroup('and', [cond('_ownerid_value', 'equaluserid')]),
      newGroup('and', [cond('pro_areas', 'containvalues', ['1', '2'])]),
      newGroup('and', [
        cond('name', 'contains', ['Con']),
        cond('statecode', 'eq', ['0']),
      ]),
      newGroup('and', [
        newGroup('or', [cond('name', 'eq', ['A']), cond('name', 'eq', ['B'])]),
        cond('statecode', 'eq', ['0']),
      ]),
    ]) {
      const { text, reRendered } = roundTrip(tree)
      expect(reRendered).toBe(text)
    }
  })

  it('preserves an escaped quote through the round trip', () => {
    const { text, reRendered } = roundTrip(
      newGroup('and', [cond('name', 'eq', ["O'Brien"])]),
    )
    expect(text).toBe("name eq 'O''Brien'")
    expect(reRendered).toBe(text)
  })

  it('reads a null check back as the null operator, not as a literal', () => {
    const parsed = parseFilter('name eq null', COLUMNS)
    expect(shape(parsed as FilterGroup)).toEqual({
      op: 'and',
      children: [{ column: 'name', operator: 'null', values: [] }],
    })
  })

  it('normalises "is one of" into the or-group it really is', () => {
    const parsed = parseFilter("(name eq 'A' or name eq 'B')", COLUMNS)
    expect(shape(parsed as FilterGroup)).toEqual({
      op: 'or',
      children: [
        { column: 'name', operator: 'eq', values: ['A'] },
        { column: 'name', operator: 'eq', values: ['B'] },
      ],
    })
  })

  it('returns an empty group for empty text', () => {
    expect(shape(parseFilter('   ', COLUMNS) as FilterGroup)).toEqual({
      op: 'and',
      children: [],
    })
  })

  it('refuses an unknown column — raw mode is safer than guessing its type', () => {
    expect(parseFilter("nosuchcolumn eq 'x'", COLUMNS)).toBeNull()
  })

  it('refuses expressions beyond its grammar', () => {
    // A lambda: perfectly valid OData, deliberately not modelled.
    expect(
      parseFilter(
        'systemuserroles_association/any(u:u/systemuserid eq 1)',
        COLUMNS,
      ),
    ).toBeNull()
    expect(parseFilter("name eq 'unterminated", COLUMNS)).toBeNull()
    expect(parseFilter("name eq 'A' and", COLUMNS)).toBeNull()
    expect(parseFilter("contains(name 'A')", COLUMNS)).toBeNull()
    expect(parseFilter("name 'A'", COLUMNS)).toBeNull()
    expect(parseFilter("(name eq 'A'", COLUMNS)).toBeNull()
  })
})

describe('filterToFetchXml', () => {
  const xml = (tree: FilterGroup) => filterToFetchXml(tree, COLUMNS)

  it('maps comparisons and null checks', () => {
    expect(xml(newGroup('and', [cond('statecode', 'eq', ['0'])]))).toBe(
      '<condition attribute="statecode" operator="eq" value="0" />',
    )
    expect(xml(newGroup('and', [cond('name', 'null')]))).toBe(
      '<condition attribute="name" operator="null" />',
    )
  })

  it('maps the string functions onto like patterns', () => {
    expect(xml(newGroup('and', [cond('name', 'contains', ['Con'])]))).toBe(
      '<condition attribute="name" operator="like" value="%Con%" />',
    )
    expect(xml(newGroup('and', [cond('name', 'startswith', ['Con'])]))).toBe(
      '<condition attribute="name" operator="like" value="Con%" />',
    )
    expect(xml(newGroup('and', [cond('name', 'notcontains', ['Con'])]))).toBe(
      '<condition attribute="name" operator="not-like" value="%Con%" />',
    )
  })

  it('addresses lookups by logical name, not by _x_value', () => {
    expect(xml(newGroup('and', [cond('_ownerid_value', 'equaluserid')]))).toBe(
      '<condition attribute="ownerid" operator="eq-userid" />',
    )
  })

  it('maps multi-value operators to value children', () => {
    expect(xml(newGroup('and', [cond('name', 'in', ['A', 'B'])]))).toBe(
      '<condition attribute="name" operator="in"><value>A</value><value>B</value></condition>',
    )
    expect(
      xml(newGroup('and', [cond('revenue', 'between', ['10', '20'])])),
    ).toBe(
      '<condition attribute="revenue" operator="between"><value>10</value><value>20</value></condition>',
    )
  })

  it('nests groups with their own type', () => {
    expect(
      xml(
        newGroup('and', [
          cond('name', 'eq', ['A']),
          newGroup('or', [
            cond('statecode', 'eq', ['0']),
            cond('statecode', 'eq', ['1']),
          ]),
        ]),
      ),
    ).toBe(
      '<filter type="and">' +
        '<condition attribute="name" operator="eq" value="A" />' +
        '<filter type="or">' +
        '<condition attribute="statecode" operator="eq" value="0" />' +
        '<condition attribute="statecode" operator="eq" value="1" />' +
        '</filter></filter>',
    )
  })

  it('escapes values instead of breaking the XML', () => {
    expect(xml(newGroup('and', [cond('name', 'eq', ['A & <B>'])]))).toBe(
      '<condition attribute="name" operator="eq" value="A &amp; &lt;B&gt;" />',
    )
  })

  it('is empty for an empty tree and skips incomplete conditions', () => {
    expect(xml(newGroup('and'))).toBe('')
    expect(xml(newGroup('and', [cond('name', 'eq', [''])]))).toBe('')
  })
})

describe('buildCountFetchXml', () => {
  it('builds a distinct count aggregate', () => {
    expect(buildCountFetchXml('account', 'accountid', null)).toBe(
      '<fetch aggregate="true"><entity name="account">' +
        '<attribute name="accountid" alias="cnt" aggregate="countcolumn" distinct="true" />' +
        '</entity></fetch>',
    )
  })

  it('wraps a bare condition in a filter element', () => {
    expect(
      buildCountFetchXml(
        'account',
        'accountid',
        '<condition attribute="statecode" operator="eq" value="0" />',
      ),
    ).toContain(
      '<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter>',
    )
  })

  it('does not double-wrap an existing filter element', () => {
    const xml = buildCountFetchXml(
      'account',
      'accountid',
      '<filter type="or"><condition attribute="name" operator="null" /></filter>',
    )
    expect(xml).not.toContain('<filter type="and"><filter')
  })
})

describe('tree edits', () => {
  it('updates a node by id without touching its siblings', () => {
    const a = cond('name', 'eq', ['A'])
    const b = cond('name', 'eq', ['B'])
    const root = newGroup('and', [a, b])
    const next = updateNode(root, b.id, (node) => ({
      ...(node as FilterCondition),
      values: ['C'],
    }))
    expect(shape(next)).toEqual({
      op: 'and',
      children: [
        { column: 'name', operator: 'eq', values: ['A'] },
        { column: 'name', operator: 'eq', values: ['C'] },
      ],
    })
    // The original tree is untouched — the UI relies on this.
    expect(shape(root)).toEqual({
      op: 'and',
      children: [
        { column: 'name', operator: 'eq', values: ['A'] },
        { column: 'name', operator: 'eq', values: ['B'] },
      ],
    })
  })

  it('removes a node at any depth', () => {
    const inner = cond('name', 'eq', ['B'])
    const root = newGroup('and', [
      cond('name', 'eq', ['A']),
      newGroup('or', [inner]),
    ])
    expect(shape(removeNode(root, inner.id))).toEqual({
      op: 'and',
      children: [
        { column: 'name', operator: 'eq', values: ['A'] },
        { op: 'or', children: [] },
      ],
    })
  })

  it('appends into the addressed group', () => {
    const nested = newGroup('or')
    const root = newGroup('and', [nested])
    const next = addToGroup(root, nested.id, cond('name', 'eq', ['X']))
    expect(shape(next)).toEqual({
      op: 'and',
      children: [
        {
          op: 'or',
          children: [{ column: 'name', operator: 'eq', values: ['X'] }],
        },
      ],
    })
  })
})
