import type {
  AlmComponentKind,
  ComparisonResult,
  ComparisonRow,
  ContentPair,
  DeviationKind,
  EnvComponentState,
  EnvKey,
} from '../types/comparison'
import { CONTENT_DIFFABLE_KINDS } from '../types/comparison'
import { ENVIRONMENTS } from '../config'

/**
 * Mock implementation of {@link ComparisonService}: a deterministic sample
 * matrix per solution that demonstrates every deviation type — missing in
 * PROD, draft flow in UAT, disabled plugin step, unmanaged hotfix in PROD —
 * so the Compare tab is fully demoable offline.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString()

interface SeedRow {
  kind: AlmComponentKind
  name: string
  stateful: boolean
  dev?: Partial<EnvComponentState>
  uat?: Partial<EnvComponentState> | 'missing'
  prod?: Partial<EnvComponentState> | 'missing'
  deviations: DeviationKind[]
}

const SEED: SeedRow[] = [
  {
    kind: 'cloudflow',
    name: 'Onboarding approval flow',
    stateful: true,
    deviations: [],
  },
  {
    kind: 'cloudflow',
    name: 'Notify owner on stage change',
    stateful: true,
    uat: { stateLabel: 'Draft', active: false },
    deviations: ['state'],
  },
  {
    kind: 'workflow',
    name: 'Legacy escalation workflow',
    stateful: true,
    prod: 'missing',
    deviations: ['missing'],
  },
  {
    kind: 'businessrule',
    name: 'Require category on case',
    stateful: true,
    deviations: [],
  },
  {
    kind: 'pluginstep',
    name: 'PreCreate quotedetail guard',
    stateful: true,
    prod: { stateLabel: 'Disabled', active: false },
    deviations: ['state'],
  },
  {
    kind: 'webresource',
    name: 'dyn_/onboarding/wizard.js',
    stateful: false,
    prod: { isManaged: false },
    deviations: ['unmanaged'],
  },
  {
    kind: 'webresource',
    name: 'dyn_/sla/timer.js',
    stateful: false,
    uat: 'missing',
    prod: 'missing',
    deviations: ['missing'],
  },
]

function baseState(seed: SeedRow, ageDays: number): EnvComponentState {
  return {
    present: true,
    name: seed.name,
    ...(seed.stateful
      ? {
          stateLabel: seed.kind === 'pluginstep' ? 'Enabled' : 'Activated',
          active: true,
        }
      : {}),
    modifiedOn: daysAgo(ageDays),
    isManaged: true,
  }
}

function envState(
  seed: SeedRow,
  override: Partial<EnvComponentState> | 'missing' | undefined,
  ageDays: number,
  managedDefault: boolean,
): EnvComponentState {
  if (override === 'missing') return { present: false }
  const base = baseState(seed, ageDays)
  base.isManaged = managedDefault
  return { ...base, ...override }
}

export class MockComparisonService {
  async compareSolution(
    solutionId: string,
    onProgress?: (message: string) => void,
  ): Promise<ComparisonResult> {
    onProgress?.('DEV · loading components…')
    await delay(350)
    onProgress?.('UAT · querying…')
    await delay(350)
    onProgress?.('PROD · querying…')
    await delay(350)

    // Vary the sample slightly per solution so switching feels real.
    const offset = [...solutionId].reduce((a, c) => a + c.charCodeAt(0), 0) % 3

    const rows: ComparisonRow[] = SEED.slice(0, SEED.length - offset).map(
      (seed, i) => ({
        ref: {
          objectId: `mock-${solutionId}-${i}`,
          kind: seed.kind,
          name: seed.name,
        },
        byEnv: {
          dev: envState(seed, seed.dev, 10 + i, false),
          uat: envState(seed, seed.uat, 6 + i, true),
          prod: envState(seed, seed.prod, 3 + i, true),
        },
        deviations: seed.deviations,
      }),
    )
    return { rows, envErrors: {} }
  }

  /**
   * Deterministic content-drift demo: the first diffable component present
   * everywhere drifts in PROD; all other diffable components hash equal.
   */
  async checkContentDrift(
    result: ComparisonResult,
    onProgress?: (done: number, total: number) => void,
  ): Promise<ComparisonResult> {
    const presentEnvs = (row: ComparisonRow): EnvKey[] =>
      ENVIRONMENTS.filter((e) => row.byEnv[e.key]?.present).map((e) => e.key)
    const targets = result.rows.filter(
      (r) => CONTENT_DIFFABLE_KINDS.has(r.ref.kind) && presentEnvs(r).length >= 2,
    )
    const driftId = targets[0]?.ref.objectId
    const total = targets.reduce((sum, r) => sum + presentEnvs(r).length, 0)
    let done = 0
    onProgress?.(0, total)

    const rows: ComparisonRow[] = []
    for (const row of result.rows) {
      if (!CONTENT_DIFFABLE_KINDS.has(row.ref.kind) || presentEnvs(row).length < 2) {
        rows.push(row)
        continue
      }
      await delay(120)
      const byEnv = { ...row.byEnv }
      for (const env of ENVIRONMENTS) {
        const state = byEnv[env.key]
        if (!state?.present) continue
        const drifts = row.ref.objectId === driftId && env.key === 'prod'
        byEnv[env.key] = {
          ...state,
          contentHash: drifts ? 'b'.repeat(64) : 'a'.repeat(64),
          contentSize: drifts ? 2480 : 2456,
        }
        done++
        onProgress?.(done, total)
      }
      const deviations = new Set(row.deviations)
      if (row.ref.objectId === driftId) deviations.add('content')
      rows.push({ ...row, byEnv, deviations: [...deviations] })
    }
    return { ...result, rows }
  }

  // Params omitted — the mock returns the same canned pair regardless of
  // component or environments (matches the interface contravariantly, like
  // the other arg-less mock methods).
  async fetchContentPair(): Promise<ContentPair> {
    await delay(300)
    const base = {
      properties: {
        definition: {
          triggers: { When_a_row_is_added: { type: 'OpenApiConnection' } },
          actions: {
            Send_notification: {
              type: 'OpenApiConnection',
              inputs: { parameters: { recipient: 'owner@contoso.com' } },
            },
          },
        },
      },
    }
    const changed = JSON.parse(JSON.stringify(base))
    changed.properties.definition.actions.Send_notification.inputs.parameters.recipient =
      'team@contoso.com'
    return {
      language: 'json',
      a: {
        text: JSON.stringify(base, null, 2),
        present: true,
        size: 2456,
      },
      b: {
        text: JSON.stringify(changed, null, 2),
        present: true,
        size: 2480,
      },
    }
  }
}

export const mockComparisonService = new MockComparisonService()
