// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  COUNT_ALIAS,
  buildColumnPlan,
  buildCountFetchXml,
  describeEntryValidation,
  fetchTop,
  fetchXmlAttributes,
  formatFetchXml,
  joinCsvList,
  parseCsvList,
  parseFetchXml,
  parseRunLog,
  setAttributes,
  validateMatchColumns,
  withRowLimit,
  type TransferEntryDraft,
} from './transferConfig'

const SIMPLE = `<fetch><entity name="cust_paymentterm">
  <attribute name="cust_name"/><attribute name="cust_code"/>
  <filter><condition attribute="statecode" operator="eq" value="0"/></filter>
  <order attribute="cust_name"/>
</entity></fetch>`

describe('parseFetchXml', () => {
  it('dissects a simple query', () => {
    const p = parseFetchXml(SIMPLE)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.entity).toBe('cust_paymentterm')
    expect(p.attributes).toEqual(['cust_name', 'cust_code'])
    expect(p.allAttributes).toBe(false)
    expect(p.hasAggregate).toBe(false)
    expect(p.linkEntities).toEqual([])
    expect(p.warnings).toEqual([])
  })

  it('rejects empty and garbage input without throwing', () => {
    expect(parseFetchXml('').ok).toBe(false)
    expect(parseFetchXml('   ').ok).toBe(false)
    expect(parseFetchXml('<fetch><entity').ok).toBe(false)
    expect(parseFetchXml('not xml at all').ok).toBe(false)
  })

  it('rejects a non-fetch root and a missing/duplicated entity', () => {
    expect(parseFetchXml('<query><entity name="a"/></query>').ok).toBe(false)
    expect(parseFetchXml('<fetch></fetch>').ok).toBe(false)
    expect(parseFetchXml('<fetch><entity name="a"/><entity name="b"/></fetch>').ok).toBe(false)
    expect(parseFetchXml('<fetch><entity/></fetch>').ok).toBe(false)
  })

  it('flags all-attributes and aggregate', () => {
    const p = parseFetchXml('<fetch aggregate="true"><entity name="a"><all-attributes/></entity></fetch>')
    expect(p.ok && p.allAttributes).toBe(true)
    expect(p.ok && p.hasAggregate).toBe(true)
  })

  it('collects link-entities (nested) and warns about them', () => {
    const p = parseFetchXml(`<fetch><entity name="a"><attribute name="x"/>
      <link-entity name="b"><link-entity name="c"/></link-entity></entity></fetch>`)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.linkEntities).toEqual(['b', 'c'])
    expect(p.warnings.some((w) => w.includes('link-entity'))).toBe(true)
  })

  it('warns when no attribute is selected', () => {
    const p = parseFetchXml('<fetch><entity name="a"/></fetch>')
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.warnings.some((w) => w.includes('primary key'))).toBe(true)
  })
})

describe('fetchXmlAttributes', () => {
  it('returns [] on invalid XML', () => {
    expect(fetchXmlAttributes('garbage')).toEqual([])
  })
  it('returns the attribute names', () => {
    expect(fetchXmlAttributes(SIMPLE)).toEqual(['cust_name', 'cust_code'])
  })
})

describe('validateMatchColumns', () => {
  it('reports columns missing from the query', () => {
    const parsed = parseFetchXml(SIMPLE)
    expect(validateMatchColumns(['cust_code', 'cust_missing'], parsed)).toEqual(['cust_missing'])
  })
  it('is case-insensitive and passes with all-attributes', () => {
    expect(validateMatchColumns(['CUST_CODE'], parseFetchXml(SIMPLE))).toEqual([])
    const all = parseFetchXml('<fetch><entity name="a"><all-attributes/></entity></fetch>')
    expect(validateMatchColumns(['anything'], all)).toEqual([])
  })
  it('stays silent on invalid XML (validity reported elsewhere)', () => {
    expect(validateMatchColumns(['x'], parseFetchXml('garbage'))).toEqual([])
  })
})

