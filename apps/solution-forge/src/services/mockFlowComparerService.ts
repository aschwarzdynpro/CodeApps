import type { ComparerEnvState, ComparerResult } from '../types/comparer'
import { recomputeDrift } from '../types/comparer'
import type { FlowComparerService } from './flowComparerService'
import { ENVIRONMENTS, currentEnvKey } from '../config'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Build a cell; `undefined` active = the flow is missing in that env. */
function cell(active: boolean | undefined, modifiedOn: string): ComparerEnvState {
  if (active === undefined) return { present: false, active: false, statusLabel: 'Missing' }
  return {
    present: true,
    active,
    statusLabel: active ? 'Activated' : 'Draft',
    modifiedOn,
    link: 'https://make.powerautomate.com/',
  }
}

/**
 * Mock {@link FlowComparerService} — a handful of flows across dev/uat/prod so
 * the matrix (incl. status drift and a missing flow) is demoable offline.
 */
export const mockFlowComparerService: FlowComparerService = {
  async compareFlows(): Promise<ComparerResult> {
    await delay(350)
    const host = currentEnvKey()
    const envKeys = ENVIRONMENTS.map((e) => e.key)
    const seed: {
      id: string
      name: string
      dev: boolean | undefined
      uat: boolean | undefined
      prod: boolean | undefined
    }[] = [
      { id: 'f1', name: 'On Create — Enrich Account', dev: true, uat: true, prod: true },
      { id: 'f2', name: 'Nightly — Sync UoM', dev: true, uat: true, prod: false },
      { id: 'f3', name: 'On Update — Notify Owner', dev: true, uat: false, prod: false },
      { id: 'f4', name: 'Approval — Discount', dev: true, uat: true, prod: undefined },
    ]
    const rows = seed.map((s) => {
      const row = {
        id: s.id,
        name: s.name,
        byEnv: {
          dev: cell(s.dev, '2026-07-01T09:00:00Z'),
          uat: cell(s.uat, '2026-07-02T09:00:00Z'),
          prod: cell(s.prod, '2026-06-20T09:00:00Z'),
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
}
