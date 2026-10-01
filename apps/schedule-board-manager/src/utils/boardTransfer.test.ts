import { describe, expect, it } from 'vitest'
import {
  MOCK_BOOKING_SETUPS,
  MOCK_RECORDS,
  MOCK_TIME_ZONES,
  MOCK_VIEWS,
  createMockBoards,
  createMockConfigDetails,
} from '../services/mockData'
import { SHARE_TYPE, type Board } from '../types/board'
import {
  buildIdMap,
  buildPackage,
  collectRefs,
  compactWhere,
  composeContent,
  parsePackage,
  planImport,
  samePayload,
  type BoardPackage,
  type TargetData,
} from './boardTransfer'
import { parseSettings } from './settingsModel'

const boards = createMockBoards()
const byName = (name: string): Board => boards.find((b) => b.name === name)!
const configs = createMockConfigDetails()

function exportOf(board: Board): BoardPackage {
  return buildPackage(board, {
    configs: configs.map(({ id, name, type, value }) => ({ id, name, type, value })),
    views: MOCK_VIEWS,
    bookingSetups: MOCK_BOOKING_SETUPS,
    timeZones: MOCK_TIME_ZONES,
    records: MOCK_RECORDS.map((r) => ({ ...r })),
    orgUrl: 'https://source.example',
    now: '2026-10-01T12:00:00Z',
  })
}

/** Same environment: everything exists under the same ID. */
function sameEnv(): TargetData {
  return {
    configs,
    views: MOCK_VIEWS,
    bookingSetups: MOCK_BOOKING_SETUPS,
    timeZones: MOCK_TIME_ZONES,
    records: new Map(MOCK_RECORDS.map((r) => [r.id, { id: r.id, matchedBy: 'id' as const }])),
    checkedEntities: new Set(['territory', 'businessunit']),
  }
}

/** Another environment: same names, new IDs (prefix swapped). */
const moved = (id: string) => `f${id.slice(1)}`
function otherEnv(): TargetData {
  return {
    configs: configs.map((c) => ({ id: moved(c.id), name: c.name, type: c.type })),
    views: MOCK_VIEWS.map((v) => ({ ...v, id: moved(v.id) })),
    bookingSetups: MOCK_BOOKING_SETUPS.map((b) => ({ ...b, id: moved(b.id) })),
    timeZones: MOCK_TIME_ZONES,
    records: new Map(MOCK_RECORDS.map((r) => [r.id, { id: moved(r.id), matchedBy: 'name' as const }])),
    checkedEntities: new Set(['territory', 'businessunit']),
  }
}

const opts = { name: 'Import', shareType: SHARE_TYPE.everyone, order: 9, includeFilterValues: true }

describe('collectRefs', () => {
  it('finds views, configurations, booking setups, time zone and filter records', () => {
    const refs = collectRefs(byName('Disposition Süd').content)
    const kinds = new Set(refs.map((r) => r.kind))
    expect([...kinds].sort()).toEqual(['bookingSetup', 'config', 'record', 'timeZone', 'view'])
    expect(refs.filter((r) => r.kind === 'record').map((r) => r.entity).sort()).toEqual(['businessunit', 'territory'])
    // SA configuration IDs inside SlotMetadataCollection count as configurations.
    expect(refs.some((r) => r.kind === 'config' && r.where.includes('Schedule-Typ'))).toBe(true)
  })
})

describe('package', () => {
  it('round-trips and carries payloads and names', () => {
    const pkg = exportOf(byName('Disposition Süd'))
    const parsed = parsePackage(JSON.stringify(pkg))
    expect(parsed.ok && !parsed.legacy).toBe(true)
    expect(pkg.configs.every((c) => c.value !== null)).toBe(true)
    expect(pkg.records.map((r) => r.name).sort()).toEqual(['Region Süd', 'Service'])
    // Only what the board uses.
    expect(pkg.views.length).toBeLessThan(MOCK_VIEWS.length)
  })
  it('reads the old bare-board export', () => {
    const b = byName('Disposition Nord')
    const parsed = parsePackage(JSON.stringify(b))
    expect(parsed.ok && parsed.legacy).toBe(true)
    if (parsed.ok) expect(parsed.pkg.configs.every((c) => c.value === null)).toBe(true)
  })
  it('rejects foreign files', () => {
    expect(parsePackage('{"foo":1}').ok).toBe(false)
    expect(parsePackage('nope').ok).toBe(false)
  })
})

