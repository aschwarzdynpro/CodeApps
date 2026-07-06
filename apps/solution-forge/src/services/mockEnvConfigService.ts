import type {
  ConnRefRow,
  ConnRefUsage,
  EnvConfigColumn,
  EnvConfigLoadOptions,
  EnvConfigResult,
  EnvVarCell,
  EnvVarRow,
} from '../types/envConfig'
import { ENV_VAR_TYPE_LABELS, ENV_VAR_TYPE_SECRET } from '../types/envConfig'
import type { EnvConfigService } from './envConfigService'
import { ENVIRONMENTS } from '../config'

/**
 * Mock implementation of {@link EnvConfigService} — a seeded config picture
 * across the configured environments with the classic problems baked in: an
 * env var missing its value in PROD, a secret, a connection reference
 * unbound in UAT, and a setting that only exists in DEV (a transport gap).
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** value per env key; `undefined` = no current value, `null` = definition absent. */
type PerEnv = Record<string, string | undefined | null>

interface EnvVarSeed {
  schema: string
  display: string
  typeCode: number
  default: string
  values: PerEnv
}

interface ConnRefSeed {
  logical: string
  display: string
  connector: string
  /** bound per env key; null = reference absent in that env. */
  bound: Record<string, boolean | null>
}

function envKeys(): string[] {
  return ENVIRONMENTS.map((e) => e.key)
}

const ENV_VAR_SEEDS: EnvVarSeed[] = [
  {
    schema: 'hso_ApiBaseUrl',
    display: 'API Base URL',
    typeCode: 100000000,
    default: '',
    values: { dev: 'https://dev.api.contoso.com', uat: 'https://uat.api.contoso.com', prod: undefined },
  },
  {
    schema: 'hso_MaxBatchSize',
    display: 'Max Batch Size',
    typeCode: 100000001,
    default: '100',
    values: { dev: '250', uat: undefined, prod: undefined },
  },
  {
    schema: 'hso_FeatureFlags',
    display: 'Feature Flags',
    typeCode: 100000003,
    default: '{}',
    values: { dev: '{"newWizard":true}', uat: '{"newWizard":true}', prod: '{"newWizard":false}' },
  },
  {
    schema: 'hso_ServiceAccountSecret',
    display: 'Service Account Secret',
    typeCode: ENV_VAR_TYPE_SECRET,
    default: '',
    values: { dev: 'kv-ref-dev', uat: 'kv-ref-uat', prod: 'kv-ref-prod' },
  },
  {
    schema: 'hso_PilotOnlySetting',
    display: 'Pilot Only Setting',
    typeCode: 100000002,
    default: '',
    // Only defined in DEV — a transport gap.
    values: { dev: 'true', uat: null, prod: null },
  },
]

const CONN_REF_SEEDS: ConnRefSeed[] = [
  {
    logical: 'hso_sharedcommondataservice',
    display: 'Dataverse (current)',
    connector: 'shared_commondataserviceforapps',
    bound: { dev: true, uat: true, prod: true },
  },
  {
    logical: 'hso_sharedoffice365',
    display: 'Office 365 Outlook',
    connector: 'shared_office365',
    // Unbound in UAT — a run-time break waiting to happen.
    bound: { dev: true, uat: false, prod: true },
  },
  {
    logical: 'hso_sharedsftp',
    display: 'SFTP – SSH',
    connector: 'shared_sftpwithssh',
    // Absent in PROD (not transported yet).
    bound: { dev: true, uat: true, prod: null },
  },
]

/** Deterministic pseudo-membership so the solution filter varies per release
 *  offline (real membership comes from `solutioncomponent`). ~2/3 of settings
 *  are "in" a given solution. */
function inSolution(uniqueName: string, name: string): boolean {
  const s = `${uniqueName}|${name}`
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997
  return h % 3 !== 0
}

