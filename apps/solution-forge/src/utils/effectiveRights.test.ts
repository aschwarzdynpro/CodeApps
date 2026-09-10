import { describe, expect, it } from 'vitest'
import type {
  EffectiveEntry,
  PrivilegeAction,
  RoleAssignmentPath,
} from '../types/roles'
import { PRIVILEGE_ACTIONS } from '../types/roles'
import {
  EMPTY_EFFECTIVE_FILTER,
  actionsPresent,
  effectiveRoleChips,
  filterEffectiveEntries,
  isFilterActive,
} from './effectiveRights'

const direct = (id: string, name: string): RoleAssignmentPath => ({
  rootRoleId: id,
  roleName: name,
  via: 'direct',
})
const viaTeam = (id: string, name: string, team: string): RoleAssignmentPath => ({
  rootRoleId: id,
  roleName: name,
  via: 'team',
  teamName: team,
})

const entry = (
  entity: string,
  action: PrivilegeAction,
  sources: RoleAssignmentPath[],
): EffectiveEntry => ({ entity, action, depth: 4, sources })

const SALES = direct('r-1', 'Sales')
const SERVICE = viaTeam('r-2', 'Service', 'Field Team')

const ENTRIES: EffectiveEntry[] = [
  entry('account', 'Read', [SALES, SERVICE]),
  entry('account', 'Write', [SALES]),
  entry('contact', 'Read', [SERVICE]),
  entry('opportunity', 'Create', [SALES]),
]

describe('filterEffectiveEntries', () => {
  const keys = (f: Partial<typeof EMPTY_EFFECTIVE_FILTER>) =>
    filterEffectiveEntries(ENTRIES, { ...EMPTY_EFFECTIVE_FILTER, ...f }).map(
      (e) => `${e.entity}:${e.action}`,
    )

  it('returns everything for an empty filter', () => {
    expect(keys({})).toHaveLength(4)
  })

  it('matches the table as a case-insensitive substring', () => {
    expect(keys({ entity: 'ACC' })).toEqual(['account:Read', 'account:Write'])
    expect(keys({ entity: '  count ' })).toEqual(['account:Read', 'account:Write'])
  })

  it('matches the privilege exactly', () => {
    expect(keys({ action: 'Read' })).toEqual(['account:Read', 'contact:Read'])
  })

  it('matches a role through any of an entry sources', () => {
    // account:Read is granted by both roles and must appear under either.
    expect(keys({ rootRoleId: 'r-1' })).toEqual([
      'account:Read',
      'account:Write',
      'opportunity:Create',
    ])
    expect(keys({ rootRoleId: 'r-2' })).toEqual(['account:Read', 'contact:Read'])
  })

  it('combines the three dimensions with AND', () => {
    expect(keys({ entity: 'account', action: 'Read', rootRoleId: 'r-2' })).toEqual([
      'account:Read',
    ])
    expect(keys({ entity: 'contact', rootRoleId: 'r-1' })).toEqual([])
  })

  it('returns nothing for an unknown role rather than everything', () => {
    expect(keys({ rootRoleId: 'nope' })).toEqual([])
  })
})

describe('isFilterActive', () => {
  it('is false for the empty filter and for whitespace', () => {
    expect(isFilterActive(EMPTY_EFFECTIVE_FILTER)).toBe(false)
    expect(isFilterActive({ ...EMPTY_EFFECTIVE_FILTER, entity: '   ' })).toBe(false)
  })

  it('is true as soon as one dimension is set', () => {
    expect(isFilterActive({ ...EMPTY_EFFECTIVE_FILTER, entity: 'a' })).toBe(true)
    expect(isFilterActive({ ...EMPTY_EFFECTIVE_FILTER, action: 'Read' })).toBe(true)
    expect(isFilterActive({ ...EMPTY_EFFECTIVE_FILTER, rootRoleId: 'r-1' })).toBe(true)
  })
})

describe('effectiveRoleChips', () => {
  it('counts the privileges each role grants, heaviest first', () => {
    const chips = effectiveRoleChips(ENTRIES, [SALES, SERVICE])
    expect(chips.map((c) => [c.roleName, c.count])).toEqual([
      ['Sales', 3],
      ['Service', 2],
    ])
  })

  it('merges a role held directly AND through a team into ONE chip', () => {
    // Two chips would filter identically and suggest the role was held twice.
    const chips = effectiveRoleChips(ENTRIES, [
      SALES,
      viaTeam('r-1', 'Sales', 'Team A'),
      viaTeam('r-1', 'Sales', 'Team B'),
    ])
    expect(chips).toHaveLength(1)
    expect(chips[0].direct).toBe(true)
    expect(chips[0].teams).toEqual(['Team A', 'Team B'])
    expect(chips[0].count).toBe(3)
  })

  it('does not double-count an entry that names the same role twice', () => {
    const twice = [entry('account', 'Read', [SALES, viaTeam('r-1', 'Sales', 'T')])]
    expect(effectiveRoleChips(twice, [SALES])[0].count).toBe(1)
  })

  it('keeps a role that grants nothing, with count 0', () => {
    // An assignment doing no work is a finding — dropping it would hide it.
    const chips = effectiveRoleChips(ENTRIES, [SALES, direct('r-9', 'Empty')])
    expect(chips.map((c) => c.roleName)).toEqual(['Sales', 'Empty'])
    expect(chips[1].count).toBe(0)
  })

  it('sorts equal counts by name', () => {
    const chips = effectiveRoleChips([], [direct('r-2', 'Zeta'), direct('r-1', 'Alpha')])
    expect(chips.map((c) => c.roleName)).toEqual(['Alpha', 'Zeta'])
  })

  it('ignores roles that only appear in entries, never in the assignment list', () => {
    // The chip row mirrors what the user HAS, not what the rows happen to name.
    expect(effectiveRoleChips(ENTRIES, [SALES]).map((c) => c.roleName)).toEqual([
      'Sales',
    ])
  })
})

describe('actionsPresent', () => {
  it('keeps the canonical order and drops unused actions', () => {
    expect(actionsPresent(ENTRIES, PRIVILEGE_ACTIONS)).toEqual([
      'Create',
      'Read',
      'Write',
    ])
  })

  it('is empty for no entries', () => {
    expect(actionsPresent([], PRIVILEGE_ACTIONS)).toEqual([])
  })
})
