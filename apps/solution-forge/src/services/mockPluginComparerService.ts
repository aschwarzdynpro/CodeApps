import type { ComparerEnvState, ComparerResult } from '../types/comparer'
import { recomputeDrift } from '../types/comparer'
import type { PluginComparerService } from './pluginComparerService'
import { ENVIRONMENTS, currentEnvKey } from '../config'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function cell(
  active: boolean | undefined,
  version: string,
  modifiedOn: string,
): ComparerEnvState {
  if (active === undefined)
    return { present: false, active: false, statusLabel: 'Missing' }
  return {
    present: true,
    active,
    statusLabel: active ? 'Enabled' : 'Disabled',
    version,
    modifiedOn,
  }
}

/**
 * Mock {@link PluginComparerService} — plugin steps across dev/uat/prod with an
 * assembly version, incl. a status drift and a version drift, so the matrix is
 * demoable offline.
 */
export const mockPluginComparerService: PluginComparerService = {
  async comparePlugins(): Promise<ComparerResult> {
    await delay(350)
    const host = currentEnvKey()
    const envKeys = ENVIRONMENTS.map((e) => e.key)
    const seed: {
      id: string
      name: string
      assembly: string
      dev: [boolean | undefined, string]
      uat: [boolean | undefined, string]
      prod: [boolean | undefined, string]
    }[] = [
      {
        id: 'p1',
        name: 'Account: Create — duplicate check',
        assembly: 'Acme.Plugins',
        dev: [true, '2.1.0.4'],
        uat: [true, '2.1.0.4'],
        prod: [true, '2.1.0.3'],
      },
      {
        id: 'p2',
        name: 'Quote: Update — recalc totals',
        assembly: 'Acme.Plugins',
        dev: [true, '2.1.0.4'],
        uat: [false, '2.1.0.4'],
        prod: [false, '2.1.0.3'],
      },
      {
        id: 'p3',
        name: 'Order: Delete — cascade guard',
        assembly: 'Acme.Orders',
        dev: [true, '1.0.0.9'],
        uat: [true, '1.0.0.9'],
        prod: [undefined, ''],
      },
    ]
    const rows = seed.map((s) => {
      const row = {
        id: s.id,
        name: s.name,
        subtitle: s.assembly,
        byEnv: {
          dev: cell(s.dev[0], s.dev[1], '2026-07-01T09:00:00Z'),
          uat: cell(s.uat[0], s.uat[1], '2026-07-02T09:00:00Z'),
          prod: cell(s.prod[0], s.prod[1], '2026-06-20T09:00:00Z'),
        } as Record<string, ComparerEnvState | null>,
        statusDrift: false,
      }
      row.statusDrift = recomputeDrift(row, host, envKeys)
      return row
    })
    return { rows, envErrors: {} }
  },
  async setStepState(_envKey, _id, on): Promise<ComparerEnvState> {
    await delay(200)
    return {
      present: true,
      active: on,
      statusLabel: on ? 'Enabled' : 'Disabled',
      version: '2.1.0.4',
      modifiedOn: '2026-07-09T09:00:00Z',
    }
  },
}
