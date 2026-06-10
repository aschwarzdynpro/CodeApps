import type {
  AlmComponentKind,
  ComparisonResult,
  ComparisonRow,
  DeviationKind,
  EnvComponentState,
} from '../types/comparison'

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
}

export const mockComparisonService = new MockComparisonService()
