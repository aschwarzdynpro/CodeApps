import type { ComparerEnvState, ComparerResult } from '../types/comparer'
import { recomputeDrift } from '../types/comparer'
import type { FlowComparerService } from './flowComparerService'
import { ENVIRONMENTS, currentEnvKey } from '../config'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Build a cell; `undefined` active = missing. `desired` = defined state label. */
function cell(
  active: boolean | undefined,
  modifiedOn: string,
  desired?: string,
): ComparerEnvState {
  if (active === undefined)
    return { present: false, active: false, statusLabel: 'Missing' }
  return {
    present: true,
    active,
    statusLabel: active ? 'Activated' : 'Draft',
    modifiedOn,
    link: 'https://make.powerautomate.com/',
    ...(desired
      ? { desired, desiredActive: /^\s*on\s*$/i.test(desired) }
      : {}),
  }
}

/**
 * Mock {@link FlowComparerService} — flows across dev/uat/prod with a defined
 * desired state (hso_cloudflow) and per-env desired states, incl. drift, an
 * off-definition env and a missing flow, so the matrix is demoable offline.
 */
export const mockFlowComparerService: FlowComparerService = {
  async compareFlows(): Promise<ComparerResult> {
    await delay(350)
    const host = currentEnvKey()
    const envKeys = ENVIRONMENTS.map((e) => e.key)
    const seed: {
      id: string
      name: string
      def: string
      dev: [boolean | undefined, string]
      uat: [boolean | undefined, string]
      prod: [boolean | undefined, string]
    }[] = [
      // fully in line with its definition
      {
        id: 'f1',
        name: 'On Create — Enrich Account',
        def: 'On',
        dev: [true, 'On'],
        uat: [true, 'On'],
        prod: [true, 'On'],
      },
      // prod is Draft but defined On → off-definition in prod
      {
        id: 'f2',
        name: 'Nightly — Sync UoM',
        def: 'On',
        dev: [true, 'On'],
        uat: [true, 'On'],
        prod: [false, 'On'],
      },
      // uat + prod off, defined On → off-definition; also status drift vs current
      {
        id: 'f3',
        name: 'On Update — Notify Owner',
        def: 'On',
        dev: [true, 'On'],
        uat: [false, 'On'],
        prod: [false, 'On'],
      },
      // defined Off everywhere; missing in prod
      {
        id: 'f4',
        name: 'Approval — Discount',
        def: 'Off',
        dev: [false, 'Off'],
        uat: [false, 'Off'],
        prod: [undefined, 'Off'],
      },
    ]
    const rows = seed.map((s) => {
      const row = {
        id: s.id,
        name: s.name,
        definition: s.def,
        definitionActive: /^on$/i.test(s.def),
        byEnv: {
          dev: cell(s.dev[0], '2026-07-01T09:00:00Z', s.dev[1]),
          uat: cell(s.uat[0], '2026-07-02T09:00:00Z', s.uat[1]),
          prod: cell(s.prod[0], '2026-06-20T09:00:00Z', s.prod[1]),
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
      desired: on ? 'On' : 'Off',
      desiredActive: on,
    }
  },
}
