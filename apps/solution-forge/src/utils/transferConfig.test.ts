// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  COUNT_ALIAS,
  MAX_MATCH_COLUMNS,
  buildColumnPlan,
  buildCountFetchXml,
  describeEntryValidation,
  fetchTop,
  fetchXmlAttributes,
  formatDuration,
  formatFetchXml,
  joinCsvList,
  parseCsvList,
  parseFetchXml,
  parseRunLog,
  parseWatermarks,
  previewCellValue,
  previewColumnsFromRow,
  setAttributes,
  validateMatchColumns,
  withDeltaCondition,
  withRowLimit,
  DELTA_ATTRIBUTE,
  DELTA_PLACEHOLDER,
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
  it('reads the delta flag, defaulting to a full cell', () => {
    const rows = parseRunLog('[{"entry":"A","target":"uat","delta":true},{"entry":"B","target":"prod"}]')
    expect(rows![0].delta).toBe(true)
    expect(rows![1].delta).toBe(false)
  })
  it('returns null for empty or non-array input', () => {
    expect(parseRunLog('')).toBeNull()
    expect(parseRunLog('not json')).toBeNull()
    expect(parseRunLog('{"a":1}')).toBeNull()
  })
})

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(50_000)).toBe('50s')
    expect(formatDuration(195_000)).toBe('3m 15s')
    expect(formatDuration(4_810_000)).toBe('1h 20m 10s')
  })
  it('omits zero units but keeps a lone 0s', () => {
    expect(formatDuration(3_600_000)).toBe('1h')
    expect(formatDuration(3_615_000)).toBe('1h 15s')
    expect(formatDuration(120_000)).toBe('2m')
    expect(formatDuration(0)).toBe('0s')
  })
  it('clamps negative and sub-second values', () => {
    expect(formatDuration(-5_000)).toBe('0s')
    expect(formatDuration(400)).toBe('0s')
  })
})

describe('previewCellValue', () => {
  // Shape the Web API returns for `<attribute name="inv_subject"/>` on a
  // lookup: the value lives under `_inv_subject_value`, never under the name
  // the FetchXML asked for.
  const ROW = {
    inv_keyword_txt: 'Buchungsbestaetigung',
    inv_ranking_int: 17,
    _inv_subject_value: 'c0ffee00-0000-0000-0000-000000000001',
    '_inv_subject_value@OData.Community.Display.V1.FormattedValue': 'Buchung',
    inv_topickeywordmappingtype_opt: 902120001,
    '_inv_owner_value': 'dead0000-0000-0000-0000-000000000002',
  }

  it('resolves a lookup asked for by its plain name', () => {
    expect(previewCellValue(ROW, 'inv_subject')).toBe('Buchung')
  })

  it('falls back to the raw lookup value when there is no display text', () => {
    expect(previewCellValue(ROW, 'inv_owner')).toBe(
      'dead0000-0000-0000-0000-000000000002',
    )
  })

  it('still reads plain columns', () => {
    expect(previewCellValue(ROW, 'inv_keyword_txt')).toBe('Buchungsbestaetigung')
    expect(previewCellValue(ROW, 'inv_ranking_int')).toBe('17')
  })

  it('renders a zero rather than swallowing it as empty', () => {
    expect(previewCellValue({ statecode: 0 }, 'statecode')).toBe('0')
  })

  it('is empty for an unknown column', () => {
    expect(previewCellValue(ROW, 'inv_nothing')).toBe('')
  })
})

describe('previewColumnsFromRow', () => {
  it('folds lookup keys back to their bare name and drops annotations', () => {
    expect(
      previewColumnsFromRow({
        inv_keyword_txt: 'x',
        _inv_subject_value: 'guid',
        '_inv_subject_value@OData.Community.Display.V1.FormattedValue': 'Buchung',
        '_inv_subject_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'inv_topic',
      }),
    ).toEqual(['inv_keyword_txt', 'inv_subject'])
  })

  it('keeps a column that is present in both spellings only once', () => {
    expect(
      previewColumnsFromRow({ inv_subject: 'a', _inv_subject_value: 'b' }),
    ).toEqual(['inv_subject'])
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
    deltaMode: false,
    orphanHandling: 'ignore',
  }

  it('blocks delta mode combined with orphan handling', () => {
    expect(describeEntryValidation({ ...base, deltaMode: true, orphanHandling: 'delete' })).toEqual([
      expect.stringContaining('Delta transfers cannot be combined with orphan handling'),
    ])
    expect(
      describeEntryValidation({ ...base, deltaMode: true, orphanHandling: 'deactivate' }),
    ).toHaveLength(1)
    expect(describeEntryValidation({ ...base, deltaMode: true, orphanHandling: 'ignore' })).toEqual(
      [],
    )
    // Orphan handling on its own is fine — only the combination is dangerous.
    expect(describeEntryValidation({ ...base, orphanHandling: 'delete' })).toEqual([])
  })

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

  it('caps match columns at the executor limit', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f']
    const errors = describeEntryValidation({
      ...base,
      queryMode: 'view',
      viewId: 'v1',
      matchMode: 'columns',
      matchColumns: six,
    })
    expect(errors.some((e) => e.includes(`At most ${MAX_MATCH_COLUMNS}`))).toBe(true)
    // Exactly the limit still passes.
    expect(
      describeEntryValidation({
        ...base,
        queryMode: 'view',
        viewId: 'v1',
        matchMode: 'columns',
        matchColumns: six.slice(0, MAX_MATCH_COLUMNS),
      }),
    ).toEqual([])
  })
})

