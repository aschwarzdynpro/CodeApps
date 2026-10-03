// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/CrmTranslations.sample.xml?raw'
import { parseTranslationFile } from './translationFile'
import { parseView } from './viewXml'
import { parseSitemap, siteMapTitle } from './sitemapXml'
import { buildExplorer } from './designerTree'
import { buildIndex, columnRow, countRows, coverageOf, gapsOf } from './labelIndex'
import type { ComponentInfo } from '../types/translation'

const VEHICLE_FORM = 'd4000000-0000-4000-8000-000000000001'
const VEHICLE_VIEW = 'e5000000-0000-4000-8000-000000000001'
const MILEAGE = 'b2000000-0000-4000-8000-000000000004'

describe('parseView', () => {
  const layout = `<grid name="resultset" object="10012" jump="name" select="1" icon="1" preview="1">
    <row name="result" id="accountid">
      <cell name="name" width="300" />
      <cell name="telephone1" width="125" />
      <cell name="a_4107.emailaddress1" width="150" disableSorting="1" />
      <cell name="ownerid" />
    </row></grid>`
  const fetch = `<fetch version="1.0"><entity name="account"><attribute name="name" />
    <link-entity alias="a_4107" name="contact" from="contactid" to="primarycontactid" link-type="outer"><attribute name="emailaddress1" /></link-entity>
    </entity></fetch>`

  it('reads the columns and resolves link aliases to their table', () => {
    const v = parseView(layout, fetch)
    expect(v.table).toBe('account')
    expect(v.columns.map((c) => [c.attribute, c.table, c.width])).toEqual([
      ['name', 'account', 300],
      ['telephone1', 'account', 125],
      ['emailaddress1', 'contact', 150],
      ['ownerid', 'account', 100],
    ])
    expect(v.columns[2].alias).toBe('a_4107')
  })

  it('falls back to the given table without fetchxml and rejects broken layouts', () => {
    expect(parseView('<grid><row><cell name="name" width="200"/></row></grid>', '', 'pro_vehicle').columns[0].table).toBe('pro_vehicle')
    expect(() => parseView('<grid>', '')).toThrow(/layoutxml/)
  })
})

describe('parseSitemap', () => {
  const xml = `<SiteMap><Area Id="fleet" ShowGroups="true"><Titles><Title LCID="1033" Title="Fleet" /><Title LCID="1031" Title="Fuhrpark" /></Titles>
    <Group Id="master"><Titles><Title LCID="1033" Title="Master data" /></Titles>
      <SubArea Id="sub_vehicle" Entity="pro_vehicle" />
      <SubArea Id="sub_dash" Url="/main.aspx?pagetype=dashboard"><Titles><Title LCID="1033" Title="Overview" /></Titles></SubArea>
    </Group></Area><Area Id="legacy" Title="Settings"><Group Id="g" /></Area></SiteMap>`

  it('reads areas, groups and subareas with their titles', () => {
    const areas = parseSitemap(xml)
    expect(areas.map((a) => a.id)).toEqual(['fleet', 'legacy'])
    expect(areas[0].titles).toEqual({ 1033: 'Fleet', 1031: 'Fuhrpark' })
    const [vehicle, dash] = areas[0].groups[0].subareas
    expect(vehicle).toMatchObject({ entity: 'pro_vehicle', titles: {} })
    expect(dash).toMatchObject({ entity: '', url: '/main.aspx?pagetype=dashboard', titles: { 1033: 'Overview' } })
  })

  it('title in a language: own text, else base or legacy attribute', () => {
    const areas = parseSitemap(xml)
    expect(siteMapTitle(areas[0], 1031, 1033)).toEqual({ text: 'Fuhrpark', own: true })
    expect(siteMapTitle(areas[0], 1036, 1033)).toEqual({ text: 'Fleet', own: false })
    expect(siteMapTitle(areas[1], 1036, 1033)).toEqual({ text: 'Settings', own: false })
  })
})

