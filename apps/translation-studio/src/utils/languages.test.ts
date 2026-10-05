import { describe, expect, it } from 'vitest'
import { componentKind, isTableName } from './languages'

// Row shapes as in a real export of Waldmann D365 DEV (2026-10-03).
describe('componentKind', () => {
  it('tables, columns, form elements and form/view names under a logical table name', () => {
    expect(componentKind('contact', 'LocalizedName')).toBe('table')
    expect(componentKind('contact', 'LocalizedCollectionName')).toBe('table')
    // Another object's name in the table's group: a record type of a "type" column.
    expect(componentKind('queueitem', 'LocalizedName', false)).toBe('choice')
    expect(componentKind('queueitem', 'LocalizedName', true)).toBe('table')
    expect(componentKind('contact', 'Description', true)).toBe('table')
    expect(componentKind('contact', 'Description')).toBe('column')
    expect(componentKind('contact', 'DisplayName')).toBe('column')
    expect(componentKind('contact', 'displayname')).toBe('form')
    expect(componentKind('contact', 'name')).toBe('form')
    expect(componentKind('contact', 'description')).toBe('form')
    expect(componentKind('contact', 'CustomLabel')).toBe('other')
    expect(componentKind('appaction', 'buttonlabeltext')).toBe('other')
  })

  it('solution, publisher, ribbon and friends are "other"; dashboards (display names) are forms', () => {
    expect(componentKind('Solution', 'friendlyname')).toBe('other')
    expect(componentKind('RibbonCustomization', 'Ribbon.HomepageGrid.account.Add.AddToList')).toBe('other')
    expect(componentKind('Workflow Categories', 'name')).toBe('other')
    expect(componentKind('CustomAPI', 'displayname')).toBe('other')
    expect(componentKind('Dashboard GVL', 'displayname')).toBe('form')
    expect(componentKind('Dashboard GVL', 'name')).toBe('form')
    expect(componentKind('', 'DisplayName')).toBe('other')
  })

  it('logical names', () => {
    expect(isTableName('wal_project')).toBe(true)
    expect(isTableName('msdyn_workorder')).toBe(true)
    expect(isTableName('Solution')).toBe(false)
    expect(isTableName('Dashboard GVL')).toBe(false)
  })
})
