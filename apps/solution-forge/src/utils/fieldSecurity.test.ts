import { describe, expect, it } from 'vitest'
import { pivotSecuredColumns, readReach } from './fieldSecurity'
import type { FieldSecurityProfile } from '../types/fieldSecurity'

const perm = (
  entity: string,
  attribute: string,
  over: Partial<{ canRead: boolean; canCreate: boolean; canUpdate: boolean; canReadUnmasked: boolean }> = {},
) => ({
  entity,
  attribute,
  canRead: true,
  canCreate: false,
  canUpdate: false,
  canReadUnmasked: false,
  ...over,
})

const profile = (
  id: string,
  name: string,
  columns: FieldSecurityProfile['columns'],
  userNames: string[] = [],
  teamNames: string[] = [],
): FieldSecurityProfile => ({ id, name, isManaged: false, columns, userNames, teamNames })

describe('pivotSecuredColumns', () => {
  it('groups the same column across profiles', () => {
    const cols = pivotSecuredColumns([
      profile('p1', 'HR', [perm('contact', 'salary')], ['Ann'], []),
      profile('p2', 'Finance', [perm('contact', 'salary', { canUpdate: true })], ['Bob'], ['Auditors']),
    ])
    expect(cols).toHaveLength(1)
    expect(cols[0]).toMatchObject({ entity: 'contact', attribute: 'salary' })
    expect(cols[0].grants.map((g) => g.profileName).sort()).toEqual([
      'Finance',
      'HR',
    ])
  })

  it('keeps distinct columns separate and sorts them', () => {
    const cols = pivotSecuredColumns([
      profile('p1', 'P', [perm('account', 'creditscore'), perm('contact', 'ssn')]),
    ])
    expect(cols.map((c) => `${c.entity}.${c.attribute}`)).toEqual([
      'account.creditscore',
      'contact.ssn',
    ])
  })
})

describe('readReach', () => {
  it('sums users + teams of the profiles that grant read', () => {
    const cols = pivotSecuredColumns([
      profile('p1', 'HR', [perm('contact', 'salary', { canRead: true })], ['Ann', 'Cy'], ['T1']),
      profile('p2', 'NoRead', [perm('contact', 'salary', { canRead: false })], ['Bob'], []),
    ])
    // Only the read-granting profile counts: 2 users + 1 team = 3.
    expect(readReach(cols[0])).toBe(3)
  })
})
