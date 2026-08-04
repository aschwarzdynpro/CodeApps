import { describe, expect, it } from 'vitest'
import {
  buildPrivilegeDiff,
  buildRoleComparison,
  canonicalPrivileges,
  fingerprint,
  filterRoleRows,
  roleComparerCounts,
  roleMatchKey,
  rowHasFinding,
} from './roleCompare'
import type {
  PrivilegeAction,
  PrivilegeDepthMask,
  RoleEntityMatrix,
  SecurityModel,
} from '../types/roles'

type Spec = Record<string, Partial<Record<PrivilegeAction, PrivilegeDepthMask>>>

function matrix(spec: Spec): RoleEntityMatrix {
  const m: RoleEntityMatrix = new Map()
  for (const [entity, actions] of Object.entries(spec)) {
    const map = new Map<PrivilegeAction, PrivilegeDepthMask>()
    for (const [action, depth] of Object.entries(actions))
      map.set(action as PrivilegeAction, depth as PrivilegeDepthMask)
    m.set(entity, map)
  }
  return m
}

function model(
  roles: {
    id: string
    name: string
    managed?: boolean
    copies?: number
    spec?: Spec
    misc?: string[]
  }[],
): SecurityModel {
  return {
    roles: roles.map((r) => ({
      rootRoleId: r.id,
      name: r.name,
      isManaged: !!r.managed,
      copyCount: r.copies ?? 1,
    })),
    entities: [],
    matrices: new Map(roles.map((r) => [r.id, matrix(r.spec ?? {})])),
    miscPrivileges: new Map(roles.map((r) => [r.id, r.misc ?? []])),
    loadedAt: new Date(0),
  }
}

const ENVS = ['dev', 'uat', 'prod']

function compare(models: Record<string, SecurityModel | null>) {
  return buildRoleComparison({
    models,
    envKeys: ENVS,
    hostKey: 'dev',
    envErrors: {},
    loadedAt: new Date(0),
  })
}

describe('roleMatchKey', () => {
  it('folds case and collapses whitespace', () => {
    expect(roleMatchKey('  Vertrieb   Süd ')).toBe('vertrieb süd')
    expect(roleMatchKey('VERTRIEB SÜD')).toBe(roleMatchKey('vertrieb süd'))
  })
})

describe('canonicalPrivileges', () => {
  it('is independent of insertion order', () => {
    const a = canonicalPrivileges(
      matrix({ account: { Read: 2, Write: 2 }, contact: { Read: 1 } }),
      ['prvExportToExcel', 'prvBulkDelete'],
    )
    const b = canonicalPrivileges(
      matrix({ contact: { Read: 1 }, account: { Write: 2, Read: 2 } }),
      ['prvBulkDelete', 'prvExportToExcel'],
    )
    expect(a).toBe(b)
  })

  it('distinguishes depth', () => {
    const shallow = canonicalPrivileges(matrix({ account: { Read: 2 } }), [])
    const deep = canonicalPrivileges(matrix({ account: { Read: 8 } }), [])
    expect(shallow).not.toBe(deep)
  })

  it('ignores zero-depth grants', () => {
    const none = canonicalPrivileges(matrix({ account: { Read: 0 } }), [])
    expect(none).toBe(canonicalPrivileges(matrix({}), []))
  })

  it('separates table grants from misc privileges', () => {
    // Without a separator, a misc privilege could be confused with a grant.
    expect(canonicalPrivileges(matrix({}), ['x'])).not.toBe(
      canonicalPrivileges(matrix({ x: { Read: 1 } }), []),
    )
  })
})

