import { describe, expect, it } from 'vitest'
import { createMockState, mockComponents, renderTranslationXml } from '../../services/mockData'
import { buildExplorer } from '../../utils/designerTree'
import { parseTranslationFile } from '../../utils/translationFile'
import { crumbsFor, parentOf } from './crumbs'

const state = createMockState()
const tree = buildExplorer(parseTranslationFile(renderTranslationXml(state, 'ProFleet')), mockComponents(state.labels))
const vehicle = tree.tables.find((t) => t.table === 'pro_vehicle')!

describe('breadcrumb', () => {
  it('leads from a form back to its table and the overview, with the neighbours to switch to', () => {
    const form = vehicle.forms[0]
    const trail = crumbsFor({ kind: 'form', table: 'pro_vehicle', id: form.id }, tree)!
    expect(trail.path.map((c) => c.target.kind)).toEqual(['home', 'table'])
    expect(trail.path[1]).toMatchObject({ label: 'Vehicle', sub: 'pro_vehicle' })
    expect(trail.current).toBe('Hauptformular')
    expect(trail.siblings.map((g) => g.items.length)).toEqual([1, vehicle.forms.length, vehicle.views.length])
    expect(trail.siblings.flatMap((g) => g.items).some((i) => i.key === trail.currentKey)).toBe(true)
    expect(parentOf(trail)).toEqual({ kind: 'table', table: 'pro_vehicle' })
  })

  it('a table goes up to the overview, the overview has no trail', () => {
    const trail = crumbsFor({ kind: 'table', table: 'pro_vehicle' }, tree)!
    expect(trail.current).toBe('Tabelle & Spalten')
    expect(parentOf(trail)).toEqual({ kind: 'home' })
    expect(crumbsFor({ kind: 'home' }, tree)).toBeNull()
    expect(parentOf(null)).toBeNull()
  })

  it('a single app has nothing to switch to', () => {
    const trail = crumbsFor({ kind: 'app', id: tree.apps[0].id }, tree)!
    expect(trail.path.map((c) => c.target.kind)).toEqual(['home'])
    expect(trail.siblings).toEqual([])
  })
})