describe('fetchTop', () => {
  it('reads a valid top and rejects garbage', () => {
    expect(fetchTop('<fetch top="10"><entity name="a"/></fetch>')).toBe(10)
    expect(fetchTop('<fetch><entity name="a"/></fetch>')).toBeNull()
    expect(fetchTop('<fetch top="abc"><entity name="a"/></fetch>')).toBeNull()
    expect(fetchTop('<fetch top="0"><entity name="a"/></fetch>')).toBeNull()
    expect(fetchTop('garbage')).toBeNull()
  })
})

describe('withRowLimit', () => {
  it('injects count and strips pre-existing paging', () => {
    const limited = withRowLimit(
      '<fetch count="5000" page="3" returntotalrecordcount="true"><entity name="a"/></fetch>',
      25,
    )
    expect(limited).toContain('count="25"')
    expect(limited).not.toContain('page=')
    expect(limited).not.toContain('returntotalrecordcount=')
  })
  it("honors the author's top as the effective limit", () => {
    expect(withRowLimit('<fetch top="10"><entity name="a"/></fetch>', 25)).toContain('count="10"')
    expect(withRowLimit('<fetch top="1000"><entity name="a"/></fetch>', 25)).toContain('count="25"')
    expect(withRowLimit('<fetch top="10"><entity name="a"/></fetch>', 25)).not.toContain('top=')
  })
  it('preserves the query body', () => {
    const limited = withRowLimit(SIMPLE, 25)
    expect(limited).toContain('<filter>')
    expect(limited).toContain('cust_code')
  })
  it('passes garbage through unchanged', () => {
    expect(withRowLimit('garbage', 25)).toBe('garbage')
  })
})

describe('buildCountFetchXml', () => {
  it('turns the query into an aggregate count keeping the filter', () => {
    const xml = buildCountFetchXml(SIMPLE, 'cust_paymenttermid')
    expect(xml).not.toBeNull()
    const p = parseFetchXml(xml!)
    expect(p.ok && p.hasAggregate).toBe(true)
    expect(xml).toContain(`alias="${COUNT_ALIAS}"`)
    expect(xml).toContain('name="cust_paymenttermid"')
    expect(xml).toContain('<filter>')
    expect(xml).not.toContain('cust_name')
    expect(xml).not.toContain('<order')
  })
  it('strips paging and nested attributes/orders', () => {
    const xml = buildCountFetchXml(
      `<fetch count="50" page="2"><entity name="a"><all-attributes/>
        <link-entity name="b"><attribute name="bx"/><order attribute="bx"/></link-entity>
      </entity></fetch>`,
      'aid',
    )
    expect(xml).not.toBeNull()
    expect(xml).not.toContain('count="50"')
    expect(xml).not.toContain('page=')
    expect(xml).not.toContain('all-attributes')
    expect(xml).not.toContain('bx')
    expect(xml).toContain('<link-entity name="b"')
  })
  it('returns null for garbage and for aggregate input', () => {
    expect(buildCountFetchXml('garbage', 'aid')).toBeNull()
    expect(
      buildCountFetchXml('<fetch aggregate="true"><entity name="a"/></fetch>', 'aid'),
    ).toBeNull()
  })
})

describe('setAttributes', () => {
  it('replaces attributes while preserving filter/order', () => {
    const out = setAttributes(SIMPLE, ['cust_code', 'cust_rank'])
    const p = parseFetchXml(out)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.attributes).toEqual(['cust_code', 'cust_rank'])
    expect(out).toContain('<filter>')
    expect(out).toContain('<order')
  })
  it('handles an entity that had no attributes yet', () => {
    const out = setAttributes('<fetch><entity name="a"><filter/></entity></fetch>', ['x'])
    expect(fetchXmlAttributes(out)).toEqual(['x'])
    expect(out).toContain('<filter/>')
  })
  it('passes garbage through unchanged', () => {
    expect(setAttributes('garbage', ['x'])).toBe('garbage')
  })
})

