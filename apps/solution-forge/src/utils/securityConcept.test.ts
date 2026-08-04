import { describe, expect, it } from 'vitest'
import {
  buildSecurityConcept,
  diffBaselines,
  diffRoleGrants,
  flattenBuTree,
} from './securityConcept'
import {
  decodeBaseline,
  encodeBaseline,
  type BaselineExtras,
} from './securityBaseline'
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
  roles: { id: string; name: string; managed?: boolean; spec?: Spec; misc?: string[] }[],
): SecurityModel {
  return {
    roles: roles.map((r) => ({
      rootRoleId: r.id,
      name: r.name,
      isManaged: !!r.managed,
      copyCount: 1,
    })),
    entities: [],
    matrices: new Map(roles.map((r) => [r.id, matrix(r.spec ?? {})])),
    miscPrivileges: new Map(roles.map((r) => [r.id, r.misc ?? []])),
    loadedAt: new Date(0),
  }
}

const ENVS = ['dev', 'uat']
const baseline = (models: Record<string, SecurityModel | null>) =>
  encodeBaseline(models, ENVS, null)

const META = {
  name: 'Freigabe Q2',
  scope: 'Custom roles',
  envKeys: ENVS,
  envLabel: (key: string) => key.toUpperCase(),
  frozenOn: '2026-05-01T10:00:00.000Z',
  frozenBy: 'Andy Schwarz',
  generatedAt: new Date('2026-08-04T12:00:00.000Z'),
}

describe('diffRoleGrants', () => {
  const grantsOf = (spec: Spec, misc: string[] = []) =>
    decodeBaseline(
      baseline({ dev: model([{ id: 'r', name: 'R', spec, misc }]), uat: null }),
    )
      .get('dev')!
      .get('r')!

  it('reports a gained grant with its depth', () => {
    expect(
      diffRoleGrants(grantsOf({}), grantsOf({ account: { Read: 2 } })),
    ).toEqual(['+ account Read (Business Unit)'])
  })

  it('reports a lost grant', () => {
    expect(
      diffRoleGrants(grantsOf({ account: { Read: 2 } }), grantsOf({})),
    ).toEqual(['− account Read (was Business Unit)'])
  })

  it('reports a depth change in both directions', () => {
    expect(
      diffRoleGrants(
        grantsOf({ account: { Read: 2 } }),
        grantsOf({ account: { Read: 8 } }),
      ),
    ).toEqual(['~ account Read: Business Unit → Organization'])
  })

  it('reports misc privileges after the table grants', () => {
    const lines = diffRoleGrants(
      grantsOf({ account: { Read: 2 } }, ['prvExportToExcel']),
      grantsOf({ account: { Read: 8 } }, ['prvExportToExcel', 'prvBulkDelete']),
    )
    expect(lines).toEqual([
      '~ account Read: Business Unit → Organization',
      '+ prvBulkDelete',
    ])
  })

  it('is empty for identical grants', () => {
    const spec: Spec = { account: { Read: 2, Write: 1 } }
    expect(diffRoleGrants(grantsOf(spec), grantsOf(spec))).toEqual([])
  })
})

describe('diffBaselines', () => {
  const before = baseline({
    dev: model([
      { id: 'a', name: 'Sales', spec: { account: { Read: 2 } } },
      { id: 'b', name: 'Retired' },
    ]),
    uat: model([{ id: 'a', name: 'Sales', spec: { account: { Read: 2 } } }]),
  })

  it('separates added, removed and changed roles', () => {
    const after = baseline({
      dev: model([
        { id: 'a', name: 'Sales', spec: { account: { Read: 8 } } },
        { id: 'c', name: 'Brand new' },
      ]),
      uat: model([{ id: 'a', name: 'Sales', spec: { account: { Read: 2 } } }]),
    })
    const diff = diffBaselines(before, after)
    expect(diff.added.map((r) => r.name)).toEqual(['Brand new'])
    expect(diff.removed.map((r) => r.name)).toEqual(['Retired'])
    expect(diff.changed.map((r) => r.name)).toEqual(['Sales'])
  })

  it('lists the change only for the environment it happened in', () => {
    const after = baseline({
      dev: model([
        { id: 'a', name: 'Sales', spec: { account: { Read: 8 } } },
        { id: 'b', name: 'Retired' },
      ]),
      uat: model([{ id: 'a', name: 'Sales', spec: { account: { Read: 2 } } }]),
    })
    const diff = diffBaselines(before, after)
    const sales = diff.changed.find((r) => r.name === 'Sales')!
    expect(sales.byEnv.map((e) => e.envKey)).toEqual(['dev'])
    expect(sales.byEnv[0].lines).toEqual([
      '~ account Read: Business Unit → Organization',
    ])
  })

  it('finds nothing between a baseline and itself', () => {
    const diff = diffBaselines(before, before)
    expect(diff).toEqual({ added: [], removed: [], changed: [] })
  })
})

