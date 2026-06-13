import type { EnvKey } from '../types/comparison'
import type {
  AppSharingResult,
  AppSharingRow,
  AppSharingState,
  SharedPrincipal,
} from '../types/sharing'
import type { SharingService } from './sharingService'
import { ENVIRONMENTS } from '../config'

/**
 * Mock implementation of {@link SharingService}: a deterministic sample
 * that demonstrates the key cases — an app shared in DEV but reaching
 * nobody in PROD (the warning), an app shared everywhere, a custom page
 * (access via app roles, so "not shared" is normal), and an app not yet
 * deployed to PROD.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const user = (name: string, access = 'Read'): SharedPrincipal => ({
  id: `u-${name}`,
  type: 'user',
  name,
  access,
})
const team = (name: string, access = 'Read'): SharedPrincipal => ({
  id: `t-${name}`,
  type: 'team',
  name,
  access,
})

const present = (
  principals: SharedPrincipal[],
  ownerName = 'Marie Curie',
): AppSharingState => ({ present: true, appId: 'mock', ownerName, principals })

const MOCK_ROWS: AppSharingRow[] = [
  {
    name: 'dyn_onboardinghub_8a2c1',
    displayName: 'Onboarding Hub',
    kind: 'canvas',
    byEnv: {
      dev: present([user('Marie Curie', 'Co-owner'), team('Field Service', 'Read')]),
      uat: present([team('Field Service', 'Read')]),
      // Deployed to PROD but shared with nobody — the actionable gap.
      prod: present([], 'Deployment SP'),
    },
  },
  {
    name: 'dyn_fieldinspections_4f7b9',
    displayName: 'Field Inspections',
    kind: 'canvas',
    byEnv: {
      dev: present([user('Niels Bohr', 'Co-owner'), user('Lise Meitner', 'Read, Write')]),
      uat: present([user('Lise Meitner', 'Read, Write')]),
      prod: present([user('Lise Meitner', 'Read'), team('Inspectors', 'Read')]),
    },
  },
  {
    name: 'dyn_quotereview_page_1d3e',
    displayName: 'Quote Review (page)',
    kind: 'custompage',
    byEnv: {
      // Custom pages get access via the model-driven app's roles — empty
      // sharing is expected, not a problem.
      dev: present([]),
      uat: present([]),
      prod: present([]),
    },
  },
  {
    name: 'dyn_sharedcontrols_lib_9c0a',
    displayName: 'Shared Controls',
    kind: 'componentlibrary',
    byEnv: {
      dev: present([team('Makers', 'Read')]),
      uat: present([team('Makers', 'Read')]),
      prod: { present: false, principals: [] },
    },
  },
]

export class MockSharingService implements SharingService {
  async checkAppSharing(
    _solutionId: string,
    onProgress?: (message: string) => void,
  ): Promise<AppSharingResult> {
    const rows = MOCK_ROWS.map((r) => ({
      ...r,
      byEnv: { ...r.byEnv },
    }))
    const total = rows.length * ENVIRONMENTS.length
    let done = 0
    for (const env of ENVIRONMENTS) {
      for (const row of rows) {
        await delay(60)
        onProgress?.(`${env.label} · ${row.displayName} (${++done}/${total})`)
      }
    }
    const envErrors: Partial<Record<EnvKey, string>> = {}
    return { rows, envErrors }
  }
}

export const mockSharingService = new MockSharingService()