describe('formatFetchXml', () => {
  it('pretty-prints a one-liner with one child per line', () => {
    const out = formatFetchXml(
      '<fetch version="1.0"><entity name="agenttask"><attribute name="agenttaskid" /><filter><condition attribute="statecode" operator="eq" value="0"/></filter></entity></fetch>',
    )
    expect(out.split('\n')).toEqual([
      '<fetch version="1.0">',
      '  <entity name="agenttask">',
      '    <attribute name="agenttaskid"/>',
      '    <filter>',
      '      <condition attribute="statecode" operator="eq" value="0"/>',
      '    </filter>',
      '  </entity>',
      '</fetch>',
    ])
  })
  it('keeps value text inline (no whitespace leaks into <value>)', () => {
    const out = formatFetchXml(
      '<fetch><entity name="a"><filter><condition attribute="x" operator="in"><value>1</value><value>2</value></condition></filter></entity></fetch>',
    )
    expect(out).toContain('<value>1</value>')
    expect(out).toContain('<value>2</value>')
    expect(out).not.toMatch(/<value>\s/)
  })
  it('is semantically stable (reparse yields the same attributes)', () => {
    const out = formatFetchXml(SIMPLE)
    const p = parseFetchXml(out)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.attributes).toEqual(['cust_name', 'cust_code'])
  })
  it('passes garbage through unchanged', () => {
    expect(formatFetchXml('garbage')).toBe('garbage')
  })
})

describe('buildColumnPlan', () => {
  const attrs = [
    { logicalName: 'cust_name', attributeType: 'String', attributeTypeName: 'StringType', isValidForCreate: true, isValidForUpdate: true, attributeOf: null },
    { logicalName: 'cust_code', attributeType: 'String', attributeTypeName: 'StringType', isValidForCreate: true, isValidForUpdate: true, attributeOf: null },
    { logicalName: 'cust_pricelistid', attributeType: 'Lookup', attributeTypeName: 'LookupType', isValidForCreate: true, isValidForUpdate: true, attributeOf: null },
    { logicalName: 'cust_pricelistidname', attributeType: 'String', attributeTypeName: 'StringType', isValidForCreate: false, isValidForUpdate: false, attributeOf: 'cust_pricelistid' },
    { logicalName: 'cust_itemid', attributeType: 'Uniqueidentifier', attributeTypeName: 'UniqueidentifierType', isValidForCreate: false, isValidForUpdate: false, attributeOf: null },
    { logicalName: 'cust_tags', attributeType: 'Virtual', attributeTypeName: 'MultiSelectPicklistType', isValidForCreate: true, isValidForUpdate: true, attributeOf: null },
    { logicalName: 'customerid', attributeType: 'Customer', attributeTypeName: 'CustomerType', isValidForCreate: true, isValidForUpdate: true, attributeOf: null },
    { logicalName: 'ownerid', attributeType: 'Owner', attributeTypeName: 'OwnerType', isValidForCreate: true, isValidForUpdate: true, attributeOf: null },
    { logicalName: 'statecode', attributeType: 'State', attributeTypeName: 'StateType', isValidForCreate: false, isValidForUpdate: true, attributeOf: null },
    { logicalName: 'createdon', attributeType: 'DateTime', attributeTypeName: 'DateTimeType', isValidForCreate: false, isValidForUpdate: false, attributeOf: null },
    { logicalName: 'cust_readonly', attributeType: 'String', attributeTypeName: 'StringType', isValidForCreate: false, isValidForUpdate: false, attributeOf: null },
  ]
  const lookupTargets = {
    cust_pricelistid: ['cust_pricelist'],
    customerid: ['account', 'contact'],
  }
  const sets = { cust_pricelist: 'cust_pricelists' }

  it('classifies scalars, lookups and skips (all-attributes mode)', () => {
    const plan = buildColumnPlan(null, attrs, 'cust_itemid', lookupTargets, sets)
    expect(plan.s).toEqual(['cust_code', 'cust_name', 'cust_tags'])
    expect(plan.l).toEqual([{ c: 'cust_pricelistid', s: 'cust_pricelists' }])
    const reasons = Object.fromEntries(plan.x.map((e) => [e.c, e.r]))
    expect(reasons.cust_itemid).toContain('primary id')
    expect(reasons.cust_pricelistidname).toBe('virtual')
    expect(reasons.customerid).toBe('polymorphic lookup')
    expect(reasons.ownerid).toBe('owner')
    expect(reasons.statecode).toBe('platform')
    expect(reasons.createdon).toBe('platform')
    expect(reasons.cust_readonly).toBe('read-only')
  })

  it('restricts to the fetch attributes and flags unknown ones', () => {
    const plan = buildColumnPlan(
      ['cust_name', 'cust_pricelistid', 'cust_ghost'],
      attrs,
      'cust_itemid',
      lookupTargets,
      sets,
    )
    expect(plan.s).toEqual(['cust_name'])
    expect(plan.l).toEqual([{ c: 'cust_pricelistid', s: 'cust_pricelists' }])
    expect(plan.x).toEqual([{ c: 'cust_ghost', r: 'not in metadata' }])
  })

  it('skips lookups whose target set is unresolved', () => {
    const plan = buildColumnPlan(['cust_pricelistid'], attrs, 'cust_itemid', lookupTargets, {})
    expect(plan.l).toEqual([])
    expect(plan.x[0].r).toBe('lookup target set unknown')
  })
})