describe('flattenBuTree', () => {
  it('orders depth-first with nesting depth', () => {
    expect(
      flattenBuTree([
        { n: 'Sales', p: 'DE', u: 4 },
        { n: 'Root', p: '', u: 1 },
        { n: 'DE', p: 'Root', u: 2 },
      ]),
    ).toEqual([
      { name: 'Root', users: 1, depth: 0 },
      { name: 'DE', users: 2, depth: 1 },
      { name: 'Sales', users: 4, depth: 2 },
    ])
  })

  it('treats a unit whose parent was not captured as a root', () => {
    // Dropping it would silently shrink the org chart.
    expect(flattenBuTree([{ n: 'Orphan', p: 'Gone', u: 1 }])).toEqual([
      { name: 'Orphan', users: 1, depth: 0 },
    ])
  })

  it('survives a cycle without hanging and still lists every unit', () => {
    const out = flattenBuTree([
      { n: 'A', p: 'B', u: 1 },
      { n: 'B', p: 'A', u: 2 },
    ])
    expect(out.map((b) => b.name).sort()).toEqual(['A', 'B'])
  })
})

describe('buildSecurityConcept', () => {
  const payload = baseline({
    dev: model([
      {
        id: 'a',
        name: 'Vertrieb Süd',
        spec: { account: { Read: 2, Write: 2 } },
        misc: ['prvExportToExcel'],
      },
      { id: 'm', name: 'System Administrator', managed: true },
    ]),
    uat: model([
      { id: 'a', name: 'Vertrieb Süd', spec: { account: { Read: 8, Write: 2 } } },
      { id: 'm', name: 'System Administrator', managed: true },
    ]),
  })

  it('renders a header, the environment table and the roles', () => {
    const doc = buildSecurityConcept(payload, META)
    expect(doc.markdown).toContain('# Security concept — Freigabe Q2')
    expect(doc.markdown).toContain('by Andy Schwarz')
    expect(doc.markdown).toContain('| DEV *(reference)* | 2 | 1 | 1 |')
    expect(doc.markdown).toContain('### Vertrieb Süd')
    expect(doc.markdown).toContain('`account`')
  })

  it('states what the baseline does not cover', () => {
    // A reader must not read "absent" as "nothing to report".
    const doc = buildSecurityConcept(payload, META)
    expect(doc.markdown).toMatch(/Not captured in this baseline/i)
    expect(doc.markdown).toMatch(/not a statement about them/i)
    expect(doc.text).toMatch(/Not captured in this baseline/i)
  })

  it('flags an environment that deviates from the reference', () => {
    // UAT differs twice: the Read depth AND the missing misc privilege —
    // the counter spans both, like countPrivilegeDifferences elsewhere.
    const doc = buildSecurityConcept(payload, META)
    expect(doc.markdown).toContain('Differs from the reference: UAT (2 privileges)')
  })

  it('adds a changes chapter when a previous baseline is given', () => {
    const previous = baseline({
      dev: model([
        { id: 'a', name: 'Vertrieb Süd', spec: { account: { Read: 1, Write: 2 } } },
        { id: 'm', name: 'System Administrator', managed: true },
      ]),
      uat: model([
        { id: 'a', name: 'Vertrieb Süd', spec: { account: { Read: 8, Write: 2 } } },
        { id: 'm', name: 'System Administrator', managed: true },
      ]),
    })
    const doc = buildSecurityConcept(payload, META, {
      payload: previous,
      name: 'Freigabe Q1',
      frozenOn: '2026-02-01T10:00:00.000Z',
    })
    expect(doc.markdown).toContain('## Changes since “Freigabe Q1”')
    expect(doc.markdown).toContain('~ account Read: User → Business Unit')
    expect(doc.summary).toContain('1 changed')
  })

  it('says so explicitly when nothing changed', () => {
    const doc = buildSecurityConcept(payload, META, {
      payload,
      name: 'Freigabe Q1',
    })
    expect(doc.markdown).toContain('No role or privilege changed.')
    expect(doc.summary).toContain('0 changed')
  })

  it('summarises environments and roles', () => {
    expect(buildSecurityConcept(payload, META).summary).toBe(
      '2 environments · 2 roles',
    )
  })

  it('documents only the selected environments', () => {
    const doc = buildSecurityConcept(payload, { ...META, envKeys: ['dev'] })
    expect(doc.markdown).toContain('| DEV *(reference)* |')
    expect(doc.markdown).not.toContain('| UAT |')
    // With UAT out of scope there is nothing left to deviate.
    expect(doc.markdown).not.toContain('Differs from the reference')
    expect(doc.summary).toBe('1 environment · 2 roles')
  })

  it('names the environments it deliberately left out', () => {
    const doc = buildSecurityConcept(payload, {
      ...META,
      envKeys: ['dev'],
      allEnvKeys: ['dev', 'uat'],
    })
    expect(doc.markdown).toContain('also covers UAT')
    expect(doc.markdown).toMatch(/left out/i)
  })

  it('drops roles that live only in an excluded environment', () => {
    const withUatOnly = baseline({
      dev: model([{ id: 'a', name: 'Shared' }]),
      uat: model([
        { id: 'a', name: 'Shared' },
        { id: 'u', name: 'Nur in UAT' },
      ]),
    })
    const all = buildSecurityConcept(withUatOnly, META)
    expect(all.markdown).toContain('### Nur in UAT')
    const devOnly = buildSecurityConcept(withUatOnly, {
      ...META,
      envKeys: ['dev'],
    })
    expect(devOnly.markdown).not.toContain('Nur in UAT')
  })

  it('keeps the changes chapter inside the selected environments', () => {
    const before = baseline({
      dev: model([{ id: 'a', name: 'Sales', spec: { account: { Read: 2 } } }]),
      uat: model([{ id: 'a', name: 'Sales', spec: { account: { Read: 2 } } }]),
    })
    const after = baseline({
      dev: model([{ id: 'a', name: 'Sales', spec: { account: { Read: 2 } } }]),
      // Only UAT moved.
      uat: model([{ id: 'a', name: 'Sales', spec: { account: { Read: 8 } } }]),
    })
    const devOnly = buildSecurityConcept(
      after,
      { ...META, envKeys: ['dev'] },
      { payload: before, name: 'Q1' },
    )
    expect(devOnly.markdown).toContain('No role or privilege changed.')
    const both = buildSecurityConcept(after, META, {
      payload: before,
      name: 'Q1',
    })
    expect(both.markdown).toContain('~ account Read: Business Unit → Organization')
  })

  it('names exactly the chapters the baseline did not capture', () => {
    // Nothing captured → all three named.
    const bare = buildSecurityConcept(payload, META)
    expect(bare.markdown).toContain(
      'business units and team assignments, field-level security, audit settings',
    )
    // Audit captured, the other two not → only those two named.
    const partial = encodeBaseline({ dev: model([]), uat: null }, ENVS, null, {
      dev: { audit: { on: 1, ret: 30, tables: ['account'], total: 400 } },
    })
    const doc = buildSecurityConcept(partial, META)
    expect(doc.markdown).toContain(
      'business units and team assignments, field-level security —',
    )
    expect(doc.markdown).not.toContain('audit settings —')
  })

  it('drops the disclaimer entirely when everything was captured', () => {
    const extras: Record<string, BaselineExtras> = {
      dev: {
        org: { bus: [{ n: 'Root', p: '', u: 3 }], teams: [] },
        fls: [],
        audit: { on: 1, ret: -1, tables: [], total: 10 },
      },
    }
    const full = encodeBaseline({ dev: model([]), uat: null }, ENVS, null, extras)
    const doc = buildSecurityConcept(full, { ...META, envKeys: ['dev'] })
    expect(doc.markdown).toContain('the business-unit and team structure')
    expect(doc.markdown).not.toMatch(/Not captured in this baseline/)
  })

  it('renders the org, field-security and audit chapters', () => {
    const extras: Record<string, BaselineExtras> = {
      dev: {
        org: {
          bus: [
            { n: 'Root', p: '', u: 1 },
            { n: 'Sales', p: 'Root', u: 4 },
          ],
          teams: [
            { n: 'Sales DE', bu: 'Sales', t: 0, r: ['Vertrieb Süd'], m: 3 },
          ],
        },
        fls: [
          {
            n: 'Gehalt',
            m: 0,
            c: [{ e: 'systemuser', a: 'salary', r: 1, w: 0, u: 0, x: 0 }],
            au: 0,
            at: 0,
          },
        ],
        audit: { on: 0, ret: 30, tables: ['account'], total: 400 },
      },
    }
    const full = encodeBaseline({ dev: model([]), uat: null }, ENVS, null, extras)
    const doc = buildSecurityConcept(full, { ...META, envKeys: ['dev'] })
    expect(doc.markdown).toContain('## Business units & teams — DEV')
    expect(doc.markdown).toContain('| Sales DE | Sales | Owner | Vertrieb Süd | 3 |')
    expect(doc.markdown).toContain('## Field security — DEV')
    // A profile nobody holds is flagged, not just listed.
    expect(doc.markdown).toContain('| Gehalt ⚠ |')
    expect(doc.markdown).toContain('`systemuser.salary`')
    expect(doc.markdown).toContain('## Audit configuration — DEV')
    expect(doc.markdown).toContain('Auditing is off org-wide')
    expect(doc.markdown).toContain('Audited tables: 1 of 400')
  })

  it('is deterministic', () => {
    const a = buildSecurityConcept(payload, META)
    const b = buildSecurityConcept(payload, META)
    expect(a.markdown).toBe(b.markdown)
  })
})
