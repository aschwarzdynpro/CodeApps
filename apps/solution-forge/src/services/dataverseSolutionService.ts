import type {
  CreateWorkingSolutionInput,
  MergeResult,
  PublisherInfo,
  SolutionComponentInfo,
  WorkingSolution,
} from '../types/solution'
import type { SolutionService } from './solutionService'
import { mockSolutionService } from './mockSolutionService'
import { powerModeReady } from '../PowerProvider'
import { buildUniqueName, classifyUniqueName } from '../utils/naming'
import { shortGuid } from '../utils/format'

/**
 * Real implementation of {@link SolutionService} backed by the Dataverse
 * `solution`, `publisher` and `solutioncomponent` tables plus the
 * `AddSolutionComponent` action (merge). It auto-falls back to the mock
 * service when running outside a Power Platform host or before the generated
 * data sources exist, so plain `npm run dev` always produces a usable app.
 *
 * Wiring (run inside apps/solution-forge/, see README):
 *   pac code add-data-source -a dataverse -t solution
 *   pac code add-data-source -a dataverse -t publisher
 *   pac code add-data-source -a dataverse -t solutioncomponent
 *   power-apps add-dataverse-api          # pick AddSolutionComponent
 *
 * The generated modules under src/generated/services are loaded dynamically
 * (`loadService` below) so this file compiles and the Vite build stays green
 * before the generators have ever run. Once `src/generated/` exists, replace
 * the dynamic lookups with static imports (mirroring audit-explorer's
 * dataverseAuditService) — dynamic specifiers are not bundled for production.
 *
 * Mode gating: every method awaits {@link powerModeReady} before touching the
 * generated client. Outside the host the SDK's connection lookup stalls
 * indefinitely instead of throwing, so a plain try/catch around the call
 * isn't enough — we short-circuit to mock when the provider has resolved to
 * `local-mock`.
 */

/** Shape of the IOperationResult returned by every generated service call. */
interface OperationResult<T> {
  success: boolean
  data?: T
  skipToken?: string
}

type Row = Record<string, unknown>

/** Structural view of a generated table service (AuditsService-style class). */
interface GeneratedTableService {
  getAll(options?: {
    select?: string[]
    filter?: string
    orderBy?: string[]
    skipToken?: string
  }): Promise<OperationResult<Row[]>>
  create(record: Row): Promise<OperationResult<Row>>
}

/**
 * Load a generated service class by module/export name candidates. Returns
 * null when src/generated doesn't exist yet (pre-wiring) — callers fall back
 * to the mock service. The indirection through a plain string keeps both tsc
 * and Vite from trying to resolve the module at build time.
 */
async function loadService(candidates: string[]): Promise<Row | null> {
  for (const name of candidates) {
    const specifier = `../generated/services/${name}.ts`
    try {
      const mod = (await import(/* @vite-ignore */ specifier)) as Row
      const exported = mod[name] ?? Object.values(mod)[0]
      if (exported) return exported as Row
    } catch {
      // Module missing — try the next candidate.
    }
  }
  return null
}

const asTableService = (svc: Row | null): GeneratedTableService | null =>
  svc && typeof (svc as { getAll?: unknown }).getAll === 'function'
    ? (svc as unknown as GeneratedTableService)
    : null

/** OData annotation suffix carrying option-set / lookup display labels. */
const FV = '@OData.Community.Display.V1.FormattedValue'

