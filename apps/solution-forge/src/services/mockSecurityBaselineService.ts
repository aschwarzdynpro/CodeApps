/**
 * Offline implementation of {@link SecurityBaselineService}.
 *
 * It seeds ONE baseline lazily from the mock security models and then bends it
 * so all three baseline verdicts are demonstrable without a connection:
 * a role whose grants changed since the freeze, a role that did not exist at
 * freeze time, and a role that existed then and is gone now. Without that
 * bending the offline demo would show a baseline in which nothing ever
 * happened, which teaches the user nothing about what the mode is for.
 */
import { ENVIRONMENTS, currentEnvKey } from '../config'
import type { SecurityModel } from '../types/roles'
import type { SecuritySnapshotSummary } from '../types/roleComparer'
import {
  encodeBaseline,
  serializeBaseline,
  type BaselinePayload,
} from '../utils/securityBaseline'
import { roleMatchKey } from '../utils/roleCompare'
import { mockRoleAnalyzerService } from './mockRoleAnalyzerService'
import type {
  SaveBaselineInput,
  SecurityBaselineService,
} from './securityBaselineService'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface StoredBaseline {
  summary: SecuritySnapshotSummary
  payload: string
}

const stored: StoredBaseline[] = []
let seeded: Promise<void> | null = null

/** Bend the freshly encoded payload so each verdict has an example. */
function bendForDemo(payload: BaselinePayload): BaselinePayload {
  const host = currentEnvKey()
  for (const [envKey, roles] of Object.entries(payload.envs)) {
    // "Changed since baseline": the frozen copy has one grant fewer, so the
    // current model shows an addition.
    const sued = roles.find((r) => roleMatchKey(r.n) === 'vertrieb süd')
    if (sued && sued.g.length > 1) sued.g = sued.g.slice(0, -1)
    // "New since baseline": drop a role that exists today.
    payload.envs[envKey] = roles.filter(
      (r) => roleMatchKey(r.n) !== 'service desk',
    )
    // "Gone since baseline": a role the freeze knew and nothing has now.
    if (envKey === host) {
      payload.envs[envKey].push({
        n: 'Alte Testrolle 2024',
        i: 'role-retired-2024',
        m: 0,
        g: [],
        x: ['prvExportToExcel'],
      })
    }
  }
  return payload
}

async function seed(): Promise<void> {
  const envKeys = ENVIRONMENTS.map((e) => e.key)
  const models: Record<string, SecurityModel | null> = {}
  for (const key of envKeys) models[key] = await mockRoleAnalyzerService.loadModel(key)
  const payload = bendForDemo(encodeBaseline(models, envKeys, null))
  const roleCount = Object.values(payload.envs).reduce(
    (max, roles) => Math.max(max, roles.length),
    0,
  )
  stored.push({
    summary: {
      id: 'baseline-demo-1',
      name: 'Freigabe Q2/2026',
      scope: 'Custom roles',
      envKeys,
      roleCount,
      frozenOn: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
      frozenBy: 'Andy Schwarz',
      notes: 'Stand nach dem Sicherheits-Review.',
    },
    payload: serializeBaseline(payload),
  })
}

function ensureSeeded(): Promise<void> {
  seeded ??= seed()
  return seeded
}

class MockSecurityBaselineService implements SecurityBaselineService {
  async list(): Promise<SecuritySnapshotSummary[]> {
    await ensureSeeded()
    await delay(120)
    return stored.map((s) => s.summary)
  }

  async getPayload(id: string): Promise<string | null> {
    await ensureSeeded()
    await delay(120)
    return stored.find((s) => s.summary.id === id)?.payload ?? null
  }

  async save(input: SaveBaselineInput): Promise<SecuritySnapshotSummary> {
    await ensureSeeded()
    await delay(200)
    const summary: SecuritySnapshotSummary = {
      id: `baseline-${stored.length + 1}`,
      name: input.name,
      scope: input.scope,
      envKeys: input.envKeys,
      roleCount: input.roleCount,
      frozenOn: new Date().toISOString(),
      frozenBy: 'You (offline)',
      notes: input.notes,
    }
    stored.unshift({ summary, payload: input.payload })
    return summary
  }

  async remove(id: string): Promise<void> {
    await ensureSeeded()
    await delay(120)
    const index = stored.findIndex((s) => s.summary.id === id)
    if (index >= 0) stored.splice(index, 1)
  }
}

export const mockSecurityBaselineService = new MockSecurityBaselineService()
