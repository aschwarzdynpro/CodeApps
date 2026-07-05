import type {
  FieldSecurityProfile,
  FieldSecurityResult,
} from '../types/fieldSecurity'
import type { FieldSecurityService } from './fieldSecurityService'
import { pivotSecuredColumns } from '../utils/fieldSecurity'

/**
 * Mock implementation of {@link FieldSecurityService} — a seeded field-
 * security setup: a few secured columns across profiles, users/teams
 * assigned, and one profile assigned to nobody (a dead profile) so the gap
 * flag is demoable offline.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const perm = (
  entity: string,
  attribute: string,
  o: Partial<{ canRead: boolean; canCreate: boolean; canUpdate: boolean; canReadUnmasked: boolean }> = {},
) => ({
  entity,
  attribute,
  canRead: true,
  canCreate: false,
  canUpdate: false,
  canReadUnmasked: false,
  ...o,
})

const PROFILES: FieldSecurityProfile[] = [
  {
    id: 'fsp-hr',
    name: 'HR – full',
    isManaged: false,
    columns: [
      perm('contact', 'hso_salary', { canUpdate: true, canReadUnmasked: true }),
      perm('contact', 'hso_nationalid', { canReadUnmasked: true }),
      perm('systemuser', 'hso_bankaccount', { canUpdate: true }),
    ],
    userNames: ['Andy Schwarz', 'Marie Curie'],
    teamNames: ['HR Team'],
  },
  {
    id: 'fsp-sales',
    name: 'Sales – read only',
    isManaged: false,
    columns: [
      // Same columns as HR but read-only (masked national id).
      perm('contact', 'hso_salary', { canRead: false }),
      perm('account', 'hso_creditscore', { canRead: true }),
    ],
    userNames: ['Niels Bohr'],
    teamNames: ['Sales DE'],
  },
  {
    id: 'fsp-legacy',
    name: 'Legacy pilot (unused)',
    isManaged: false,
    columns: [perm('account', 'hso_creditscore', { canUpdate: true })],
    // Assigned to nobody — a dead profile.
    userNames: [],
    teamNames: [],
  },
]

class MockFieldSecurityService implements FieldSecurityService {
  async loadFieldSecurity(_envKey: string): Promise<FieldSecurityResult> {
    void _envKey
    await delay(250)
    const profiles = PROFILES.map((p) => ({
      ...p,
      columns: [...p.columns],
      userNames: [...p.userNames],
      teamNames: [...p.teamNames],
    }))
    return { profiles, columns: pivotSecuredColumns(profiles) }
  }
}

export const mockFieldSecurityService: FieldSecurityService =
  new MockFieldSecurityService()
