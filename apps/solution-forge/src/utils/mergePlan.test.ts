import { describe, expect, it } from 'vitest'
import { decideMergeAction } from './mergePlan'
import type { SolutionComponentInfo } from '../types/solution'

const comp = (
  over: Partial<SolutionComponentInfo> = {},
): SolutionComponentInfo => ({
  id: 'sc-1',
  objectId: 'AAAAAAAA-1111-2222-3333-444444444444',
  typeCode: 1,
  typeName: 'Entity',
  displayName: 'pro_mergerun',
  ...over,
})

const target = (
  entries: [string, number | undefined][] = [],
): Map<string, number | undefined> =>
  new Map(entries.map(([k, v]) => [k.toLowerCase(), v]))

const allowAll = () => true

describe('decideMergeAction', () => {
  it('adds a component the target does not have', () => {
    expect(decideMergeAction(comp(), target(), allowAll)).toBe('add')
  })

  it('excludes a type the release does not accept', () => {
    expect(
      decideMergeAction(comp({ typeCode: 61 }), target(), (t) => t !== 61),
    ).toBe('excluded')
  })

  it('excludes before looking at presence', () => {
    const c = comp()
    expect(
      decideMergeAction(c, target([[c.objectId, 2]]), () => false),
    ).toBe('excluded')
  })

  // The regression this module exists for.
  it('widens a shell table when the source carries all subcomponents', () => {
    const c = comp({ rootBehavior: 0 })
    expect(decideMergeAction(c, target([[c.objectId, 2]]), allowAll)).toBe(
      'widen',
    )
  })

  it('widens a "do not include subcomponents" table too', () => {
    const c = comp({ rootBehavior: 0 })
    expect(decideMergeAction(c, target([[c.objectId, 1]]), allowAll)).toBe(
      'widen',
    )
  })

  it('skips when the target already carries the whole table', () => {
    const c = comp({ rootBehavior: 0 })
    expect(decideMergeAction(c, target([[c.objectId, 0]]), allowAll)).toBe(
      'skip',
    )
  })

  it('never narrows: a shell source over a full target is skipped', () => {
    const c = comp({ rootBehavior: 2 })
    expect(decideMergeAction(c, target([[c.objectId, 0]]), allowAll)).toBe(
      'skip',
    )
  })

  it('skips a shell source when the target has the shell as well', () => {
    const c = comp({ rootBehavior: 2 })
    expect(decideMergeAction(c, target([[c.objectId, 2]]), allowAll)).toBe(
      'skip',
    )
  })

  it('skips present non-table components (no behavior at all)', () => {
    const c = comp({ typeCode: 2, typeName: 'Attribute' })
    expect(
      decideMergeAction(c, target([[c.objectId, undefined]]), allowAll),
    ).toBe('skip')
  })

  it('adds a column the target does not have yet', () => {
    expect(
      decideMergeAction(
        comp({ typeCode: 2, objectId: 'BBBBBBBB-1111-2222-3333-444444444444' }),
        target([['AAAAAAAA-1111-2222-3333-444444444444', 2]]),
        allowAll,
      ),
    ).toBe('add')
  })

  it('matches object ids case-insensitively', () => {
    const c = comp({ objectId: 'aaaaaaaa-1111-2222-3333-444444444444' })
    expect(
      decideMergeAction(
        c,
        target([['AAAAAAAA-1111-2222-3333-444444444444', 2]]),
        allowAll,
      ),
    ).toBe('skip')
  })
})
