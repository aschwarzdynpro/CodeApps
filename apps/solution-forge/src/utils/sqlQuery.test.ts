import { describe, expect, it } from 'vitest'
import {
  describePosition,
  isoDate,
  parseSql,
  renderFetchXml,
  sqlFromTable,
  sqlToFetchXml,
  sqlWebApiUrl,
  tokenizeSql,
} from './sqlQuery'

const NOW = new Date('2026-09-14T10:00:00Z')

const fetch = (sql: string, ctx = {}) => {
  const result = sqlToFetchXml(sql, ctx, NOW)
  if (!result.ok) throw new Error(`${result.error} @${result.position}`)
  return result
}

const fails = (sql: string): string => {
  const result = sqlToFetchXml(sql, {}, NOW)
  if (result.ok) throw new Error(`expected a failure, got ${result.fetchXml}`)
  return result.error
}

describe('tokenizeSql', () => {
  it('reads strings with doubled quotes, comments and operators', () => {
    const tokens = tokenizeSql("SELECT name -- comment\nFROM account WHERE name != 'O''Neil' /* x */")
    expect(tokens.map((t) => t.v)).toEqual([
      'SELECT',
      'name',
      'FROM',
      'account',
      'WHERE',
      'name',
      '<>',
      "O'Neil",
    ])
  })

  it('reads bracketed and quoted identifiers and negative numbers', () => {
    const tokens = tokenizeSql('SELECT [name], "revenue" FROM account WHERE revenue > -5.5')
    expect(tokens.map((t) => t.v)).toEqual(['SELECT', 'name', ',', 'revenue', 'FROM', 'account', 'WHERE', 'revenue', '>', '-5.5'])
  })

  it('rejects an unterminated string', () => {
    expect(() => tokenizeSql("SELECT 'abc")).toThrow(/Unterminated/)
  })
})

describe('parseSql', () => {
  it('parses the documented example', () => {
    const parsed = parseSql("SELECT name FROM account AS a WHERE a.name LIKE 'Fourth Coffee'")
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.statement.from).toEqual({ table: 'account', alias: 'a' })
    expect(parsed.statement.where).toEqual({
      kind: 'cond',
      ref: { table: 'a', column: 'name' },
      operator: 'like',
      values: [{ kind: 'string', text: 'Fourth Coffee' }],
    })
  })

  it('parses TOP, DISTINCT, aliases without AS and ORDER BY directions', () => {
    const parsed = parseSql('SELECT DISTINCT TOP 10 name n, createdon FROM account ORDER BY name ASC, createdon DESC;')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.statement.distinct).toBe(true)
    expect(parsed.statement.top).toBe(10)
    expect(parsed.statement.columns[0].alias).toBe('n')
    expect(parsed.statement.orderBy).toEqual([
      { ref: { table: null, column: 'name' }, desc: false },
      { ref: { table: null, column: 'createdon' }, desc: true },
    ])
  })

  it('splits JOIN … ON into the equality and the extra filter', () => {
    const parsed = parseSql(
      "SELECT a.name, c.fullname FROM account AS a LEFT OUTER JOIN contact AS c ON a.accountid = c.parentcustomerid AND (c.fullname LIKE 'A%' OR c.emailaddress1 LIKE 'B%')",
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const join = parsed.statement.joins[0]
    expect(join.type).toBe('outer')
    expect(join.left).toEqual({ table: 'a', column: 'accountid' })
    expect(join.right).toEqual({ table: 'c', column: 'parentcustomerid' })
    expect(join.extra?.kind).toBe('group')
  })

  it('evaluates GETUTCDATE and DATEADD to literals', () => {
    const parsed = parseSql("SELECT name FROM account WHERE createdon >= DATEADD(day, -3, GETUTCDATE()) AND modifiedon < DATEADD(month, 1, '2023-01-01 17:00:00')", NOW)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const where = parsed.statement.where
    expect(where?.kind).toBe('group')
    if (where?.kind !== 'group') return
    expect(where.children[0]).toMatchObject({ values: [{ kind: 'date', text: '2026-09-11T10:00:00Z' }] })
    expect(where.children[1]).toMatchObject({ values: [{ kind: 'date', text: '2023-02-01T17:00:00Z' }] })
  })

  it('reports the position of a syntax error', () => {
    const parsed = parseSql('SELECT name FROM account WHERE name = ')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toMatch(/Expected a value/)
    expect(describePosition('SELECT name FROM account WHERE name = ', parsed.position)).toBe('line 1, column 39')
  })

  it.each([
    ['SELECT * FROM account', /SELECT \*/],
    ['INSERT INTO account (name) VALUES (1)', /Only SELECT/],
    ['SELECT name FROM account; SELECT fullname FROM contact', /single SELECT/],
    ['SELECT name FROM account WHERE accountid IN (SELECT accountid FROM account)', /Subqueries/],
    ['SELECT name FROM account WHERE 1 = 1', /literal-to-literal/],
    ['SELECT name FROM account WHERE modifiedon > createdon', /Column-to-column/],
    ['SELECT name FROM account WHERE DATEADD(day, 3, createdon) > GETUTCDATE()', /Functions cannot be applied to column/],
    ['SELECT name FROM account WHERE name = NULL', /IS NULL/],
    ['SELECT name FROM account RIGHT JOIN contact c ON c.parentcustomerid = account.accountid', /RIGHT JOIN/],
    ["SELECT name FROM account a INNER JOIN contact c ON c.emailaddress1 LIKE 'B%'", /exactly one/],
    ['SELECT a.name, COUNT(*) FROM account a GROUP BY a.name HAVING COUNT(*) > 1', /HAVING/],
    ['SELECT LEN(name) FROM account', /Function “LEN”/],
    ['SELECT name FROM account ORDER BY LEN(name)', /ORDER BY can only reference columns/],
    ["SELECT name FROM account WHERE NOT name = 'x'", /NOT before a condition/],
  ])('rejects %s', (sql, message) => {
    const parsed = parseSql(sql)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(message)
  })
})

