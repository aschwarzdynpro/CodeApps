import { describe, expect, it } from 'vitest'
import { createMockBoards } from '../services/mockData'
import { SHARE_TYPE, type Board } from '../types/board'
import {
  applySelection,
  buildCopyContent,
  changedFields,
  configUsers,
  diffContent,
  nextOrderNumber,
  planOwnerChange,
  protectionOf,
} from './boardRules'
import { getAt, parseSettings, setAt, serializeSettings } from './settingsModel'

const boards = createMockBoards()
const byName = (name: string): Board => boards.find((b) => b.name === name)!

describe('protectionOf', () => {
  it('locks system boards completely', () => {
    const p = protectionOf(byName('Default'))
    expect(p).toMatchObject({ canDelete: false, canDisable: false, canRename: false })
  })
  it('locks fixed system IDs even with a changed share type', () => {
    const p = protectionOf({ id: 'DD3E0B8D-5DD9-4546-B081-BBF5AC4A0FB9', name: 'x', shareType: SHARE_TYPE.everyone })
    expect(p.canDelete).toBe(false)
  })
  it('keeps the initial public view (share type "Just me") from deletion only', () => {
    const p = protectionOf(byName('Initial public view'))
    expect(p).toMatchObject({ canDelete: false, canDisable: true })
    expect(protectionOf({ id: '1', name: 'Erste öffentliche Ansicht', shareType: SHARE_TYPE.justMe }).canDelete).toBe(false)
  })
  it('allows everything on ordinary boards', () => {
    expect(protectionOf(byName('Disposition Nord'))).toMatchObject({ canDelete: true, canDisable: true, canRename: true })
  })
})

describe('buildCopyContent', () => {
  it('keeps the configuration lookups (the FastTrack control drops them)', () => {
    const src = byName('Disposition Nord')
    const copy = buildCopyContent(src, { name: 'Kopie' }, 9)
    expect(copy.lookups).toEqual(src.content.lookups)
    expect(copy.lookups.msdyn_filterlayout).not.toBeNull()
  })
  it('copies settings and filter values verbatim and renames', () => {
    const src = byName('Disposition Nord')
    const copy = buildCopyContent(src, { name: '  Kopie  ' }, 9)
    expect(copy.settings).toBe(src.content.settings)
    expect(copy.filterValues).toBe(src.content.filterValues)
    expect(copy.columns.msdyn_tabname).toBe('Kopie')
  })
  it('never produces a system board', () => {
    const copy = buildCopyContent(byName('Default'), { name: 'Kopie' }, 9)
    expect(copy.columns.msdyn_sharetype).toBe(SHARE_TYPE.everyone)
  })
  it('honours an explicit share type and order placement', () => {
    const src = byName('Disposition Nord')
    const copy = buildCopyContent(src, { name: 'K', shareType: SHARE_TYPE.justMe, appendToEnd: true }, 9)
    expect(copy.columns.msdyn_sharetype).toBe(SHARE_TYPE.justMe)
    expect(copy.columns.msdyn_ordernumber).toBe(9)
    expect(nextOrderNumber(boards)).toBe(5)
  })
})

describe('diffContent', () => {
  it('is empty for identical content, also when JSON key order differs', () => {
    const b = byName('Disposition Nord')
    const parsed = parseSettings(b.content.settings)
    if (!parsed.ok) throw new Error()
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(parsed.value).reverse()))
    expect(diffContent(b.content, { ...b.content, settings: reordered })).toEqual([])
  })
  it('reports settings changes at leaf level with labels', () => {
    const b = byName('Disposition Nord')
    const parsed = parseSettings(b.content.settings)
    if (!parsed.ok) throw new Error()
    const next = { ...b.content, settings: serializeSettings(setAt(parsed.value, ['WorkHours', 'start'], 5)) }
    const changes = diffContent(b.content, next)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ area: 'settings', key: 'WorkHours.start', label: 'Arbeitszeit von (Stunde)', before: 6, after: 5 })
    expect(changedFields(changes)).toEqual({ columns: [], lookups: [], settings: true, filterValues: false })
  })
  it('compares lookups case-insensitively', () => {
    const b = byName('Disposition Nord')
    const upper = { ...b.content.lookups, msdyn_filterlayout: b.content.lookups.msdyn_filterlayout!.toUpperCase() }
    expect(diffContent(b.content, { ...b.content, lookups: upper })).toEqual([])
  })
})

describe('applySelection', () => {
  it('transfers only the selected fields', () => {
    const template = byName('Disposition Nord').content
    const target = byName('Disposition Süd').content
    const result = applySelection(target, template, {
      columns: ['msdyn_notbookedcolor'],
      lookups: ['msdyn_retrieveresourcesquery'],
      settingsPaths: [['UnscheduledTabs']],
      filterValues: false,
    })
    const s = parseSettings(result.settings)
    if (!s.ok) throw new Error()
    expect(getAt(s.value, ['UnscheduledTabs'])).toHaveLength(3)
    expect(getAt(s.value, ['WorkHours', 'start'])).toBe(7) // untouched
    expect(result.filterValues).toBe(target.filterValues)
    const changes = diffContent(target, result).map((c) => c.key)
    expect(changes.every((k) => k.startsWith('UnscheduledTabs'))).toBe(true)
  })
})

describe('planOwnerChange', () => {
  const mara = { id: 'B0000000-0000-4000-8000-000000000001', type: 'user' as const, name: 'Mara Lindqvist' }
  it('skips system boards and boards the new owner already has', () => {
    const ids = ['Default', 'Disposition Nord', 'Disposition Süd'].map((n) => byName(n).id)
    expect(planOwnerChange(boards, ids, mara).map((r) => [r.board.name, r.status])).toEqual([
      ['Default', 'protected'],
      ['Disposition Nord', 'same'],
      ['Disposition Süd', 'change'],
    ])
  })
  it('ignores unknown ids', () => {
    expect(planOwnerChange(boards, ['nope'], mara)).toEqual([])
  })
})

describe('configUsers', () => {
  it('counts direct users and boards inheriting from the Default board', () => {
    const summaries = createMockBoards()
    const defaultCell = summaries.find((b) => b.name === 'Default')!.lookups.msdyn_resourcecelltemplate
    const names = (id: string) => configUsers(summaries, 'msdyn_resourcecelltemplate', id, defaultCell).map((b) => b.name)
    // "Initial public view" has no own template and inherits the Default board's.
    expect(names(defaultCell!)).toEqual(['Default', 'Initial public view', 'Disposition Süd', 'Montage Großprojekte', 'Agrar (alt)'])
    const crew = summaries.find((b) => b.name === 'Disposition Nord')!.lookups.msdyn_resourcecelltemplate!
    expect(names(crew)).toEqual(['Disposition Nord'])
  })
})
