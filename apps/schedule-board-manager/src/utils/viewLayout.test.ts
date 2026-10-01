import { describe, expect, it } from 'vitest'
import { viewColumns } from './viewLayout'
import { mockViewDefinition } from '../services/mockData'

describe('viewColumns', () => {
  it('reads cells in order and resolves link aliases', () => {
    const layout = '<grid><row><cell name="name" width="200"/><cell name="a_1.msdyn_name" width="100"/><cell name="x" ishidden="1"/></row></grid>'
    const fetch = '<fetch><entity name="bookableresourcebooking"><link-entity name="msdyn_workorder" alias="a_1" from="a" to="b"/></entity></fetch>'
    expect(viewColumns(layout, fetch, 'bookableresourcebooking')).toEqual([
      { name: 'name', entity: 'bookableresourcebooking', attribute: 'name', width: 200 },
      { name: 'a_1.msdyn_name', entity: 'msdyn_workorder', attribute: 'msdyn_name', width: 100 },
    ])
  })
  it('works on the mock views', () => {
    const def = mockViewDefinition('10000000-0000-4000-8000-000000000001')!
    const cols = viewColumns(def.layoutXml, def.fetchXml, def.entity)
    expect(cols.at(-1)).toMatchObject({ entity: 'msdyn_workorder', attribute: 'msdyn_serviceaccount' })
  })
  it('tolerates missing XML', () => {
    expect(viewColumns(null, null, 'x')).toEqual([])
  })
})
