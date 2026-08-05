import { describe, expect, it } from 'vitest'
import type { ColumnPlan } from './transferConfig'
import {
  buildColumnPlanReport,
  describeSkipReason,
  parseColumnPlan,
  planBlockers,
  type ColumnPlanReportInput,
} from './columnPlanReport'

const plan = (over: Partial<ColumnPlan> = {}): ColumnPlan => ({
  s: ['cust_name'],
  l: [],
  x: [],
  ...over,
})

const report = (over: Partial<ColumnPlanReportInput> = {}) =>
  buildColumnPlanReport({
    plan: plan(),
    ownEntitySet: 'cust_pricelistitems',
    ownOrder: 2,
    siblings: [],
    allAttributes: false,
    ...over,
  })

const ids = (input?: Partial<ColumnPlanReportInput>) =>
  report(input).notices.map((n) => n.id)

describe('parseColumnPlan', () => {
  it('parses a well-formed plan', () => {
    const parsed = parseColumnPlan('{"s":["a"],"l":[{"c":"b","s":"bs"}],"x":[{"c":"c","r":"owner"}]}')
    expect(parsed).toEqual({ s: ['a'], l: [{ c: 'b', s: 'bs' }], x: [{ c: 'c', r: 'owner' }] })
  })

  it('returns null for empty, invalid and non-object JSON', () => {
    expect(parseColumnPlan('')).toBeNull()
    expect(parseColumnPlan('   ')).toBeNull()
    expect(parseColumnPlan('{oops')).toBeNull()
    expect(parseColumnPlan('[1,2]')).toBeNull()
    expect(parseColumnPlan('null')).toBeNull()
  })

  it('drops malformed members instead of throwing', () => {
    // A legacy or hand-edited plan must never break the dialog.
    const parsed = parseColumnPlan('{"s":["a",7],"l":[{"c":"b"},{"c":"d","s":"ds"}],"x":"nope"}')
    expect(parsed).toEqual({ s: ['a'], l: [{ c: 'd', s: 'ds' }], x: [] })
  })

  it('tolerates missing keys', () => {
    expect(parseColumnPlan('{}')).toEqual({ s: [], l: [], x: [] })
  })
})

describe('describeSkipReason', () => {
  it('spells out a known code', () => {
    expect(describeSkipReason('owner')).toMatch(/ownership is not transported/i)
  })

  it('passes an unknown code through verbatim', () => {
    // A new reason in buildColumnPlan must still render.
    expect(describeSkipReason('brand new reason')).toBe('brand new reason')
  })
})

describe('buildColumnPlanReport — grouping', () => {
  it('groups skips by reason, largest group first', () => {
    const r = report({
      plan: plan({
        x: [
          { c: 'ownerid', r: 'owner' },
          { c: 'modifiedon', r: 'platform' },
          { c: 'createdon', r: 'platform' },
        ],
      }),
    })
    expect(r.skipped.map((g) => g.reason)).toEqual(['platform', 'owner'])
    expect(r.skipped[0].columns).toEqual(['createdon', 'modifiedon'])
    expect(r.skipped[0].label).toBe(describeSkipReason('platform'))
    expect(r.skippedCount).toBe(3)
  })

  it('sorts written columns and lookups by name', () => {
    const r = report({
      plan: plan({
        s: ['zeta', 'alpha'],
        l: [
          { c: 'zlookup', s: 'zs' },
          { c: 'alookup', s: 'as' },
        ],
      }),
      siblings: [
        { name: 'A', entitySet: 'as', order: 1, active: true },
        { name: 'Z', entitySet: 'zs', order: 1, active: true },
      ],
    })
    expect(r.scalars).toEqual(['alpha', 'zeta'])
    expect(r.lookups.map((l) => l.c)).toEqual(['alookup', 'zlookup'])
  })
})