describe('fingerprint', () => {
  it('is deterministic and 8 hex chars', () => {
    const f = fingerprint('account:Read=2|')
    expect(f).toBe(fingerprint('account:Read=2|'))
    expect(f).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('buildRoleComparison', () => {
  it('reports no drift when every environment grants the same', () => {
    const spec: Spec = { account: { Read: 2, Write: 2 } }
    const result = compare({
      dev: model([{ id: 'r1', name: 'Sales', spec }]),
      uat: model([{ id: 'r1', name: 'Sales', spec }]),
      prod: model([{ id: 'r1', name: 'Sales', spec }]),
    })
    expect(result.rows).toHaveLength(1)
    expect(rowHasFinding(result.rows[0])).toBe(false)
    expect(result.rows[0].byEnv.uat?.privilegeCount).toBe(2)
  })

  it('flags a different depth as drift', () => {
    const result = compare({
      dev: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2 } } }]),
      uat: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 8 } } }]),
      prod: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2 } } }]),
    })
    expect(result.rows[0].drift).toBe(true)
  })

  it('separates "missing in target" from "only in target"', () => {
    const result = compare({
      dev: model([{ id: 'r1', name: 'OnlyDev' }]),
      uat: model([{ id: 'r2', name: 'OnlyUat' }]),
      prod: model([]),
    })
    const onlyDev = result.rows.find((r) => r.name === 'OnlyDev')!
    const onlyUat = result.rows.find((r) => r.name === 'OnlyUat')!
    expect(onlyDev.missingSomewhere).toBe(true)
    expect(onlyDev.extraSomewhere).toBe(false)
    expect(onlyUat.extraSomewhere).toBe(true)
    expect(onlyUat.missingSomewhere).toBe(false)
    // "read fine, role not there" must stay distinguishable from "unreadable".
    expect(onlyDev.byEnv.uat).not.toBeNull()
    expect(onlyDev.byEnv.uat?.present).toBe(false)
  })

  it('never turns an unreadable environment into a finding', () => {
    const result = compare({
      dev: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2 } } }]),
      uat: null,
      prod: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2 } } }]),
    })
    const row = result.rows[0]
    expect(row.byEnv.uat).toBeNull()
    expect(row.missingSomewhere).toBe(false)
    expect(row.drift).toBe(false)
    expect(rowHasFinding(row)).toBe(false)
  })

  it('flags a rebuilt role (same name, different id) as identity drift', () => {
    const spec: Spec = { account: { Read: 2 } }
    const result = compare({
      dev: model([{ id: 'r1', name: 'Sales', spec }]),
      uat: model([{ id: 'OTHER', name: 'Sales', spec }]),
      prod: model([{ id: 'r1', name: 'Sales', spec }]),
    })
    const row = result.rows[0]
    expect(row.identityDrift).toBe(true)
    // Identical privileges today — the finding is the identity, not the rights.
    expect(row.drift).toBe(false)
  })

  it('flags a differing managed state', () => {
    const result = compare({
      dev: model([{ id: 'r1', name: 'Sales', managed: true }]),
      uat: model([{ id: 'r1', name: 'Sales', managed: false }]),
      prod: model([{ id: 'r1', name: 'Sales', managed: true }]),
    })
    expect(result.rows[0].managedDrift).toBe(true)
  })

  it('matches across case differences and keeps the host spelling', () => {
    const result = compare({
      dev: model([{ id: 'r1', name: 'Vertrieb Süd' }]),
      uat: model([{ id: 'r1', name: 'VERTRIEB SÜD' }]),
      prod: model([]),
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe('Vertrieb Süd')
    expect(result.rows[0].byEnv.uat?.present).toBe(true)
  })

  it('detects drift between targets even when the host lacks the role', () => {
    const result = compare({
      dev: model([]),
      uat: model([{ id: 'r1', name: 'Grown', spec: { account: { Read: 2 } } }]),
      prod: model([{ id: 'r1', name: 'Grown', spec: { account: { Read: 8 } } }]),
    })
    expect(result.rows[0].drift).toBe(true)
  })

  it('sorts rows by name', () => {
    const result = compare({
      dev: model([
        { id: 'b', name: 'Beta' },
        { id: 'a', name: 'Alpha' },
      ]),
      uat: model([]),
      prod: model([]),
    })
    expect(result.rows.map((r) => r.name)).toEqual(['Alpha', 'Beta'])
  })
})

describe('buildPrivilegeDiff', () => {
  const models: Record<string, SecurityModel | null> = {
    dev: model([
      {
        id: 'r1',
        name: 'Sales',
        spec: { account: { Read: 2, Write: 2 }, contact: { Read: 1 } },
        misc: ['prvExportToExcel'],
      },
    ]),
    uat: model([
      {
        id: 'r1',
        name: 'Sales',
        spec: { account: { Read: 8 } },
        misc: ['prvExportToExcel', 'prvBulkDelete'],
      },
    ]),
    prod: null,
  }

  it('unions every entity × action seen in any environment', () => {
    const diff = buildPrivilegeDiff('sales', models, ENVS)
    expect(diff.privileges.map((p) => `${p.entity} ${p.action}`)).toEqual([
      'account Read',
      'account Write',
      'contact Read',
    ])
  })

  it('reports the depth per environment and marks the differences', () => {
    const diff = buildPrivilegeDiff('sales', models, ENVS)
    const read = diff.privileges.find((p) => p.entity === 'account' && p.action === 'Read')!
    expect(read.byEnv).toEqual({ dev: 2, uat: 8, prod: null })
    expect(read.drift).toBe(true)

    // Granted in dev, absent in uat: depth 0 there, still drift.
    const write = diff.privileges.find((p) => p.action === 'Write')!
    expect(write.byEnv.uat).toBe(0)
    expect(write.drift).toBe(true)
  })

  it('diffs misc privileges too', () => {
    const diff = buildPrivilegeDiff('sales', models, ENVS)
    expect(diff.misc.find((m) => m.name === 'prvExportToExcel')?.drift).toBe(false)
    const bulk = diff.misc.find((m) => m.name === 'prvBulkDelete')!
    expect(bulk.byEnv).toEqual({ dev: false, uat: true, prod: null })
    expect(bulk.drift).toBe(true)
  })

  it('returns empty lists for an unknown role', () => {
    const diff = buildPrivilegeDiff('nope', models, ENVS)
    expect(diff.privileges).toEqual([])
    expect(diff.misc).toEqual([])
  })
})

describe('filterRoleRows / roleComparerCounts', () => {
  const result = compare({
    dev: model([
      { id: 'a', name: 'Drifter', spec: { account: { Read: 2 } } },
      { id: 'b', name: 'Gone' },
      { id: 'c', name: 'Stable' },
    ]),
    uat: model([
      { id: 'a', name: 'Drifter', spec: { account: { Read: 8 } } },
      { id: 'c', name: 'Stable' },
    ]),
    prod: model([
      { id: 'a', name: 'Drifter', spec: { account: { Read: 2 } } },
      { id: 'b', name: 'Gone' },
      { id: 'c', name: 'Stable' },
    ]),
  })

  it('counts each finding kind', () => {
    const counts = roleComparerCounts(result.rows)
    expect(counts.all).toBe(3)
    expect(counts.drift).toBe(1)
    expect(counts.missing).toBe(1)
  })

  it('filters by kind and by search text', () => {
    expect(filterRoleRows(result.rows, 'drift', '').map((r) => r.name)).toEqual([
      'Drifter',
    ])
    expect(filterRoleRows(result.rows, 'missing', '').map((r) => r.name)).toEqual([
      'Gone',
    ])
    expect(filterRoleRows(result.rows, 'all', 'sta').map((r) => r.name)).toEqual([
      'Stable',
    ])
    expect(filterRoleRows(result.rows, 'drift', 'stable')).toEqual([])
  })
})