describe('withDeltaCondition', () => {
  const delta = (xml: string) => withDeltaCondition(xml) ?? ''

  it('wraps an existing filter instead of appending into it', () => {
    // An <filter type="or"> would otherwise turn "changed since X" into
    // "changed since X OR whatever the author filtered for".
    const or = `<fetch><entity name="t"><filter type="or"><condition attribute="a" operator="eq" value="1"/><condition attribute="b" operator="eq" value="2"/></filter></entity></fetch>`
    const out = delta(or)
    const doc = new DOMParser().parseFromString(out, 'application/xml')
    const entity = doc.getElementsByTagName('entity')[0]
    const top = [...entity.children].filter((c) => c.tagName === 'filter')
    expect(top).toHaveLength(1)
    expect(top[0].getAttribute('type')).toBe('and')
    // The author's or-filter survives as a NESTED child of the new and-filter.
    const nested = [...top[0].children].filter((c) => c.tagName === 'filter')
    expect(nested).toHaveLength(1)
    expect(nested[0].getAttribute('type')).toBe('or')
    expect(nested[0].children).toHaveLength(2)
  })

  it('adds the condition with the placeholder as its value', () => {
    const out = delta(SIMPLE)
    expect(out).toContain(`attribute="${DELTA_ATTRIBUTE}"`)
    expect(out).toContain('operator="ge"')
    expect(out).toContain(`value="${DELTA_PLACEHOLDER}"`)
    // Exactly one hole for the executor's string replace.
    expect(out.split(DELTA_PLACEHOLDER)).toHaveLength(2)
  })

  it('works on a query that has no filter at all', () => {
    const out = delta('<fetch><entity name="t"><attribute name="a"/></entity></fetch>')
    const doc = new DOMParser().parseFromString(out, 'application/xml')
    const entity = doc.getElementsByTagName('entity')[0]
    const filters = [...entity.children].filter((c) => c.tagName === 'filter')
    expect(filters).toHaveLength(1)
    expect(filters[0].children).toHaveLength(1)
  })

  it('leaves link-entity filters where they are', () => {
    const withLink = `<fetch><entity name="t"><link-entity name="u"><filter><condition attribute="x" operator="eq" value="1"/></filter></link-entity></entity></fetch>`
    const doc = new DOMParser().parseFromString(delta(withLink), 'application/xml')
    const link = doc.getElementsByTagName('link-entity')[0]
    expect(link.getElementsByTagName('filter')).toHaveLength(1)
    expect(link.getElementsByTagName('condition')[0].getAttribute('attribute')).toBe('x')
  })

  it('keeps attributes and ordering intact', () => {
    const out = delta(SIMPLE)
    expect(fetchXmlAttributes(out)).toEqual(['cust_name', 'cust_code'])
    expect(out).toContain('<order attribute="cust_name"')
  })

  it('returns null for input it cannot rewrite', () => {
    expect(withDeltaCondition('not xml at all <')).toBeNull()
    expect(withDeltaCondition('')).toBeNull()
    expect(withDeltaCondition('<other><entity name="t"/></other>')).toBeNull()
    // Two entities: the rewriter refuses rather than guessing which one.
    expect(
      withDeltaCondition('<fetch><entity name="a"/><entity name="b"/></fetch>'),
    ).toBeNull()
  })
})

describe('parseWatermarks', () => {
  it('reads a per-target map', () => {
    expect(parseWatermarks('{"uat":"2026-08-05T09:00:00Z","prod":"2026-08-01T07:00:00Z"}')).toEqual({
      uat: '2026-08-05T09:00:00Z',
      prod: '2026-08-01T07:00:00Z',
    })
  })

  it('treats anything unreadable as no watermark', () => {
    // No watermark means a FULL transfer — always the safe direction.
    expect(parseWatermarks('')).toEqual({})
    expect(parseWatermarks(null)).toEqual({})
    expect(parseWatermarks(undefined)).toEqual({})
    expect(parseWatermarks('{broken')).toEqual({})
    expect(parseWatermarks('["uat"]')).toEqual({})
    expect(parseWatermarks('"uat"')).toEqual({})
  })

  it('drops non-string and empty stamps', () => {
    expect(parseWatermarks('{"uat":"2026-08-05T09:00:00Z","prod":7,"dev":"  "}')).toEqual({
      uat: '2026-08-05T09:00:00Z',
    })
  })
})