describe('renderFetchXml', () => {
  it('renders a plain select with filter and order', () => {
    const { fetchXml, entity, notes } = fetch(
      "SELECT TOP 50 name, telephone1 FROM account WHERE statecode = 0 AND telephone1 IS NOT NULL ORDER BY name DESC",
    )
    expect(entity).toBe('account')
    expect(notes).toEqual([])
    expect(fetchXml).toBe(
      '<fetch top="50"><entity name="account"><attribute name="name" /><attribute name="telephone1" />' +
        '<filter type="and"><condition attribute="statecode" operator="eq" value="0" /><condition attribute="telephone1" operator="not-null" /></filter>' +
        '<order attribute="name" descending="true" /></entity></fetch>',
    )
  })

  it('wraps a single WHERE condition in a filter and escapes values', () => {
    const { fetchXml } = fetch("SELECT name FROM account WHERE name LIKE 'A&B%'")
    expect(fetchXml).toContain('<filter type="and"><condition attribute="name" operator="like" value="A&amp;B%" /></filter>')
  })

  it('renders IN, NOT IN, BETWEEN and NOT LIKE with value children', () => {
    const { fetchXml } = fetch(
      "SELECT name FROM account WHERE name IN ('Contoso', 'Fabrikam') AND revenue NOT BETWEEN 1 AND 2 AND name NOT LIKE '%test%' AND statecode NOT IN (1)",
    )
    expect(fetchXml).toContain('<condition attribute="name" operator="in"><value>Contoso</value><value>Fabrikam</value></condition>')
    expect(fetchXml).toContain('<condition attribute="revenue" operator="not-between"><value>1</value><value>2</value></condition>')
    expect(fetchXml).toContain('<condition attribute="name" operator="not-like" value="%test%" />')
    expect(fetchXml).toContain('<condition attribute="statecode" operator="not-in"><value>1</value></condition>')
  })

  it('keeps OR / AND nesting as nested filters', () => {
    const { fetchXml } = fetch("SELECT name FROM account WHERE (statecode = 0 OR statecode = 1) AND telephone1 IS NOT NULL")
    expect(fetchXml).toContain(
      '<filter type="and"><filter type="or"><condition attribute="statecode" operator="eq" value="0" /><condition attribute="statecode" operator="eq" value="1" /></filter><condition attribute="telephone1" operator="not-null" /></filter>',
    )
  })

  it('renders an inner join as a link-entity with entityname on top-level conditions', () => {
    const { fetchXml } = fetch(
      "SELECT a.name, c.fullname, c.emailaddress1 FROM account AS a INNER JOIN contact AS c ON a.accountid = c.parentcustomerid WHERE c.fullname LIKE 'A%' AND a.statecode = 0 ORDER BY c.fullname, a.name DESC",
    )
    expect(fetchXml).toBe(
      '<fetch><entity name="account"><attribute name="name" />' +
        '<link-entity name="contact" from="parentcustomerid" to="accountid" alias="c" link-type="inner"><attribute name="fullname" /><attribute name="emailaddress1" /></link-entity>' +
        '<filter type="and"><condition attribute="fullname" entityname="c" operator="like" value="A%" /><condition attribute="statecode" operator="eq" value="0" /></filter>' +
        '<order attribute="fullname" entityname="c" /><order attribute="name" descending="true" /></entity></fetch>',
    )
  })

  it('puts extra ON filters inside the link-entity and honours LEFT JOIN', () => {
    const { fetchXml } = fetch(
      "SELECT a.name, c.fullname FROM account AS a LEFT JOIN contact AS c ON a.accountid = c.parentcustomerid AND (c.fullname LIKE 'A%' OR c.emailaddress1 LIKE 'B%')",
    )
    expect(fetchXml).toContain(
      '<link-entity name="contact" from="parentcustomerid" to="accountid" alias="c" link-type="outer"><attribute name="fullname" /><filter type="or"><condition attribute="fullname" operator="like" value="A%" /><condition attribute="emailaddress1" operator="like" value="B%" /></filter></link-entity>',
    )
  })

  it('accepts the equality in either order and nests a join on a joined table', () => {
    const { fetchXml } = fetch(
      'SELECT a.name, c.fullname, u.fullname AS owner FROM account a JOIN contact c ON c.parentcustomerid = a.accountid JOIN systemuser u ON u.systemuserid = c.ownerid',
    )
    expect(fetchXml).toContain(
      '<link-entity name="contact" from="parentcustomerid" to="accountid" alias="c" link-type="inner"><attribute name="fullname" />' +
        '<link-entity name="systemuser" from="systemuserid" to="ownerid" alias="u" link-type="inner"><attribute name="fullname" alias="owner" /></link-entity></link-entity>',
    )
  })

  it('renders a self join', () => {
    const { fetchXml } = fetch(
      'SELECT child.name AS account, parent.name AS parent_account FROM account AS child INNER JOIN account AS parent ON child.parentaccountid = parent.accountid',
    )
    expect(fetchXml).toContain('<attribute name="name" alias="account" />')
    expect(fetchXml).toContain(
      '<link-entity name="account" from="accountid" to="parentaccountid" alias="parent" link-type="inner"><attribute name="name" alias="parent_account" /></link-entity>',
    )
  })

  it('renders GROUP BY with aggregates, COUNT(*) on the primary key and alias ordering', () => {
    const { fetchXml, notes } = fetch(
      'SELECT a.name, COUNT(*) AS contact_count FROM account AS a INNER JOIN contact AS c ON a.accountid = c.parentcustomerid GROUP BY a.name ORDER BY a.name',
      { primaryIdOf: (t: string) => (t === 'account' ? 'accountid' : undefined) },
    )
    expect(notes).toEqual([])
    expect(fetchXml).toBe(
      '<fetch aggregate="true"><entity name="account"><attribute name="name" alias="a_name" groupby="true" /><attribute name="accountid" alias="contact_count" aggregate="count" />' +
        '<link-entity name="contact" from="parentcustomerid" to="accountid" alias="c" link-type="inner"></link-entity>' +
        '<order alias="a_name" /></entity></fetch>',
    )
  })

  it('renders SUM/AVG/MIN/MAX and COUNT(DISTINCT), falling back to the <table>id convention', () => {
    const { fetchXml, notes } = fetch(
      'SELECT COUNT(*) AS total, SUM(revenue) AS total_revenue, AVG(revenue) avg_revenue, MIN(revenue) AS min_revenue, MAX(revenue) AS max_revenue, COUNT(DISTINCT address1_city) AS cities FROM account',
    )
    expect(notes).toEqual(['COUNT(*) counts “accountid” (the primary key by convention).'])
    expect(fetchXml).toContain('<attribute name="accountid" alias="total" aggregate="count" />')
    expect(fetchXml).toContain('<attribute name="revenue" alias="total_revenue" aggregate="sum" />')
    expect(fetchXml).toContain('<attribute name="revenue" alias="avg_revenue" aggregate="avg" />')
    expect(fetchXml).toContain('<attribute name="revenue" alias="min_revenue" aggregate="min" />')
    expect(fetchXml).toContain('<attribute name="revenue" alias="max_revenue" aggregate="max" />')
    expect(fetchXml).toContain('<attribute name="address1_city" alias="cities" aggregate="countcolumn" distinct="true" />')
  })

  it('orders an aggregate query by an output alias', () => {
    const { fetchXml } = fetch('SELECT statecode, COUNT(*) AS cnt FROM account GROUP BY statecode ORDER BY cnt DESC')
    expect(fetchXml).toContain('<order alias="cnt" descending="true" />')
  })

  it('rejects a non-grouped column in an aggregate query', () => {
    expect(fails('SELECT name, COUNT(*) FROM account GROUP BY statecode')).toMatch(/must appear in GROUP BY/)
  })

  it('adds an unselected GROUP BY column with a note', () => {
    const { fetchXml, notes } = fetch('SELECT COUNT(*) AS cnt FROM account GROUP BY statecode')
    expect(fetchXml).toContain('<attribute name="statecode" alias="statecode" groupby="true" />')
    expect(notes.some((n) => n.includes('GROUP BY “statecode” is not selected'))).toBe(true)
  })

  it('maps DISTINCT, OFFSET/FETCH to page/count and caps TOP', () => {
    const paged = fetch('SELECT DISTINCT address1_city FROM account ORDER BY address1_city OFFSET 100 ROWS FETCH NEXT 50 ROWS ONLY')
    expect(paged.fetchXml.startsWith('<fetch distinct="true" count="50" page="3">')).toBe(true)
    expect(paged.notes[0]).toMatch(/page 3 of 50 rows/)
    const capped = fetch('SELECT TOP 9000 name FROM account')
    expect(capped.fetchXml.startsWith('<fetch top="5000">')).toBe(true)
    expect(capped.notes).toEqual(['TOP is capped at 5000 rows by Dataverse.'])
    expect(fails('SELECT name FROM account OFFSET 10 ROWS FETCH NEXT 4 ROWS ONLY')).toMatch(/multiple of the FETCH size/)
    expect(fails('SELECT TOP 5 name FROM account OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY')).toMatch(/either TOP or OFFSET/)
  })

  it('renders booleans as 1/0 and dates as ISO', () => {
    const { fetchXml } = fetch("SELECT name FROM account WHERE donotemail = TRUE AND createdon >= DATEADD(day, -3, GETUTCDATE())")
    expect(fetchXml).toContain('<condition attribute="donotemail" operator="eq" value="1" />')
    expect(fetchXml).toContain('<condition attribute="createdon" operator="ge" value="2026-09-11T10:00:00Z" />')
  })

  it('accepts OData-style _x_value columns and notes the mapping', () => {
    const { fetchXml, notes } = fetch("SELECT name, _primarycontactid_value FROM account WHERE _ownerid_value = '00000000-0000-0000-0000-000000000000'")
    expect(fetchXml).toContain('<attribute name="primarycontactid" />')
    expect(fetchXml).toContain('<condition attribute="ownerid" operator="eq"')
    expect(notes).toContain('“_primarycontactid_value” was read as the lookup column “primarycontactid”.')
  })

  it('lets the bare table name qualify columns when no alias was given', () => {
    const { fetchXml } = fetch('SELECT account.name FROM account WHERE account.statecode = 0')
    expect(fetchXml).toContain('<attribute name="name" />')
    expect(fetchXml).toContain('<condition attribute="statecode" operator="eq" value="0" />')
  })

  it('rejects an unknown alias and a duplicate alias', () => {
    expect(fails('SELECT x.name FROM account a')).toMatch(/Unknown table alias “x”/)
    expect(fails('SELECT a.name FROM account a INNER JOIN contact a ON a.parentcustomerid = a.accountid')).toMatch(/used twice/)
  })

  it('rejects an extra ON filter on the wrong table', () => {
    expect(
      fails("SELECT a.name FROM account a INNER JOIN contact c ON a.accountid = c.parentcustomerid AND a.name LIKE 'A%'"),
    ).toMatch(/must address the joined table/)
  })

  it('renderFetchXml is usable on its own', () => {
    const parsed = parseSql('SELECT name FROM account')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const rendered = renderFetchXml(parsed.statement)
    expect(rendered.ok).toBe(true)
  })
})