describe('parseRunLog', () => {
  it('parses executor cell rows and entry-level errors', () => {
    const rows = parseRunLog(
      '[{"entry":"NACE Codes","target":"uat","created":1,"updated":9,"deactivated":0,"deleted":0,"errors":["x failed"]},{"entry":"Broken","error":"no column plan"}]',
    )
    expect(rows).toHaveLength(2)
    expect(rows![0]).toMatchObject({ entry: 'NACE Codes', target: 'uat', created: 1, updated: 9, errors: ['x failed'] })
    expect(rows![1]).toMatchObject({ entry: 'Broken', error: 'no column plan', created: 0 })
  })
  it('returns null for empty or non-array input', () => {
    expect(parseRunLog('')).toBeNull()
    expect(parseRunLog('not json')).toBeNull()
    expect(parseRunLog('{"a":1}')).toBeNull()
  })
})

describe('csv helpers', () => {
  it('round-trips and de-duplicates', () => {
    expect(parseCsvList(' a, b ,a,,B ')).toEqual(['a', 'b'])
    expect(joinCsvList([' a ', '', 'b'])).toBe('a,b')
    expect(parseCsvList(null)).toEqual([])
    expect(parseCsvList(undefined)).toEqual([])
    expect(joinCsvList([])).toBe('')
  })
})

describe('describeEntryValidation', () => {
  const base: TransferEntryDraft = {
    sourceEnvKey: 'dev',
    tableLogicalName: 'cust_paymentterm',
    queryMode: 'fetchxml',
    viewId: '',
    fetchXml: SIMPLE,
    matchMode: 'guid',
    matchColumns: [],
  }

  it('passes a clean fetchxml draft', () => {
    expect(describeEntryValidation(base)).toEqual([])
  })

  it('requires the basics', () => {
    const errors = describeEntryValidation({
      ...base,
      sourceEnvKey: '',
      tableLogicalName: '',
    })
    expect(errors.length).toBeGreaterThanOrEqual(2)
  })

  it('requires a view in view mode and ignores fetchXml there', () => {
    expect(
      describeEntryValidation({ ...base, queryMode: 'view', viewId: '', fetchXml: 'garbage' }),
    ).toEqual(['Pick a saved view.'])
    expect(
      describeEntryValidation({ ...base, queryMode: 'view', viewId: 'v1', fetchXml: 'garbage' }),
    ).toEqual([])
  })

  it('rejects invalid fetchxml and an entity/table mismatch', () => {
    expect(describeEntryValidation({ ...base, fetchXml: 'garbage' })[0]).toMatch(/^FetchXML:/)
    const mismatch = describeEntryValidation({ ...base, tableLogicalName: 'cust_other' })
    expect(mismatch.some((e) => e.includes('cust_other'))).toBe(true)
  })

  it('gates match-by-columns on selection and coverage', () => {
    expect(
      describeEntryValidation({ ...base, matchMode: 'columns', matchColumns: [] }),
    ).toEqual(['Match by columns needs at least one column.'])
    const missing = describeEntryValidation({
      ...base,
      matchMode: 'columns',
      matchColumns: ['cust_code', 'cust_missing'],
    })
    expect(missing.some((e) => e.includes('cust_missing'))).toBe(true)
    expect(
      describeEntryValidation({ ...base, matchMode: 'columns', matchColumns: ['cust_code'] }),
    ).toEqual([])
  })
})
