// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ColumnMeta, EntityMeta, EntityRef, ODataQuery } from '../types/odataBrowser'
import { newCondition, newGroup } from './odataFilter'
import { columnMap, emptyQuery } from './odataQuery'
import { sqlToFetchXml } from './sqlQuery'
import {
  fetchXmlToSql,
  likeEscape,
  odataToSql,
  shortAlias,
  sqlLiteral,
  withNoteHeader,
} from './sqlTranslate'

const NOW = new Date('2026-09-14T10:00:00Z')

const ref = (
  logicalName: string,
  entitySet: string,
  primaryIdAttribute: string,
  primaryNameAttribute: string,
): EntityRef => ({
  logicalName,
  schemaName: logicalName,
  entitySet,
  displayName: logicalName,
  displayCollectionName: entitySet,
  primaryIdAttribute,
  primaryNameAttribute,
  objectTypeCode: 1,
  isPrivate: false,
  isActivity: false,
  isCustomEntity: false,
  isManaged: true,
})

const column = (logicalName: string, kind: ColumnMeta['kind'], selectName = logicalName): ColumnMeta => ({
  logicalName,
  displayName: logicalName,
  attributeType: 'String',
  attributeTypeName: 'StringType',
  attributeOf: null,
  isValidForRead: true,
  isValidForCreate: true,
  isValidForUpdate: true,
  isValidForAdvancedFind: true,
  isPrimaryId: false,
  isPrimaryName: false,
  kind,
  selectName,
  selectable: true,
  unselectableReason: null,
})

const ACCOUNT: EntityMeta = {
  ref: ref('account', 'accounts', 'accountid', 'name'),
  columns: [
    column('accountid', 'guid'),
    column('name', 'string'),
    column('revenue', 'money'),
    column('statecode', 'choice'),
    column('createdon', 'datetime'),
    column('donotemail', 'boolean'),
    column('primarycontactid', 'lookup', '_primarycontactid_value'),
    column('ownerid', 'lookup', '_ownerid_value'),
  ],
  lookups: [
    { navigationName: 'primarycontactid', valueColumn: '_primarycontactid_value', targetEntity: 'contact' },
  ],
}

const ENTITIES: EntityRef[] = [ACCOUNT.ref, ref('contact', 'contacts', 'contactid', 'fullname')]

const ctx = { columns: columnMap(ACCOUNT), meta: ACCOUNT, entities: ENTITIES, now: NOW }

const query = (overrides: Partial<ODataQuery>): ODataQuery => ({
  ...emptyQuery('accounts'),
  ...overrides,
})

