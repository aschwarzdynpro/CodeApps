import type {
  AlmComponentKind,
  ComparisonResult,
  ComparisonRow,
  DeviationKind,
  EnvComponentState,
  EnvKey,
} from '../types/comparison'
import type { ComparisonService } from './comparisonService'
import { mockComparisonService } from './mockComparisonService'
import { powerModeReady } from '../PowerProvider'
import { ENVIRONMENTS } from '../config'
import { SolutioncomponentsService } from '../generated/services/SolutioncomponentsService'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'

/**
 * Real implementation of {@link ComparisonService}.
 *
 * Component membership comes from the current environment's
 * `solutioncomponent` table (native data source). The per-environment
 * snapshots — including the current environment, for one uniform code
 * path — go through the Microsoft Dataverse connector's
 * `ListRecordsWithOrganization` ("List rows from selected environment"),
 * so the comparison runs with the signed-in user's privileges in each
 * target environment.
 *
 * All compared component types live in three tables whose primary ids
 * survive solution import, which makes the GUID the comparison key:
 *   - workflow                 (category 0 = workflow, 2 = business rule,
 *                               5 = cloud flow; others grouped as workflow)
 *   - sdkmessageprocessingstep (plugin steps)
 *   - webresource              (scripts; no state — content-only)
 *
 * Note on modifiedon: solution import rewrites it in the target, so it is
 * surfaced as information but deliberately NOT used as a drift signal.
 * Content hashing (clientdata / xaml / content) is the planned upgrade.
 */

/** solutioncomponent componenttype codes relevant to the comparison. */
const TYPE_WORKFLOW = 29
const TYPE_SDK_STEP = 92
const TYPE_WEB_RESOURCE = 61

const WORKFLOW_KIND_BY_CATEGORY: Record<number, AlmComponentKind> = {
  0: 'workflow',
  2: 'businessrule',
  5: 'cloudflow',
}

type Row = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** OData `or`-chunk size — keeps the filter well under URL length limits. */
const ID_CHUNK = 20

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

interface TableSpec {
  /** Entity set name for the connector's entityName parameter. */
  entitySet: string
  idField: string
  select: string[]
  toState(row: Row): EnvComponentState
}

/** Workflow snapshots carry the category so rows can be bucketed. */
interface WorkflowState extends EnvComponentState {
  category?: number
}

const WORKFLOW_SPEC: TableSpec = {
  entitySet: 'workflows',
  idField: 'workflowid',
  select: ['workflowid', 'name', 'category', 'statecode', 'modifiedon', 'ismanaged'],
  toState: (row) => {
    const state: WorkflowState = {
      present: true,
      name: str(row.name),
      stateLabel: Number(row.statecode) === 1 ? 'Activated' : 'Draft',
      active: Number(row.statecode) === 1,
      modifiedOn: str(row.modifiedon),
      isManaged: row.ismanaged === true,
      category: Number(row.category ?? 0),
    }
    return state
  },
}

const STEP_SPEC: TableSpec = {
  entitySet: 'sdkmessageprocessingsteps',
  idField: 'sdkmessageprocessingstepid',
  select: [
    'sdkmessageprocessingstepid',
    'name',
    'statecode',
    'modifiedon',
    'ismanaged',
  ],
  toState: (row) => ({
    present: true,
    name: str(row.name),
    // sdkmessageprocessingstep: statecode 0 = Enabled, 1 = Disabled.
    stateLabel: Number(row.statecode) === 0 ? 'Enabled' : 'Disabled',
    active: Number(row.statecode) === 0,
    modifiedOn: str(row.modifiedon),
    isManaged: row.ismanaged === true,
  }),
}

const WEB_RESOURCE_SPEC: TableSpec = {
  entitySet: 'webresources',
  idField: 'webresourceid',
  select: ['webresourceid', 'name', 'modifiedon', 'ismanaged'],
  toState: (row) => ({
    present: true,
    name: str(row.name),
    modifiedOn: str(row.modifiedon),
    isManaged: row.ismanaged === true,
  }),
}

/** Per-environment lookup: table spec → (objectId → state). */
type EnvSnapshot = Map<TableSpec, Map<string, EnvComponentState>>

