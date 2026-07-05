import { describe, expect, it } from 'vitest'
import { analyzeCoreRoles } from './coreRoles'
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
  roles: { id: string; name: string; managed?: boolean; spec: Spec }[],
): SecurityModel {
  return {
    roles: roles.map((r) => ({
      rootRoleId: r.id,
      name: r.name,
      isManaged: !!r.managed,
      copyCount: 1,
    })),
    entities: [],
    matrices: new Map(roles.map((r) => [r.id, matrix(r.spec)])),
    miscPrivileges: new Map(),
    loadedAt: new Date(0),
  }
}

describe('analyzeCoreRoles', () => {
  it('finds privileges shared by ≥2 custom roles and clusters by role-set', () => {
    const m = model([
      { id: 'a', name: 'Sales South', spec: { account: { Read: 2, Write: 2 } } },
      { id: 'b', name: 'Sales North', spec: { account: { Read: 4, Write: 2 } } },
      { id: 'c', name: 'Service', spec: { incident: { Read: 1 } } },
    ])
    const clusters = analyzeCoreRoles(m)
    expect(clusters).toHaveLength(1)
    const c = clusters[0]
    expect(c.sources.map((s) => s.name).sort()).toEqual([
      'Sales North',
      'Sales South',
    ])
    // account/Read consolidated to the deeper depth (4), account/Write stays 2.
    const read = c.privileges.find((p) => p.action === 'Read')
    const write = c.privileges.find((p) => p.action === 'Write')
    expect(read).toMatchObject({ entity: 'account', depth: 4 })
    expect(write).toMatchObject({ entity: 'account', depth: 2 })
  })

  it('splits distinct sharing sets into separate clusters ("per area")', () => {
    const m = model([
      { id: 'a', name: 'A', spec: { account: { Read: 2 }, lead: { Read: 2 } } },
      { id: 'b', name: 'B', spec: { account: { Read: 2 } } },
      { id: 'c', name: 'C', spec: { lead: { Read: 2 } } },
    ])
    // account/Read shared by {A,B}; lead/Read shared by {A,C}.
    const clusters = analyzeCoreRoles(m)
    expect(clusters).toHaveLength(2)
    const bySet = clusters.map((c) => c.sources.map((s) => s.name).sort().join('+')).sort()
    expect(bySet).toEqual(['A+B', 'A+C'])
  })

  it('excludes managed roles', () => {
    const m = model([
      { id: 'sys', name: 'System Administrator', managed: true, spec: { account: { Read: 8 } } },
      { id: 'a', name: 'A', spec: { account: { Read: 2 } } },
    ])
    // Only one custom role has account/Read → nothing shared.
    expect(analyzeCoreRoles(m)).toHaveLength(0)
  })

  it('returns nothing when no privilege is shared', () => {
    const m = model([
      { id: 'a', name: 'A', spec: { account: { Read: 2 } } },
      { id: 'b', name: 'B', spec: { contact: { Write: 2 } } },
    ])
    expect(analyzeCoreRoles(m)).toHaveLength(0)
  })
})
