// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  addControl,
  diffLayouts,
  moveControl,
  needsQuery,
  normalizeLayout,
  parseLayout,
  queryInputKeys,
  removeControl,
  updateControl,
} from './filterLayout'

const LAYOUT = `<filter>
  <controls>
    <control type="combo" source="entity" key="Site" label-id="Niederlassung" entity="pro_site" multi="true" />
	<control type="combo" source="entity" key="Roles" inactive-state="1" label-id="ScheduleAssistant.West.Roles" entity="bookableresourcecategory" multi="true" />
    <control type="combo" source="optionset" key="ResourceTypes" label-id="SB_FilterPanel_ResourceTypesFilter_Title" entity="bookableresource" attribute="resourcetype" multi="true">
      <data>
          <value id="2" />
          <value id="3" />
        </data>
      </control>
    <control type="fieldset" label-id="Advanced" collapsed="true">
      <controls><control type="boolean" key="Requirement/X" label-id="X" /></controls>
    </control>
    <control type="order" key="Orders" label-id="FilterControl_OrderLabel">
      <order name="name" entity="bookableresource" attribute="name" />
    </control>
  </controls>
</filter>`

const keys = (xml: string) => {
  const p = parseLayout(xml)
  if (!p.ok) throw new Error(p.error)
  return p.controls.map((c) => c.key ?? c.type)
}

describe('parseLayout', () => {
  it('reads top-level controls only, nested ones counted', () => {
    const p = parseLayout(LAYOUT)
    if (!p.ok) throw new Error(p.error)
    expect(p.controls.map((c) => c.key ?? c.type)).toEqual(['Site', 'Roles', 'ResourceTypes', 'fieldset', 'Orders'])
    expect(p.controls[0]).toMatchObject({ type: 'combo', source: 'entity', entity: 'pro_site', multi: true, labelId: 'Niederlassung' })
    expect(p.controls[3].nestedCount).toBe(1)
  })
  it('reports broken XML and wrong roots', () => {
    expect(parseLayout('<filter><controls>').ok).toBe(false)
    expect(parseLayout('<fetch />').ok).toBe(false)
    expect(parseLayout('').ok).toBe(false)
  })
  it('keeps an xml declaration', () => {
    const out = normalizeLayout(`<?xml version="1.0" encoding="utf-8" ?>\n${LAYOUT}`)
    expect(out.startsWith('<?xml version="1.0" encoding="utf-8" ?>\n<filter>')).toBe(true)
  })
})

describe('edits', () => {
  it('moves a control and keeps children and unknown attributes', () => {
    const out = moveControl(LAYOUT, 1, 0)
    expect(keys(out)).toEqual(['Roles', 'Site', 'ResourceTypes', 'fieldset', 'Orders'])
    expect(out).toContain('inactive-state="1"')
    expect(out).toContain('<value id="3"/>')
    expect(out).toContain('<control type="boolean" key="Requirement/X" label-id="X"/>')
  })
  it('removes and updates', () => {
    expect(keys(removeControl(LAYOUT, 0))).toEqual(['Roles', 'ResourceTypes', 'fieldset', 'Orders'])
    const out = updateControl(LAYOUT, 0, { 'label-id': 'Standort', multi: false })
    const p = parseLayout(out)
    if (!p.ok) throw new Error()
    expect(p.controls[0]).toMatchObject({ labelId: 'Standort', multi: false, entity: 'pro_site' })
  })
  it('adds new lookup/optionset filters before the sort control', () => {
    const out = addControl(LAYOUT, { kind: 'optionset', key: 'WorkerType', labelId: 'Worker Type', entity: 'bookableresource', attribute: 'msdyn_workertype', multi: false })
    expect(keys(out)).toEqual(['Site', 'Roles', 'ResourceTypes', 'fieldset', 'WorkerType', 'Orders'])
    expect(out).toContain('source="optionset"')
  })
  it('normalizing is stable', () => {
    const once = normalizeLayout(LAYOUT)
    expect(normalizeLayout(once)).toBe(once)
  })
})

describe('diffLayouts', () => {
  it('is empty for formatting-only differences', () => {
    expect(diffLayouts(LAYOUT, normalizeLayout(LAYOUT))).toEqual([])
  })
  it('reports added, changed and reordered fields by key', () => {
    let next = updateControl(LAYOUT, 0, { 'label-id': 'Standort' })
    next = moveControl(next, 1, 0)
    next = addControl(next, { kind: 'lookup', key: 'Team', labelId: 'Team', entity: 'pro_team', multi: true })
    const changes = diffLayouts(LAYOUT, next)
    expect(changes.map((c) => c.key).sort()).toEqual(['#order', 'Site', 'Team'])
  })
})

describe('query cross-check', () => {
  it('collects $input keys and flags only real filters', () => {
    const q = '<fetch><filter><condition ufx:if="$input/Site" /><x ufx:select="$input/Roles/bag" /></filter></fetch>'
    expect([...queryInputKeys(q)].sort()).toEqual(['Roles', 'Site'])
    const p = parseLayout(LAYOUT)
    if (!p.ok) throw new Error()
    expect(p.controls.filter(needsQuery).map((c) => c.key)).toEqual(['Site', 'Roles', 'ResourceTypes'])
  })
})

describe('resourceLabel', () => {
  it('translates known resource keys and leaves literal labels alone', async () => {
    const { resourceLabel } = await import('./filterLayout')
    expect(resourceLabel('ScheduleAssistant.West.Roles')).toBe('Rollen')
    expect(resourceLabel('Some.Unknown_Key')).toBe('Systemtext (wird übersetzt)')
    expect(resourceLabel('Niederlassung')).toBeNull()
    expect(resourceLabel('Worker Type')).toBeNull()
  })
})