export class DataverseComparisonService implements ComparisonService {
  /** Fetch the rows for one table in one environment, keyed by id. */
  private async queryByIds(
    orgUrl: string,
    spec: TableSpec,
    ids: string[],
  ): Promise<Map<string, EnvComponentState>> {
    const map = new Map<string, EnvComponentState>()
    for (const chunk of chunks(ids, ID_CHUNK)) {
      const filter = chunk.map((id) => `${spec.idField} eq ${id}`).join(' or ')
      const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
        orgUrl,
        spec.entitySet,
        undefined,
        undefined,
        undefined,
        undefined,
        spec.select.join(','),
        filter,
      )
      if (!result.success) {
        console.warn(
          `[compare] ${spec.entitySet} query failed for ${orgUrl}:`,
          result,
        )
        throw new Error(`Query against ${spec.entitySet} failed`)
      }
      const rows = (result.data as { value?: Row[] } | undefined)?.value ?? []
      for (const row of rows) {
        const id = str(row[spec.idField])
        if (id) map.set(id, spec.toState(row))
      }
    }
    return map
  }

  async compareSolution(
    solutionId: string,
    onProgress?: (message: string) => void,
  ): Promise<ComparisonResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockComparisonService.compareSolution(solutionId, onProgress)

    // 1. Component membership from the current environment.
    onProgress?.('Resolving solution components…')
    const components: Row[] = []
    let skipToken: string | undefined
    do {
      const result = await SolutioncomponentsService.getAll({
        select: ['solutioncomponentid', 'componenttype', 'objectid'],
        filter: `_solutionid_value eq ${solutionId}`,
        ...(skipToken ? { skipToken } : {}),
      })
      if (!result.success || !result.data)
        throw new Error('Could not load the solution components.')
      components.push(...(result.data as unknown as Row[]))
      skipToken = result.skipToken
    } while (skipToken)

    const idsBySpec = new Map<TableSpec, string[]>([
      [WORKFLOW_SPEC, []],
      [STEP_SPEC, []],
      [WEB_RESOURCE_SPEC, []],
    ])
    for (const c of components) {
      const objectId = str(c.objectid)
      if (!objectId) continue
      switch (Number(c.componenttype)) {
        case TYPE_WORKFLOW:
          idsBySpec.get(WORKFLOW_SPEC)!.push(objectId)
          break
        case TYPE_SDK_STEP:
          idsBySpec.get(STEP_SPEC)!.push(objectId)
          break
        case TYPE_WEB_RESOURCE:
          idsBySpec.get(WEB_RESOURCE_SPEC)!.push(objectId)
          break
      }
    }

    // 2. Snapshot every environment (uniform connector path).
    const snapshots = new Map<EnvKey, EnvSnapshot>()
    const envErrors: Partial<Record<EnvKey, string>> = {}
    for (const env of ENVIRONMENTS) {
      onProgress?.(`${env.label} · querying…`)
      const orgUrl = env.url.replace(/\/+$/, '')
      try {
        const snapshot: EnvSnapshot = new Map()
        await Promise.all(
          [...idsBySpec.entries()].map(async ([spec, ids]) => {
            snapshot.set(
              spec,
              ids.length ? await this.queryByIds(orgUrl, spec, ids) : new Map(),
            )
          }),
        )
        snapshots.set(env.key, snapshot)
      } catch (err) {
        console.warn(`[compare] environment ${env.key} failed:`, err)
        envErrors[env.key] =
          err instanceof Error ? err.message : 'Environment query failed'
      }
    }

    // 3. Build rows from the DEV membership; the DEV snapshot provides
    //    names and kinds (workflow category decides the bucket).
    const devSnapshot = snapshots.get('dev')
    const rows: ComparisonRow[] = []
    for (const [spec, ids] of idsBySpec) {
      for (const objectId of ids) {
        const states: Record<EnvKey, EnvComponentState | null> = {
          dev: null,
          uat: null,
          prod: null,
        }
        for (const env of ENVIRONMENTS) {
          const snapshot = snapshots.get(env.key)
          if (!snapshot) continue // env errored — stays null
          states[env.key] = snapshot.get(spec)?.get(objectId) ?? {
            present: false,
          }
        }

        const dev = states.dev
        const kind = this.kindOf(spec, devSnapshot, objectId)
        rows.push({
          ref: {
            objectId,
            kind,
            name: dev?.name || objectId,
          },
          byEnv: states,
          deviations: this.deviationsOf(states),
        })
      }
    }

    rows.sort(
      (a, b) =>
        a.ref.kind.localeCompare(b.ref.kind) ||
        a.ref.name.localeCompare(b.ref.name),
    )
    return { rows, envErrors }
  }

  /** Workflow rows split into cloud flow / business rule / workflow. */
  private kindOf(
    spec: TableSpec,
    devSnapshot: EnvSnapshot | undefined,
    objectId: string,
  ): AlmComponentKind {
    if (spec === STEP_SPEC) return 'pluginstep'
    if (spec === WEB_RESOURCE_SPEC) return 'webresource'
    const devState = devSnapshot?.get(spec)?.get(objectId) as
      | WorkflowState
      | undefined
    return WORKFLOW_KIND_BY_CATEGORY[devState?.category ?? 0] ?? 'workflow'
  }

  private deviationsOf(
    states: Record<EnvKey, EnvComponentState | null>,
  ): DeviationKind[] {
    const dev = states.dev
    const deviations = new Set<DeviationKind>()
    if (!dev?.present) return []
    for (const key of ['uat', 'prod'] as EnvKey[]) {
      const target = states[key]
      if (!target) continue // env not queryable — no verdict
      if (!target.present) {
        deviations.add('missing')
        continue
      }
      if (
        dev.active !== undefined &&
        target.active !== undefined &&
        dev.active !== target.active
      ) {
        deviations.add('state')
      }
      if (target.isManaged === false) deviations.add('unmanaged')
    }
    return [...deviations]
  }
}

export const dataverseComparisonService = new DataverseComparisonService()