describe('sqlFromTable', () => {
  it('reads the FROM table from a parsable statement', () => {
    expect(sqlFromTable('SELECT a.name FROM account AS a WHERE a.statecode = 0')).toBe('account')
  })

  it('falls back to a lenient scan when the parser rejects the statement', () => {
    expect(sqlFromTable('SELECT * FROM [contact] c -- from nowhere')).toBe('contact')
    expect(sqlFromTable('/* from x */ SELECT LEN(name) FROM pro_workingsolution')).toBe('pro_workingsolution')
  })

  it('returns null without a FROM', () => {
    expect(sqlFromTable('SELECT 1')).toBeNull()
  })
})

describe('helpers', () => {
  it('builds the native Web API URL', () => {
    expect(sqlWebApiUrl('https://org.crm4.dynamics.com/', 'accounts', 'SELECT name FROM account')).toBe(
      'https://org.crm4.dynamics.com/api/data/v9.2/accounts?sql=SELECT%20name%20FROM%20account',
    )
  })

  it('formats ISO dates without milliseconds', () => {
    expect(isoDate(new Date('2026-09-14T10:00:00.123Z'))).toBe('2026-09-14T10:00:00Z')
  })

  it('describes a position across lines', () => {
    expect(describePosition('SELECT\n  name\nFROM x', 12)).toBe('line 2, column 6')
  })
})