function formatted(row: Row, column: string): string | undefined {
  const value = row[`${column}${FV}`]
  return typeof value === 'string' && value !== '' ? value : undefined
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Friendly labels for the `componenttype` codes a dev solution typically
 * contains. The formatted-value annotation wins when the runtime delivers
 * one; this map is the fallback, and unknown codes render as "Type <code>".
 */
const COMPONENT_TYPE_LABELS: Record<number, string> = {
  1: 'Table',
  2: 'Column',
  3: 'Relationship',
  9: 'Choice',
  10: 'Table Relationship',
  20: 'Security Role',
  24: 'Form',
  26: 'View',
  29: 'Process',
  31: 'Report',
  36: 'Email Template',
  44: 'Duplicate Rule',
  59: 'Chart',
  60: 'Form',
  61: 'Web Resource',
  62: 'Site Map',
  63: 'Connection Role',
  66: 'Custom Control',
  70: 'Field Security Profile',
  80: 'Model-driven App',
  91: 'Plugin Assembly',
  92: 'SDK Message Step',
  93: 'SDK Message Step Image',
  95: 'Service Endpoint',
  150: 'Routing Rule',
  300: 'Canvas App',
  371: 'Connector',
  372: 'Connection Reference',
  380: 'Environment Variable',
  381: 'Environment Variable Value',
}

const SOLUTION_SELECT = [
  'solutionid',
  'uniquename',
  'friendlyname',
  'description',
  'version',
  'ismanaged',
  'createdon',
  'modifiedon',
  '_publisherid_value',
]

function toWorkingSolution(row: Row): WorkingSolution {
  const uniqueName = str(row.uniquename)
  const { kind, devOpsId } = classifyUniqueName(uniqueName)
  const publisherId = str(row._publisherid_value)
  return {
    id: str(row.solutionid),
    uniqueName,
    title: str(row.friendlyname) || uniqueName,
    description: str(row.description),
    kind,
    devOpsId,
    version: str(row.version),
    isManaged: row.ismanaged === true,
    createdOn: str(row.createdon),
    modifiedOn: str(row.modifiedon),
    publisher: publisherId
      ? {
          id: publisherId,
          uniqueName: '',
          friendlyName: formatted(row, '_publisherid_value') ?? '',
          prefix: '',
        }
      : null,
  }
}

function toComponentInfo(row: Row): SolutionComponentInfo {
  const typeCode = Number(row.componenttype ?? 0)
  const typeName =
    formatted(row, 'componenttype') ??
    COMPONENT_TYPE_LABELS[typeCode] ??
    `Type ${typeCode}`
  const objectId = str(row.objectid)
  return {
    id: str(row.solutioncomponentid),
    objectId,
    typeCode,
    typeName,
    // The base table doesn't carry display names; the maker portal resolves
    // them via msdyn_solutioncomponentsummary. Until that richer source is
    // wired, show the type plus a shortened object id.
    displayName: `${typeName} ${shortGuid(objectId)}`,
  }
}

export class DataverseSolutionService implements SolutionService {
  /** Page through getAll until the result set is exhausted. */
  private async fetchAll(
    service: GeneratedTableService,
    options: { select?: string[]; filter?: string; orderBy?: string[] },
  ): Promise<Row[] | null> {
    const rows: Row[] = []
    let skipToken: string | undefined
    do {
      const result = await service.getAll({
        ...options,
        ...(skipToken ? { skipToken } : {}),
      })
      if (!result.success || !result.data) {
        console.warn('[solutions] page fetch failed — result:', result)
        return rows.length ? rows : null
      }
      rows.push(...result.data)
      skipToken = result.skipToken
    } while (skipToken)
    return rows
  }

  private solutionsService(): Promise<Row | null> {
    return loadService(['SolutionsService'])
  }

  async listSolutions(): Promise<WorkingSolution[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockSolutionService.listSolutions()
    try {
      const service = asTableService(await this.solutionsService())
      if (!service) return mockSolutionService.listSolutions()
      const rows = await this.fetchAll(service, {
        select: SOLUTION_SELECT,
        // Working solutions are always unmanaged; isvisible drops the
        // hidden system containers (Active, Basic, …).
        filter: 'ismanaged eq false and isvisible eq true',
        orderBy: ['modifiedon desc'],
      })
      if (!rows) return mockSolutionService.listSolutions()
      return rows
        .map(toWorkingSolution)
        .filter((s) => s.uniqueName.toLowerCase() !== 'default')
    } catch (err) {
      console.warn('[solutions] listSolutions() threw, falling back to mock:', err)
      return mockSolutionService.listSolutions()
    }
  }

  async listPublishers(): Promise<PublisherInfo[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockSolutionService.listPublishers()
    try {
      const service = asTableService(await loadService(['PublishersService']))
      if (!service) return mockSolutionService.listPublishers()
      const rows = await this.fetchAll(service, {
        select: [
          'publisherid',
          'uniquename',
          'friendlyname',
          'customizationprefix',
        ],
        filter: 'isreadonly eq false',
        orderBy: ['friendlyname asc'],
      })
      if (!rows) return mockSolutionService.listPublishers()
      return rows.map((row) => ({
        id: str(row.publisherid),
        uniqueName: str(row.uniquename),
        friendlyName: str(row.friendlyname),
        prefix: str(row.customizationprefix),
      }))
    } catch (err) {
      console.warn('[solutions] listPublishers() threw, falling back to mock:', err)
      return mockSolutionService.listPublishers()
    }
  }

  async createWorkingSolution(
    input: CreateWorkingSolutionInput,
  ): Promise<WorkingSolution> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockSolutionService.createWorkingSolution(input)
    const service = asTableService(await this.solutionsService())
    if (!service) {
      console.warn('[solutions] create falling back to mock — no data source')
      return mockSolutionService.createWorkingSolution(input)
    }
    const uniqueName = buildUniqueName(input.kind, input.devOpsId)
    const record: Row = {
      uniquename: uniqueName,
      friendlyname: input.title,
      description: input.description,
      version: '1.0.0.0',
      // Lookup columns are set via OData bind syntax on create.
      'publisherid@odata.bind': `/publishers(${input.publisherId})`,
    }
    const result = await service.create(record)
    if (!result.success) {
      throw new Error(
        `Dataverse rejected the solution "${uniqueName}" — it may already exist.`,
      )
    }
    const row = result.data ?? {}
    return {
      ...toWorkingSolution({ ...record, ...row }),
      title: input.title,
      description: input.description,
      kind: input.kind,
      devOpsId: input.kind === 'deployment' ? null : input.devOpsId,
    }
  }

  async listComponents(solutionId: string): Promise<SolutionComponentInfo[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockSolutionService.listComponents(solutionId)
    try {
      const service = asTableService(
        await loadService(['SolutionComponentsService', 'SolutioncomponentsService']),
      )
      if (!service) return mockSolutionService.listComponents(solutionId)
      const rows = await this.fetchAll(service, {
        select: ['solutioncomponentid', 'componenttype', 'objectid'],
        filter: `_solutionid_value eq ${solutionId}`,
      })
      if (!rows) return mockSolutionService.listComponents(solutionId)
      return rows
        .map(toComponentInfo)
        .sort(
          (a, b) =>
            a.typeName.localeCompare(b.typeName) ||
            a.displayName.localeCompare(b.displayName),
        )
    } catch (err) {
      console.warn('[solutions] listComponents() threw, falling back to mock:', err)
      return mockSolutionService.listComponents(solutionId)
    }
  }

  async mergeIntoDeployment(
    targetUniqueName: string,
    sourceSolutionIds: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<MergeResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockSolutionService.mergeIntoDeployment(
        targetUniqueName,
        sourceSolutionIds,
        onProgress,
      )
    const addService = await loadService(['AddSolutionComponentService'])
    const addFn = addService
      ? (addService as Row)['AddSolutionComponent']
      : undefined
    if (typeof addFn !== 'function') {
      throw new Error(
        'AddSolutionComponent is not wired yet — run `power-apps add-dataverse-api` ' +
          'and pick AddSolutionComponent (see README, "Merge support").',
      )
    }

    // Resolve target id + the components already present, so re-merges skip
    // instead of failing.
    const solutions = await this.listSolutions()
    const target = solutions.find((s) => s.uniqueName === targetUniqueName)
    if (!target) throw new Error(`Unknown target solution ${targetUniqueName}`)
    const existing = new Set(
      (await this.listComponents(target.id)).map((c) => c.objectId),
    )

    const queue: SolutionComponentInfo[] = []
    for (const id of sourceSolutionIds) {
      queue.push(...(await this.listComponents(id)))
    }

    const result: MergeResult = { added: 0, skipped: 0, errors: [] }
    let done = 0
    for (const component of queue) {
      if (existing.has(component.objectId)) {
        result.skipped++
      } else {
        try {
          // Parameter order mirrors the AddSolutionComponent action:
          // ComponentId, ComponentType, SolutionUniqueName,
          // AddRequiredComponents, DoNotIncludeSubcomponents.
          const res = (await addFn(
            component.objectId,
            component.typeCode,
            targetUniqueName,
            false,
            false,
          )) as OperationResult<unknown>
          if (res && res.success === false) {
            result.errors.push(
              `${component.typeName} ${shortGuid(component.objectId)}: rejected`,
            )
          } else {
            existing.add(component.objectId)
            result.added++
          }
        } catch (err) {
          result.errors.push(
            `${component.typeName} ${shortGuid(component.objectId)}: ${String(err)}`,
          )
        }
      }
      onProgress?.(++done, queue.length)
    }
    return result
  }
}

export const dataverseSolutionService = new DataverseSolutionService()