describe('import', () => {
  it('maps everything by ID in the same environment and keeps the content', () => {
    const pkg = exportOf(byName('Disposition Süd'))
    const plan = planImport(pkg, sameEnv())
    expect(plan.refs.every((r) => r.status === 'id')).toBe(true)
    expect(plan.configs.every((c) => c.action === 'use' && c.matchedBy === 'id')).toBe(true)
    const content = composeContent(pkg, buildIdMap(plan, new Map()), opts)
    expect(parseSettings(content.settings)).toEqual(parseSettings(pkg.board.content.settings))
    expect(parseSettings(content.filterValues)).toEqual(parseSettings(pkg.board.content.filterValues))
    expect(content.columns.msdyn_tabname).toBe('Import')
  })

  it('maps by name in another environment and rewrites every ID', () => {
    const pkg = exportOf(byName('Disposition Süd'))
    const plan = planImport(pkg, otherEnv())
    expect(plan.refs.filter((r) => r.kind !== 'timeZone').every((r) => r.status === 'name')).toBe(true)
    expect(plan.configs.every((c) => c.matchedBy === 'name')).toBe(true)
    const content = composeContent(pkg, buildIdMap(plan, new Map()), opts)
    const text = JSON.stringify(content)
    for (const r of plan.refs.filter((x) => x.kind !== 'timeZone')) {
      expect(text).not.toContain(r.sourceId)
      expect(text).toContain(r.targetId!)
    }
    for (const c of plan.configs) expect(text).toContain(moved(c.source.id))
  })

  it('drops schedule types, panels and filter records that have no target', () => {
    const pkg = exportOf(byName('Disposition Süd'))
    const target = otherEnv()
    target.bookingSetups = target.bookingSetups.filter((b) => b.entity !== 'msdyn_project')
    target.views = target.views.filter((v) => v.name !== 'Offene Anforderungen Montage' && v.name !== 'Ressourcen-Tooltip')
    target.records.delete(MOCK_RECORDS[2].id)
    const plan = planImport(pkg, target)
    const content = composeContent(pkg, buildIdMap(plan, new Map()), opts)
    const s = parseSettings(content.settings)
    const before = parseSettings(pkg.board.content.settings)
    if (!s.ok || !before.ok) throw new Error('settings')
    expect((s.value.SlotMetadataCollection as unknown[]).length).toBe((before.value.SlotMetadataCollection as unknown[]).length - 1)
    expect(content.columns.msdyn_schedulerresourcetooltipview).toBeNull()
    const f = parseSettings(content.filterValues)
    expect(f.ok && f.value.BusinessUnits).toEqual([])
  })

  it('creates missing configurations and points lookups and SA IDs at them', () => {
    const pkg = exportOf(byName('Disposition Süd'))
    const target = otherEnv()
    target.configs = []
    const plan = planImport(pkg, target)
    expect(plan.configs.every((c) => c.action === 'create')).toBe(true)
    const created = new Map(plan.configs.map((c, i) => [c.source.id.toLowerCase(), `cccccccc-0000-4000-8000-00000000000${i}`]))
    const content = composeContent(pkg, buildIdMap(plan, created), opts)
    const text = JSON.stringify(content)
    for (const id of created.values()) expect(text).toContain(id)
  })

  it('never imports a system board as system', () => {
    const pkg = exportOf(byName('Default'))
    const content = composeContent(pkg, buildIdMap(planImport(pkg, sameEnv()), new Map()), { ...opts, shareType: SHARE_TYPE.system })
    expect(content.columns.msdyn_sharetype).toBe(SHARE_TYPE.everyone)
  })

  it('can leave the saved filter values out', () => {
    const pkg = exportOf(byName('Disposition Süd'))
    const content = composeContent(pkg, buildIdMap(planImport(pkg, sameEnv()), new Map()), { ...opts, includeFilterValues: false })
    expect(content.filterValues).toBeNull()
  })
})

describe('samePayload', () => {
  it('ignores whitespace between tags', () => {
    expect(samePayload('<a>\n  <b/>\n</a>', '<a><b/></a>')).toBe(true)
    expect(samePayload('<a><b/></a>', '<a><c/></a>')).toBe(false)
  })
})

describe('compactWhere', () => {
  it('folds a field across schedule types', () => {
    expect(compactWhere(['Filterlayout', 'Schedule-Typ Keine: SA-Filterlayout', 'Schedule-Typ msdyn_project: SA-Filterlayout'])).toEqual([
      'Filterlayout',
      'SA-Filterlayout (Keine, msdyn_project)',
    ])
  })
})