describe('explorer and label index', () => {
  const file = parseTranslationFile(fixture)
  const components = new Map<string, ComponentInfo>([
    [VEHICLE_FORM, { table: 'pro_vehicle', name: 'Vehicle main form', kind: 'form', formType: 2 }],
    [VEHICLE_VIEW, { table: 'pro_vehicle', name: 'Active Vehicles', kind: 'view' }],
    [MILEAGE, { table: 'pro_vehicle', name: 'pro_mileage', kind: 'column' }],
  ])

  it('lists tables with their forms and views once the lookup knows them', () => {
    const tree = buildExplorer(file, components)
    expect(tree.tables.map((t) => [t.table, t.label])).toEqual([
      ['pro_inspection', 'Inspection'],
      ['pro_vehicle', 'Vehicle'],
    ])
    const vehicle = tree.tables[1]
    expect(vehicle.forms.map((f) => f.id)).toEqual([VEHICLE_FORM])
    expect(vehicle.views.map((v) => v.id)).toEqual([VEHICLE_VIEW])
    expect(vehicle.rows).toHaveLength(11)
    expect(tree.other.map((r) => r.sheet)).toEqual(['Display Strings', 'Display Strings'])
    // Without the lookup, names stay unlisted instead of guessed.
    expect(buildExplorer(file, new Map()).tables[1].forms).toEqual([])
  })

  it('finds column rows by table and logical name and counts states', () => {
    const index = buildIndex(file, components)
    expect(columnRow(index, 'pro_vehicle', 'pro_mileage')?.values[1033]).toBe('Mileage')
    expect(columnRow(index, 'pro_vehicle', 'pro_unknown')).toBeUndefined()
    const counts = countRows(index.byTable.get('pro_vehicle')!, 1031, 1033, new Set())
    expect(gapsOf(counts)).toBe(counts.missing + counts.untranslated)
    expect(counts.missing + counts.untranslated + counts.changed + counts.ok).toBe(11)
    expect(coverageOf({ missing: 0, untranslated: 0, changed: 0, ok: 0 })).toBe(100)
    expect(coverageOf({ missing: 1, untranslated: 0, changed: 1, ok: 2 })).toBe(75)
  })
})

describe('explorer on the mock solution', async () => {
  const { createMockState, mockComponents, renderTranslationXml, mockApps, mockViews } = await import('../services/mockData')
  const state = createMockState()
  const file = parseTranslationFile(renderTranslationXml(state, 'ProFleet'))
  const components = mockComponents(state.labels)

  it('lists the app, the tables with forms and views, and nothing as dashboard', () => {
    const tree = buildExplorer(file, components)
    expect(tree.apps.map((a) => a.name)).toEqual(['Fleet'])
    expect(tree.sitemaps).toHaveLength(1)
    expect(tree.tables.map((t) => t.table).sort()).toEqual(['pro_damage', 'pro_inspection', 'pro_site', 'pro_tour', 'pro_vehicle'])
    for (const t of tree.tables) {
      expect(t.forms.map((f) => f.type)).toEqual([2, 7])
      expect(t.views).toHaveLength(3)
    }
    expect(tree.dashboards).toEqual([])
  })

  it('mock app and views parse and resolve against the file', () => {
    const app = mockApps(state, tree().apps.map((a) => a.id), [])[0]
    const areas = parseSitemap(app.sitemap!.xml)
    expect(areas.map((a) => a.id)).toEqual(['fleet', 'contracts'])
    const vehicle = tree().tables.find((t) => t.table === 'pro_vehicle')!
    const [view] = mockViews(state, [vehicle.views[0].id])
    const layout = parseView(view.layoutxml, view.fetchxml, view.table)
    const index = buildIndex(file, components)
    expect(columnRow(index, 'pro_vehicle', layout.columns[0].attribute)?.values[1033]).toBe('Name')
    expect(layout.columns.at(-1)?.table).toBe('pro_vehicle')
  })

  function tree() {
    return buildExplorer(file, components)
  }
})
