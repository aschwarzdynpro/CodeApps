import { describe, expect, it } from 'vitest'
import {
  applyBaselineVerdict,
  baselineCounts,
  baselineSizeVerdict,
  BASELINE_MAX_CHARS,
  decodeBaseline,
  encodeBaseline,
  parseBaseline,
  serializeBaseline,
} from './securityBaseline'
import { buildRoleComparison } from './roleCompare'
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

function compare(models: Record<string, SecurityModel | null>) {
  return buildRoleComparison({
    models,
    envKeys: ENVS,
    hostKey: 'dev',
    envErrors: {},
    loadedAt: new Date(0),
  })
}

describe('encode / decode', () => {
  it('round-trips grants and misc privileges', () => {
    const models = {
      dev: model([
        {
          id: 'r1',
          name: 'Sales',
          spec: { account: { Read: 2, Write: 8 }, contact: { Read: 1 } },
          misc: ['prvExportToExcel'],
        },
      ]),
      uat: null,
    }
    const decoded = decodeBaseline(encodeBaseline(models, ENVS, null))
    const role = decoded.get('dev')?.get('sales')
    expect(role?.matrix?.get('account')?.get('Read')).toBe(2)
    expect(role?.matrix?.get('account')?.get('Write')).toBe(8)
    expect(role?.matrix?.get('contact')?.get('Read')).toBe(1)
    expect(role?.misc).toEqual(['prvExportToExcel'])
    expect(role?.rootRoleId).toBe('r1')
  })

  it('does not capture an unreadable environment at all', () => {
    // An empty capture would later read as "every role was deleted there".
    const payload = encodeBaseline(
      { dev: model([{ id: 'r1', name: 'Sales' }]), uat: null },
      ENVS,
      null,
    )
    expect(Object.keys(payload.envs)).toEqual(['dev'])
  })

  it('restricts the capture to the given scope', () => {
    const models = {
      dev: model([
        { id: 'a', name: 'Keep me' },
        { id: 'b', name: 'Drop me' },
      ]),
      uat: null,
    }
    const payload = encodeBaseline(models, ENVS, new Set(['keep me']))
    expect(payload.envs.dev.map((r) => r.n)).toEqual(['Keep me'])
  })

  it('shares one entity dictionary across environments', () => {
    const spec: Spec = { account: { Read: 2 }, contact: { Read: 2 } }
    const payload = encodeBaseline(
      { dev: model([{ id: 'r', name: 'A', spec }]), uat: model([{ id: 'r', name: 'A', spec }]) },
      ENVS,
      null,
    )
    expect(payload.e).toEqual(['account', 'contact'])
  })

  it('survives a corrupt payload without throwing', () => {
    expect(parseBaseline('not json')).toBeNull()
    expect(parseBaseline('')).toBeNull()
    expect(parseBaseline(null)).toBeNull()
    expect(parseBaseline('{"nope":1}')).toBeNull()
  })

  it('round-trips through serialize / parse', () => {
    const payload = encodeBaseline(
      { dev: model([{ id: 'r', name: 'A', spec: { account: { Read: 2 } } }]), uat: null },
      ENVS,
      null,
    )
    expect(parseBaseline(serializeBaseline(payload))).toEqual(payload)
  })
})

describe('baselineSizeVerdict', () => {
  it('accepts a payload that fits', () => {
    expect(baselineSizeVerdict('x'.repeat(1000)).ok).toBe(true)
  })

  it('refuses an oversized payload and explains how to shrink it', () => {
    const verdict = baselineSizeVerdict('x'.repeat(BASELINE_MAX_CHARS + 1))
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toMatch(/Narrow the scope/)
  })
})

describe('applyBaselineVerdict', () => {
  const frozen = encodeBaseline(
    {
      dev: model([
        { id: 'r1', name: 'Sales', spec: { account: { Read: 2, Write: 2 } } },
        { id: 'r2', name: 'Retired', spec: { account: { Read: 2 } } },
      ]),
      uat: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2, Write: 2 } } }]),
    },
    ENVS,
    null,
  )

  it('counts what changed per environment since the freeze', () => {
    const models = {
      // Write depth raised from 2 to 8 in dev; uat untouched.
      dev: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2, Write: 8 } } }]),
      uat: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2, Write: 2 } } }]),
    }
    const result = applyBaselineVerdict(compare(models), models, frozen)
    const sales = result.rows.find((r) => r.name === 'Sales')!
    expect(sales.baseline?.changedByEnv.dev).toBe(1)
    expect(sales.baseline?.changedByEnv.uat).toBe(0)
    expect(sales.baseline?.changed).toBe(true)
  })

  it('reports a role the baseline never had as new', () => {
    const models = {
      dev: model([
        { id: 'r1', name: 'Sales', spec: { account: { Read: 2, Write: 2 } } },
        { id: 'r9', name: 'Brand new' },
      ]),
      uat: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2, Write: 2 } } }]),
    }
    const result = applyBaselineVerdict(compare(models), models, frozen)
    const fresh = result.rows.find((r) => r.name === 'Brand new')!
    expect(fresh.baseline?.isNew).toBe(true)
    expect(fresh.baseline?.changed).toBe(false)
  })

  it('adds a row for a role that disappeared since the freeze', () => {
    const models = {
      dev: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2, Write: 2 } } }]),
      uat: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2, Write: 2 } } }]),
    }
    const result = applyBaselineVerdict(compare(models), models, frozen)
    const gone = result.rows.find((r) => r.name === 'Retired')!
    expect(gone.baseline?.isGone).toBe(true)
    // It exists nowhere now, so no environment claims it.
    expect(gone.byEnv.dev?.present).toBe(false)
  })

  it('reports an environment the baseline did not capture as unknown, not unchanged', () => {
    const partial = encodeBaseline(
      { dev: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2 } } }]), uat: null },
      ENVS,
      null,
    )
    const models = {
      dev: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2 } } }]),
      uat: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 8 } } }]),
    }
    const result = applyBaselineVerdict(compare(models), models, partial)
    const sales = result.rows[0]
    expect(sales.baseline?.changedByEnv.dev).toBe(0)
    expect(sales.baseline?.changedByEnv.uat).toBeNull()
    // uat deviates from the frozen dev, but that is not what a baseline says.
    expect(sales.baseline?.changed).toBe(false)
  })

  it('counts the verdicts for the filter chips', () => {
    const models = {
      dev: model([
        { id: 'r1', name: 'Sales', spec: { account: { Read: 2, Write: 8 } } },
        { id: 'r9', name: 'Brand new' },
      ]),
      uat: model([{ id: 'r1', name: 'Sales', spec: { account: { Read: 2, Write: 2 } } }]),
    }
    const result = applyBaselineVerdict(compare(models), models, frozen)
    expect(baselineCounts(result.rows)).toEqual({
      changed: 1,
      added: 1,
      gone: 1,
    })
  })
})