describe('buildColumnPlanReport — notices', () => {
  it('blocks an empty plan', () => {
    const r = report({ plan: plan({ s: [], l: [] }) })
    expect(r.notices[0].level).toBe('blocker')
    expect(planBlockers(r)).toHaveLength(1)
  })

  it('does not block when only a lookup is written', () => {
    const r = report({
      plan: plan({ s: [], l: [{ c: 'cust_pricelistid', s: 'cust_pricelists' }] }),
      siblings: [{ name: 'Price lists', entitySet: 'cust_pricelists', order: 1, active: true }],
    })
    expect(planBlockers(r)).toEqual([])
  })

  it('warns once about all dropped reference columns', () => {
    const r = report({
      plan: plan({
        x: [
          { c: 'regardingobjectid', r: 'polymorphic lookup' },
          { c: 'cust_thing', r: 'lookup target unknown' },
          { c: 'ownerid', r: 'owner' },
        ],
      }),
    })
    const dropped = r.notices.filter((n) => n.id === 'dropped-references')
    expect(dropped).toHaveLength(1)
    // The owner skip is not a dropped reference — it must not be counted in.
    expect(dropped[0].text).toContain('cust_thing, regardingobjectid')
    expect(dropped[0].text).not.toContain('ownerid')
  })

  it('warns when a lookup target is transferred by no entry', () => {
    expect(ids({ plan: plan({ l: [{ c: 'cust_pricelistid', s: 'cust_pricelists' }] }) })).toContain(
      'lookup-uncovered:cust_pricelistid',
    )
  })

  it('warns when the covering entry runs after this one', () => {
    const r = report({
      plan: plan({ l: [{ c: 'cust_pricelistid', s: 'cust_pricelists' }] }),
      ownOrder: 2,
      siblings: [{ name: 'Price lists', entitySet: 'cust_pricelists', order: 5, active: true }],
    })
    const notice = r.notices.find((n) => n.id === 'lookup-order:cust_pricelistid')
    expect(notice?.text).toContain('Price lists')
    expect(notice?.text).toContain('order 5')
  })

  it('warns on an equal order too — ties do not guarantee parents first', () => {
    expect(
      ids({
        plan: plan({ l: [{ c: 'cust_pricelistid', s: 'cust_pricelists' }] }),
        ownOrder: 3,
        siblings: [{ name: 'Price lists', entitySet: 'cust_pricelists', order: 3, active: true }],
      }),
    ).toContain('lookup-order:cust_pricelistid')
  })

  it('stays silent when the covering entry runs before this one', () => {
    expect(
      ids({
        plan: plan({ l: [{ c: 'cust_pricelistid', s: 'cust_pricelists' }] }),
        ownOrder: 3,
        siblings: [{ name: 'Price lists', entitySet: 'cust_pricelists', order: 1, active: true }],
      }),
    ).toEqual([])
  })

  it('warns when the covering entry is inactive, regardless of its order', () => {
    expect(
      ids({
        plan: plan({ l: [{ c: 'cust_pricelistid', s: 'cust_pricelists' }] }),
        ownOrder: 3,
        siblings: [{ name: 'Price lists', entitySet: 'cust_pricelists', order: 1, active: false }],
      }),
    ).toContain('lookup-inactive:cust_pricelistid')
  })

  it('treats a lookup onto the own table as info, not a missing entry', () => {
    const r = report({
      plan: plan({ l: [{ c: 'parentid', s: 'cust_pricelistitems' }] }),
      ownEntitySet: 'cust_pricelistitems',
    })
    expect(r.notices.map((n) => n.id)).toEqual(['self-reference:parentid'])
    expect(r.notices[0].level).toBe('info')
  })

  it('mentions all-attributes only when something is skipped', () => {
    expect(ids({ allAttributes: true })).not.toContain('all-attributes')
    expect(
      ids({ allAttributes: true, plan: plan({ x: [{ c: 'ownerid', r: 'owner' }] }) }),
    ).toContain('all-attributes')
  })

  it('orders notices blocker → warning → info', () => {
    const withBlocker = report({
      plan: plan({ s: [], l: [], x: [{ c: 'regardingobjectid', r: 'polymorphic lookup' }] }),
      allAttributes: true,
    })
    expect(withBlocker.notices.map((n) => n.level)).toEqual(['blocker', 'warning', 'info'])

    // Infos sort behind warnings even when the lookup loop emits them first.
    const withoutBlocker = report({
      plan: plan({
        s: ['cust_name'],
        l: [
          { c: 'aparent', s: 'cust_pricelistitems' },
          { c: 'zother', s: 'cust_pricelists' },
        ],
      }),
    })
    expect(withoutBlocker.notices.map((n) => n.id)).toEqual([
      'lookup-uncovered:zother',
      'self-reference:aparent',
    ])
  })
})