describe('odataToSql', () => {
  it('translates select, typed filter, order and top', () => {
    const q = query({
      select: ['accountid', 'name', '_primarycontactid_value'],
      filter: newGroup('and', [
        { ...newCondition('statecode', 'eq'), values: ['0'] },
        { ...newCondition('name', 'contains'), values: ['Fourth'] },
        { ...newCondition('revenue', 'between'), values: ['100', '200'] },
      ]),
      orderBy: [{ column: 'name', desc: true }],
      top: 50,
    })
    const { sql, notes } = odataToSql(q, ctx)
    expect(notes).toEqual([])
    expect(sql).toBe(
      'SELECT TOP 50 accountid, name, primarycontactid\nFROM account\n' +
        "WHERE statecode = 0 AND name LIKE '%Fourth%' AND revenue BETWEEN 100 AND 200\nORDER BY name DESC",
    )
  })

  it('parenthesises nested groups and renders IN / null checks / dates', () => {
    const q = query({
      select: ['name'],
      filter: newGroup('and', [
        newGroup('or', [
          { ...newCondition('statecode', 'in'), values: ['0', '1'] },
          newCondition('primarycontactid', 'null'),
        ]),
        { ...newCondition('createdon', 'lastxdays'), values: ['7'] },
        newCondition('createdon', 'thismonth'),
      ]),
      top: 10,
    })
    const { sql } = odataToSql(q, ctx)
    expect(sql).toContain(
      "WHERE (statecode IN (0, 1) OR primarycontactid IS NULL) AND createdon >= DATEADD(day, -7, GETUTCDATE()) AND (createdon >= '2026-09-01T00:00:00Z' AND createdon < '2026-10-01T00:00:00Z')",
    )
  })

  it('drops what SQL cannot say and says so', () => {
    const q = query({
      select: ['name'],
      filter: newGroup('and', [
        newCondition('_ownerid_value', 'equaluserid'),
        { ...newCondition('name', 'startswith'), values: ['A_'] },
      ]),
      top: 5,
    })
    const { sql, notes } = odataToSql(q, ctx)
    expect(sql).toContain("WHERE name LIKE 'A[_]%'")
    expect(notes).toEqual(['Dropped condition “_ownerid_value equaluserid” (EqualUserId — SQL has no current-user context).'])
  })

  it('keeps a raw filter out and notes it, and explains a missing $select', () => {
    const q = query({ select: [], filter: null, filterRaw: "roles/any(r:r/name eq 'x')", top: 5 })
    const { sql, notes } = odataToSql(q, ctx)
    expect(sql).toBe('SELECT TOP 5 accountid, name\nFROM account')
    expect(notes[0]).toMatch(/No \$select/)
    expect(notes[1]).toMatch(/Dropped the raw \$filter/)
  })

  it('turns $expand into a LEFT JOIN with a qualified main table', () => {
    const q = query({
      select: ['name', '_primarycontactid_value'],
      expandRaw: 'primarycontactid($select=fullname,emailaddress1)',
      orderBy: [{ column: 'name', desc: false }],
      top: 5,
    })
    const { sql, notes } = odataToSql(q, ctx)
    expect(notes).toEqual([])
    expect(sql).toBe(
      'SELECT TOP 5 a.name, a.primarycontactid, primarycontactid.fullname, primarycontactid.emailaddress1\n' +
        'FROM account AS a\n' +
        'LEFT JOIN contact AS primarycontactid ON a.primarycontactid = primarycontactid.contactid\n' +
        'ORDER BY a.name',
    )
  })

  it('joins only the primary name when $expand has no $select, and drops unknown navs', () => {
    const q = query({ select: ['name'], expandRaw: 'primarycontactid,ghostnav', top: 5 })
    const { sql, notes } = odataToSql(q, ctx)
    expect(sql).toContain('primarycontactid.fullname')
    expect(notes).toContain('$expand=primarycontactid had no $select — joined only “fullname” (SELECT * is not supported).')
    expect(notes.some((n) => n.startsWith('Dropped $expand=ghostnav'))).toBe(true)
  })

  it('notes paging when there is no $top', () => {
    const { notes } = odataToSql(query({ select: ['name'] }), ctx)
    expect(notes.some((n) => n.startsWith('Paging:'))).toBe(true)
  })

  it('produces SQL the SQL tab can run', () => {
    const q = query({
      select: ['name', '_primarycontactid_value'],
      filter: newGroup('and', [{ ...newCondition('statecode', 'eq'), values: ['0'] }]),
      expandRaw: 'primarycontactid($select=fullname)',
      top: 5,
    })
    const { sql } = odataToSql(q, ctx)
    const rendered = sqlToFetchXml(sql, {}, NOW)
    expect(rendered.ok).toBe(true)
    if (!rendered.ok) return
    expect(rendered.fetchXml).toContain('<link-entity name="contact" from="contactid" to="primarycontactid" alias="primarycontactid" link-type="outer">')
    expect(rendered.fetchXml).toContain('<condition attribute="statecode" operator="eq" value="0" />')
  })
})

