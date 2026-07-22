import type {
  ComparerEnvState,
  ComparerResult,
  ComparerRow,
} from '../types/comparer'
import { recomputeDrift } from '../types/comparer'
import type { UserRef } from '../types/solution'
import type { FlowComparerService } from './flowComparerService'
import { ENVIRONMENTS, currentEnvKey } from '../config'
import { processTypeLabel } from '../utils/processType'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** A few users for the owner display + picker offline. */
const MOCK_USERS: UserRef[] = [
  { id: 'u1', name: 'Andy Schwarz', username: 'andy.schwarz@contoso.com' },
  { id: 'u2', name: 'Vanessa Raffler', username: 'vanessa.raffler@contoso.com' },
  {
    id: 'u3',
    name: 'Service Account — Integration',
    username: 'svc.integration@contoso.com',
  },
  { id: 'u4', name: 'Maria Lopez', username: 'maria.lopez@contoso.com' },
]
const userById = (id: string): UserRef | undefined =>
  MOCK_USERS.find((u) => u.id === id)

/** Build a cell; `undefined` active = the process is missing in that env. Only
 *  cloud flows carry a portal link (as in the live service). */
function cell(
  active: boolean | undefined,
  modifiedOn: string,
  isCloudFlow: boolean,
  owner?: UserRef,
): ComparerEnvState {
  if (active === undefined)
    return { present: false, active: false, statusLabel: 'Missing' }
  return {
    present: true,
    active,
    statusLabel: active ? 'Activated' : 'Draft',
    modifiedOn,
    ...(isCloudFlow ? { link: 'https://make.powerautomate.com/' } : {}),
    ownerId: owner?.id,
    ownerName: owner?.name,
  }
}

/**
 * Mock {@link FlowComparerService} — a mix of process kinds (cloud flows with
 * area + definition + owners, plus classic workflows, business rules, an action
 * and a business process flow) across dev/uat/prod, so the process-type
 * grouping, the matrix, both drift modes, the owner column and the bulk actions
 * are all demoable offline.
 */
export const mockFlowComparerService: FlowComparerService = {
  async compareFlows(): Promise<ComparerResult> {
    await delay(350)
    const host = currentEnvKey()
    const envKeys = ENVIRONMENTS.map((e) => e.key)
    const seed: {
      id: string
      name: string
      /** workflow.category — 5 cloud flow, 0 workflow, 2 business rule, … */
      cat: number
      /** Area (cloud flows only) — the secondary grouping dimension. */
      area?: string
      /** Defined desired state (cloud flows only). */
      def?: boolean
      dev: boolean | undefined
      uat: boolean | undefined
      prod: boolean | undefined
      owner?: UserRef
      /** Owner override in PROD to show owners can differ per system. */
      ownerProd?: UserRef
    }[] = [
      // Cloud flows (category 5) — area, definition and per-env owners.
      { id: 'f1', name: 'On Create — Enrich Account', cat: 5, area: 'Sales', def: true, dev: true, uat: true, prod: true, owner: MOCK_USERS[0], ownerProd: MOCK_USERS[1] },
      { id: 'f2', name: 'Nightly — Sync UoM', cat: 5, area: 'Integration', def: true, dev: true, uat: true, prod: false, owner: MOCK_USERS[2] },
      { id: 'f3', name: 'On Update — Notify Owner', cat: 5, area: 'Sales', def: true, dev: true, uat: false, prod: false, owner: MOCK_USERS[0] },
      { id: 'f4', name: 'Approval — Discount', cat: 5, area: 'Finance', def: false, dev: false, uat: false, prod: undefined, owner: MOCK_USERS[1] },
      // Classic workflows (category 0).
      { id: 'w1', name: 'Recalculate Account Rollups', cat: 0, dev: true, uat: true, prod: true, owner: MOCK_USERS[3] },
      { id: 'w2', name: 'Escalate Case (real-time)', cat: 0, dev: true, uat: true, prod: false, owner: MOCK_USERS[3] },
      // Business rules (category 2).
      { id: 'b1', name: 'Require Reason When Lost', cat: 2, dev: true, uat: true, prod: true },
      { id: 'b2', name: 'Show Credit-Hold Warning', cat: 2, dev: true, uat: false, prod: false },
      // Action (category 3).
      { id: 'a1', name: 'Calculate Shipping Cost', cat: 3, dev: true, uat: true, prod: true },
      // Business process flow (category 4).
      { id: 'p1', name: 'Lead To Opportunity Sales Process', cat: 4, dev: true, uat: true, prod: true },
    ]
    const rows = seed.map((s) => {
      const isCloudFlow = s.cat === 5
      const row: ComparerRow = {
        id: s.id,
        name: s.name,
        processCategory: s.cat,
        processType: processTypeLabel(s.cat),
        ...(s.area ? { subtitle: s.area } : {}),
        ...(s.def !== undefined
          ? { definition: s.def ? 'On' : 'Off', definitionActive: s.def }
          : {}),
        byEnv: {
          dev: cell(s.dev, '2026-07-01T09:00:00Z', isCloudFlow, s.owner),
          uat: cell(s.uat, '2026-07-02T09:00:00Z', isCloudFlow, s.owner),
          prod: cell(s.prod, '2026-06-20T09:00:00Z', isCloudFlow, s.ownerProd ?? s.owner),
        } as Record<string, ComparerEnvState | null>,
        statusDrift: false,
      }
      row.statusDrift = recomputeDrift(row, host, envKeys)
      return row
    })
    return { rows, envErrors: {} }
  },
  async setFlowState(_envKey, _id, on): Promise<ComparerEnvState> {
    await delay(200)
    return {
      present: true,
      active: on,
      statusLabel: on ? 'Activated' : 'Draft',
      modifiedOn: '2026-07-09T09:00:00Z',
      link: 'https://make.powerautomate.com/',
    }
  },
  async setFlowOwner(_envKey, _id, userId): Promise<ComparerEnvState> {
    await delay(200)
    const u = userById(userId)
    return {
      present: true,
      active: true,
      statusLabel: 'Activated',
      modifiedOn: '2026-07-09T09:00:00Z',
      link: 'https://make.powerautomate.com/',
      ownerId: userId,
      ownerName: u?.name ?? 'Unknown',
    }
  },
  async listUsers(_envKey, query): Promise<UserRef[]> {
    await delay(120)
    const q = query.trim().toLowerCase()
    return MOCK_USERS.filter(
      (u) =>
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q),
    )
  },
}