class MockEnvConfigService implements EnvConfigService {
  async loadEnvConfig(
    onProgress?: (done: number, total: number, label: string) => void,
    options?: EnvConfigLoadOptions,
  ): Promise<EnvConfigResult> {
    const keys = envKeys()
    for (let i = 0; i < ENVIRONMENTS.length; i++) {
      onProgress?.(i, ENVIRONMENTS.length, ENVIRONMENTS[i].label)
      await delay(150)
      onProgress?.(i + 1, ENVIRONMENTS.length, ENVIRONMENTS[i].label)
    }

    const columns: EnvConfigColumn[] = ENVIRONMENTS.map((e) => ({
      key: e.key,
      label: e.label,
      isCurrent: !!e.isCurrent,
    }))

    const envVars: EnvVarRow[] = ENV_VAR_SEEDS.map((seed) => {
      const isSecret = seed.typeCode === ENV_VAR_TYPE_SECRET
      const cells: Record<string, EnvVarCell> = {}
      for (const key of keys) {
        const raw = seed.values[key]
        // null = definition absent in this env; undefined = present, no value.
        if (raw === null) {
          cells[key] = { present: false, hasValue: false, value: '', usingDefault: false }
          continue
        }
        const hasCurrent = typeof raw === 'string' && raw !== ''
        const hasValue = hasCurrent || seed.default !== ''
        const effective = hasCurrent ? raw : seed.default
        cells[key] = {
          present: true,
          hasValue,
          usingDefault: !hasCurrent && seed.default !== '',
          value: isSecret ? (hasValue ? '•••••• (Key Vault)' : '—') : effective,
        }
      }
      return {
        schemaName: seed.schema,
        displayName: seed.display,
        typeLabel: ENV_VAR_TYPE_LABELS[seed.typeCode] ?? 'String',
        isSecret,
        cells,
      }
    })

    const connRefs: ConnRefRow[] = CONN_REF_SEEDS.map((seed) => {
      const cells: Record<string, { present: boolean; bound: boolean }> = {}
      for (const key of keys) {
        const b = seed.bound[key]
        cells[key] = { present: b !== null && b !== undefined, bound: b === true }
      }
      return {
        logicalName: seed.logical,
        displayName: seed.display,
        connectorName: seed.connector,
        cells,
      }
    })

    const sol = options?.solutionUniqueName
    if (sol)
      return {
        columns,
        envVars: envVars.filter((r) => inSolution(sol, r.schemaName)),
        connRefs: connRefs.filter((r) => inSolution(sol, r.logicalName)),
        errors: [],
      }

    return { columns, envVars, connRefs, errors: [] }
  }

  async countConnectionReferenceUsage(): Promise<Record<string, ConnRefUsage>> {
    await delay(200)
    // Seeded so the counter chips are demoable: the Dataverse ref is used by a
    // mix of active and draft flows, Office 365 by two active flows, the SFTP
    // one by none (orphan).
    return {
      hso_sharedcommondataservice: {
        active: 5,
        inactive: 2,
        flows: [
          { id: 'u-flow-cds-01', name: 'PA | Account | Sync to ERP', active: true },
          { id: 'u-flow-cds-02', name: 'PA | Case | Auto-assign owner', active: true },
          { id: 'u-flow-cds-03', name: 'PA | Contact | Dedupe on create', active: true },
          { id: 'u-flow-cds-04', name: 'PA | Order | Post to finance', active: true },
          { id: 'u-flow-cds-05', name: 'PA | Quote | Notify sales', active: true },
          { id: 'u-flow-cds-06', name: 'PA | Lead | Nightly scoring (draft)', active: false },
          { id: 'u-flow-cds-07', name: 'PA | Project | Retired rollup', active: false },
        ],
      },
      hso_sharedoffice365: {
        active: 2,
        inactive: 0,
        flows: [
          { id: 'u-flow-o365-01', name: 'PA | Approval | Email decision', active: true },
          { id: 'u-flow-o365-02', name: 'PA | Digest | Daily summary mail', active: true },
        ],
      },
      hso_sharedsftp: { active: 0, inactive: 0, flows: [] },
    }
  }
}

export const mockEnvConfigService: EnvConfigService = new MockEnvConfigService()