describe('fetchXmlToSql', () => {
  it('translates attributes, filters, order and top', () => {
    const result = fetchXmlToSql(
      '<fetch top="50"><entity name="account"><attribute name="name" /><attribute name="telephone1" />' +
        '<filter type="and"><condition attribute="statecode" operator="eq" value="0" /><condition attribute="telephone1" operator="not-null" /></filter>' +
        '<order attribute="name" descending="true" /></entity></fetch>',
      NOW,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.notes).toEqual([])
    expect(result.sql).toBe('SELECT TOP 50 name, telephone1\nFROM account\nWHERE statecode = 0 AND telephone1 IS NOT NULL\nORDER BY name DESC')
  })

  it('translates link-entities into joins with aliases and ON filters', () => {
    const result = fetchXmlToSql(
      '<fetch><entity name="account"><attribute name="name" />' +
        '<link-entity name="contact" from="parentcustomerid" to="accountid" alias="c" link-type="outer"><attribute name="fullname" />' +
        '<filter><condition attribute="fullname" operator="like" value="B%" /></filter>' +
        '<link-entity name="systemuser" from="systemuserid" to="ownerid" link-type="inner"><attribute name="fullname" alias="owner" /></link-entity>' +
        '</link-entity>' +
        '<filter type="and"><condition entityname="c" attribute="statecode" operator="eq" value="0" /><condition attribute="name" operator="begins-with" value="A" /></filter>' +
        '<order attribute="fullname" entityname="c" /></entity></fetch>',
      NOW,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sql).toBe(
      'SELECT a.name, c.fullname, s.fullname AS owner\nFROM account AS a\n' +
        "LEFT JOIN contact AS c ON a.accountid = c.parentcustomerid AND c.fullname LIKE 'B%'\n" +
        'INNER JOIN systemuser AS s ON c.ownerid = s.systemuserid\n' +
        "WHERE c.statecode = 0 AND a.name LIKE 'A%'\nORDER BY c.fullname",
    )
  })

  it('translates aggregates, groupby and alias ordering', () => {
    const result = fetchXmlToSql(
      '<fetch aggregate="true" distinct="false"><entity name="account"><attribute name="name" alias="a_name" groupby="true" /><attribute name="accountid" alias="cnt" aggregate="count" /><attribute name="revenue" alias="total" aggregate="sum" /><attribute name="address1_city" alias="cities" aggregate="countcolumn" distinct="true" /><order alias="cnt" descending="true" /></entity></fetch>',
      NOW,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sql).toBe(
      'SELECT name AS a_name, COUNT(*) AS cnt, SUM(revenue) AS total, COUNT(DISTINCT address1_city) AS cities\nFROM account\nGROUP BY name\nORDER BY cnt DESC',
    )
  })

  it('maps in/between value children and date shortcuts', () => {
    const result = fetchXmlToSql(
      '<fetch><entity name="account"><attribute name="name" /><filter type="or">' +
        '<condition attribute="statecode" operator="in"><value>0</value><value>1</value></condition>' +
        '<condition attribute="revenue" operator="between"><value>1</value><value>5</value></condition>' +
        '<condition attribute="createdon" operator="last-x-days" value="30" />' +
        '<condition attribute="createdon" operator="today" />' +
        '<condition attribute="modifiedon" operator="olderthan-x-months" value="2" />' +
        '</filter></entity></fetch>',
      NOW,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sql).toContain(
      "WHERE statecode IN (0, 1) OR revenue BETWEEN 1 AND 5 OR createdon >= DATEADD(day, -30, GETUTCDATE()) OR (createdon >= '2026-09-14T00:00:00Z' AND createdon < '2026-09-15T00:00:00Z') OR modifiedon < DATEADD(month, -2, GETUTCDATE())",
    )
  })

  it('drops user-context operators with a note and keeps the rest', () => {
    const result = fetchXmlToSql(
      '<fetch><entity name="account"><attribute name="name" /><filter><condition attribute="ownerid" operator="eq-userid" /><condition attribute="statecode" operator="eq" value="0" /></filter></entity></fetch>',
      NOW,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sql).toContain('WHERE statecode = 0')
    expect(result.notes).toEqual(['Dropped condition “ownerid eq-userid” (no SQL equivalent — user/team/hierarchy/fiscal operators need FetchXML).'])
  })

  it('turns count/page into OFFSET … FETCH and all-attributes into a noted SELECT *', () => {
    const result = fetchXmlToSql('<fetch count="50" page="3"><entity name="account"><all-attributes /></entity></fetch>', NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sql).toBe('SELECT *\nFROM account\nORDER BY accountid\nOFFSET 100 ROWS FETCH NEXT 50 ROWS ONLY')
    expect(result.notes.some((n) => n.includes('SELECT *'))).toBe(true)
    expect(result.notes.some((n) => n.includes('OFFSET'))).toBe(true)
  })

  it('reports malformed input', () => {
    expect(fetchXmlToSql('<fetch><entity></fetch>', NOW)).toEqual({ ok: false, error: 'Not well-formed XML.' })
    expect(fetchXmlToSql('<entity name="account" />', NOW)).toMatchObject({ ok: false })
    expect(fetchXmlToSql('', NOW)).toEqual({ ok: false, error: 'FetchXML is empty.' })
  })

  it('round-trips a joined query through the SQL tab', () => {
    const result = fetchXmlToSql(
      '<fetch top="2"><entity name="account"><attribute name="name" /><link-entity name="contact" from="parentcustomerid" to="accountid" alias="c" link-type="inner"><attribute name="fullname" /></link-entity><filter><condition entityname="c" attribute="fullname" operator="like" value="A%" /></filter></entity></fetch>',
      NOW,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const back = sqlToFetchXml(result.sql, {}, NOW)
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.fetchXml).toBe(
      '<fetch top="2"><entity name="account"><attribute name="name" /><link-entity name="contact" from="parentcustomerid" to="accountid" alias="c" link-type="inner"><attribute name="fullname" /></link-entity><filter type="and"><condition attribute="fullname" entityname="c" operator="like" value="A%" /></filter></entity></fetch>',
    )
  })
})

describe('helpers', () => {
  it('quotes literals by kind', () => {
    expect(sqlLiteral('number', '5')).toBe('5')
    expect(sqlLiteral('string', "O'Neil")).toBe("'O''Neil'")
    expect(sqlLiteral('boolean', 'true')).toBe('1')
    expect(sqlLiteral('lookup', 'ABCDEF00-0000-0000-0000-000000000000')).toBe("'abcdef00-0000-0000-0000-000000000000'")
  })

  it('escapes LIKE wildcards', () => {
    expect(likeEscape('50%_[x]')).toBe('50[%][_][[]x]')
  })

  it('writes notes as comment lines', () => {
    expect(withNoteHeader('SELECT 1', ['a', 'b'])).toBe('-- a\n-- b\nSELECT 1')
    expect(withNoteHeader('SELECT 1', [])).toBe('SELECT 1')
  })

  it('picks short unique aliases after the publisher prefix', () => {
    const taken = new Set<string>()
    expect(shortAlias('account', taken)).toBe('a')
    expect(shortAlias('pro_activity', taken)).toBe('a2')
    expect(shortAlias('contact', taken)).toBe('c')
  })
})
