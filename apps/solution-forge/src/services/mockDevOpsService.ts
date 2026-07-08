import type { WorkItemInfo } from '../types/solution'
import type { WorkItemPick } from '../utils/workItem'
import type { DevOpsService } from './devOpsService'
import { isDevOpsAvailable, setDevOpsConnectionBound } from '../config'

/**
 * Mock {@link DevOpsService} — seeded work items matching the demo solutions'
 * DevOps ids so the Azure DevOps card is fully demoable offline. Mock mode
 * treats the connection reference as bound (so {@link isDevOpsAvailable} is true
 * once the mock runtime config enables DevOps).
 */

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Sample work items matching the seeded solutions' DevOps ids. */
const MOCK_WORK_ITEMS: Record<string, Omit<WorkItemInfo, 'id' | 'url'>> = {
  '4711': {
    type: 'Feature',
    title: 'Customer onboarding wizard',
    state: 'Active',
    assignedTo: 'Marie Curie',
    description:
      'Guided multi-step wizard to onboard new customers, capturing account, contacts and initial opportunity in one flow.',
  },
  '4720': {
    type: 'Feature',
    title: 'Service-level dashboards',
    state: 'New',
    assignedTo: 'Niels Bohr',
    description: 'Operational dashboards for SLA attainment per service team.',
  },
  '4732': {
    type: 'Bug',
    title: 'Duplicate detection fires twice on quote lines',
    state: 'Active',
    assignedTo: 'Lise Meitner',
    description:
      'On saving a quote the duplicate-detection plugin runs twice, producing two warning dialogs.',
  },
  '4699': {
    type: 'Bug',
    title: 'Wrong currency on opportunity rollup',
    state: 'Resolved',
    assignedTo: 'Max Planck',
    description: 'Rollup totals ignore the transaction currency and assume base currency.',
  },
  '4655': {
    type: 'Feature',
    title: 'Partner portal access requests',
    state: 'Closed',
    assignedTo: null,
    description: 'Self-service access-request queue for partner-portal users.',
  },
}

class MockDevOpsService implements DevOpsService {
  async refreshAvailability(): Promise<boolean> {
    // Offline demo: the connection reference counts as bound so the DevOps card
    // shows (gated only by the mock runtime config's devOpsEnabled flag).
    setDevOpsConnectionBound(true)
    return isDevOpsAvailable()
  }

  async getWorkItem(devOpsId: string): Promise<WorkItemInfo | null> {
    await delay(350)
    const item = MOCK_WORK_ITEMS[devOpsId]
    if (!item) return null
    return { ...item, id: devOpsId, url: null }
  }

  async getWorkItems(devOpsIds: string[]): Promise<WorkItemInfo[]> {
    await delay(300)
    const out: WorkItemInfo[] = []
    for (const id of new Set(devOpsIds.map((i) => i.trim()))) {
      const item = MOCK_WORK_ITEMS[id]
      if (item) out.push({ ...item, id, url: null })
    }
    return out
  }

  async searchWorkItems(term: string): Promise<WorkItemPick[]> {
    await delay(250)
    const q = term.trim().toLowerCase()
    if (q.length < 2) return []
    return Object.entries(MOCK_WORK_ITEMS)
      .filter(
        ([id, wi]) => id.includes(q) || wi.title.toLowerCase().includes(q),
      )
      .map(([id, wi]) => ({
        id,
        title: wi.title,
        type: wi.type,
        state: wi.state,
        assignedTo: wi.assignedTo ?? '',
      }))
  }

  async getAttachment(): Promise<string | null> {
    // Offline demo has no attachment bytes — the seeded descriptions carry no
    // images, so nothing calls this in mock mode.
    return null
  }

  async myWorkItems(): Promise<WorkItemPick[]> {
    await delay(300)
    const closed = new Set(['closed', 'done', 'removed'])
    return Object.entries(MOCK_WORK_ITEMS)
      .filter(([, wi]) => !closed.has(wi.state.toLowerCase()))
      .map(([id, wi]) => ({
        id,
        title: wi.title,
        type: wi.type,
        state: wi.state,
        assignedTo: wi.assignedTo ?? '',
      }))
  }
}

export const mockDevOpsService: DevOpsService = new MockDevOpsService()
