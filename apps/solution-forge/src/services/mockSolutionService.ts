import type {
  CreateWorkingSolutionInput,
  MergeResult,
  MergeRun,
  MergeRunComponent,
  PublishReleaseNotesInput,
  PublisherInfo,
  ReleaseNote,
  SolutionComponentInfo,
  TrackSolutionInput,
  UpdateWorkingSolutionInput,
  UserRef,
  WorkItemInfo,
  WorkingSolution,
} from '../types/solution'
import type { DependencyCheckResult } from '../types/dependency'
import type {
  ComponentLayerStack,
  LayerInspectionResult,
  LayerSection,
} from '../types/layers'
import { buildUniqueName } from '../utils/naming'
import { decideMergeAction } from '../utils/mergePlan'
import type {
  ProvisioningInput,
  ProvisioningState,
  ReachableOrg,
} from '../types/provisioning'
import type { RuntimeConfig } from '../config'
import { LAYER_IGNORED_TYPES } from './componentLayerNames'
import {
  mockComponentsBySolutionId,
  mockPublishers,
  mockSolutions,
} from './mockData'

/**
 * Mock implementation of {@link SolutionService}. Serves the seeded sample
 * environment and is used automatically whenever the real Dataverse data
 * source isn't available (e.g. plain local `npm run dev` before
 * `pac code add-data-source`). Creates and merges mutate the in-memory state
 * so the full workflow is demonstrable offline.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

let mockIdCounter = 100

/** Sample users for the owner picker (offline demo). */
const MOCK_USERS: { id: string; name: string; username: string }[] = [
  { id: 'u-0001', name: 'Marie Curie', username: 'marie.curie@dynpro.de' },
  { id: 'u-0002', name: 'Niels Bohr', username: 'niels.bohr@dynpro.de' },
  { id: 'u-0003', name: 'Lise Meitner', username: 'lise.meitner@dynpro.de' },
  { id: 'u-0004', name: 'Max Planck', username: 'max.planck@dynpro.de' },
  { id: 'u-0005', name: 'Albert Einstein', username: 'a.einstein@dynpro.de' },
  { id: 'u-0006', name: 'Andy Schwarz', username: 'andy.schwarz@dynpro.de' },
]

/** Sample work items matching the seeded solutions' DevOps ids. */
const MOCK_WORK_ITEMS: Record<string, Omit<WorkItemInfo, 'id' | 'url'>> = {
  '4711': {
    type: 'Feature',
    title: 'Customer onboarding wizard',
    state: 'Active',
    assignedTo: 'Marie Curie',
  },
  '4720': {
    type: 'Feature',
    title: 'Service-level dashboards',
    state: 'New',
    assignedTo: 'Niels Bohr',
  },
  '4732': {
    type: 'Bug',
    title: 'Duplicate detection fires twice on quote lines',
    state: 'Active',
    assignedTo: 'Lise Meitner',
  },
  '4699': {
    type: 'Bug',
    title: 'Wrong currency on opportunity rollup',
    state: 'Resolved',
    assignedTo: 'Max Planck',
  },
  '4655': {
    type: 'Feature',
    title: 'Partner portal access requests',
    state: 'Closed',
    assignedTo: null,
  },
}

export class MockSolutionService {
  private solutions: WorkingSolution[] = mockSolutions.map((s) => ({ ...s }))
  private components = new Map<string, SolutionComponentInfo[]>(
    Object.entries(mockComponentsBySolutionId).map(([id, rows]) => [
      id,
      rows.map((r) => ({ ...r })),
    ]),
  )
  // Merge-run history keyed by the target's working-solution record id. Seed
  // one earlier run so the release solution's history is demoable offline.
  private mergeRuns = new Map<string, MergeRun[]>([
    [
      'ws-0005',
      [
        {
          id: 'mr-0001',
          createdOn: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          createdBy: 'Niels Bohr',
          added: 3,
          skipped: 0,
          errors: 0,
          sources: ['Customer onboarding wizard'],
          components: [
            { t: 'Table', n: 'dyn_onboardingcase' },
            { t: 'Form', n: 'Onboarding Case – Main' },
            { t: 'Process', n: 'Onboarding approval flow' },
          ],
        },
      ],
    ],
  ])

  async listSolutions(): Promise<WorkingSolution[]> {
    await delay(350)
    return [...this.solutions]
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
      .map((s) => ({ ...s }))
  }

  async listPublishers(): Promise<PublisherInfo[]> {
    await delay(150)
    return mockPublishers.map((p) => ({ ...p }))
  }

  async getDefaultPublisher(): Promise<string | null> {
    await delay(100)
    // Mimics the Workbench Settings default (matched by unique name).
    return mockPublishers[1]?.uniqueName ?? null
  }

  async getRuntimeConfig(): Promise<RuntimeConfig> {
    // Offline/mock: keep the build-time defaults (config.ts) — no overrides.
    return {}
  }

  // In-memory provisioning state: null on first run so the wizard is
  // demonstrable offline; set once saveProvisioning() runs.
  private lastProvisioning: ProvisioningInput | null = null

  async getProvisioningState(): Promise<ProvisioningState> {
    await delay(120)
    const done = this.lastProvisioning !== null
    return { hasSettings: done, hasEnvironments: done }
  }

  async listReachableOrganizations(): Promise<ReachableOrg[]> {
    await delay(200)
    return [
      { url: 'https://contoso-dev.crm4.dynamics.com', name: 'Contoso — DEV' },
      { url: 'https://contoso-uat.crm4.dynamics.com', name: 'Contoso — UAT' },
      { url: 'https://contoso-prod.crm4.dynamics.com', name: 'Contoso — PROD' },
    ]
  }

  async resolveEnvironmentIds(
    orgUrl: string,
  ): Promise<{ environmentId: string; organizationId: string } | null> {
    await delay(300)
    if (!orgUrl) return null
    // Deterministic fake ids derived from the URL so the offline demo shows the
    // auto-fill behaviour.
    const seed = orgUrl.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(-8).padStart(8, '0')
    return {
      environmentId: `${seed}-0000-4000-9000-0000000000e1`,
      organizationId: `${seed}-0000-4000-9000-0000000000a2`,
    }
  }

  async listRoleNames(): Promise<string[]> {
    await delay(120)
    return [
      'INT | Deployment Manager',
      'System Administrator',
      'System Customizer',
      'Environment Maker',
      'Basic User',
    ]
  }

  async saveProvisioning(input: ProvisioningInput): Promise<void> {
    await delay(500)
    this.lastProvisioning = input
  }

  async createWorkingSolution(
    input: CreateWorkingSolutionInput,
  ): Promise<WorkingSolution> {
    await delay(600)
    const uniqueName = buildUniqueName(input.kind, input.devOpsId)
    if (this.solutions.some((s) => s.uniqueName === uniqueName)) {
      throw new Error(
        `A solution with the unique name "${uniqueName}" already exists.`,
      )
    }
    const now = new Date().toISOString()
    const created: WorkingSolution = {
      id: `a0000000-0000-4000-9000-${String(++mockIdCounter).padStart(12, '0')}`,
      uniqueName,
      title: input.title,
      description: input.description,
      kind: input.kind,
      devOpsId: input.kind === 'deployment' ? null : input.devOpsId,
      version: '1.0.0.0',
      isManaged: false,
      createdOn: now,
      modifiedOn: now,
      publisher:
        mockPublishers.find((p) => p.id === input.publisherId) ?? null,
      recordId: `ws-${mockIdCounter}`,
      owner: 'Marie Curie',
      ownerId: 'u-0001',
      deploymentStatus: 'None',
      deploymentStatusCode: 500870000,
    }
    this.solutions.unshift(created)
    this.components.set(created.id, [])
    return { ...created }
  }

  async listComponents(solutionId: string): Promise<SolutionComponentInfo[]> {
    await delay(300)
    return (this.components.get(solutionId) ?? []).map((c) => ({ ...c }))
  }

  // The mock has no subcomponent/membership distinction — its component lists
  // already enumerate every component, so the merge view matches listComponents.
  async listMergeComponents(
    solutionId: string,
  ): Promise<SolutionComponentInfo[]> {
    return this.listComponents(solutionId)
  }

  async checkDependencies(
    _solution: WorkingSolution,
    envKey: 'uat' | 'prod',
    onProgress?: (message: string) => void,
  ): Promise<DependencyCheckResult> {
    onProgress?.('Retrieving missing dependencies…')
    await delay(500)
    onProgress?.('Checking target environment…')
    await delay(500)
    const envLabel = envKey.toUpperCase()
    return {
      envKey,
      items: [
        {
          requiredObjectId: 'dep-1',
          requiredType: 61,
          requiredTypeName: 'Web Resource',
          requiredName: 'dyn_/shared/utils.js',
          dependentObjectId: 'c-f4711-7',
          dependentType: 61,
          dependentTypeName: 'Web Resource',
          dependentName: 'dyn_/onboarding/wizard.js',
          targetStatus: 'missing',
        },
        {
          requiredObjectId: 'dep-2',
          requiredType: 29,
          requiredTypeName: 'Process',
          requiredName: `Base approval template (${envLabel})`,
          dependentObjectId: 'c-f4711-6',
          dependentType: 29,
          dependentTypeName: 'Process',
          dependentName: 'Onboarding approval flow',
          targetStatus: 'missing',
        },
        {
          requiredObjectId: 'dep-3',
          requiredType: 1,
          requiredTypeName: 'Table',
          requiredName: 'dyn_basesettings',
          dependentObjectId: 'c-f4711-1',
          dependentType: 1,
          dependentTypeName: 'Table',
          dependentName: 'dyn_onboardingcase',
          targetStatus: 'unknown',
        },
        {
          requiredObjectId: 'dep-4',
          requiredType: 20,
          requiredTypeName: 'Security Role',
          requiredName: 'SST | Monteur',
          dependentObjectId: 'c-f4711-8',
          dependentType: 80,
          dependentTypeName: 'Model-driven App',
          dependentName: 'Onboarding Hub',
          targetStatus: 'present',
        },
      ],
    }
  }

  async addDependencyToSolution(): Promise<void> {
    await delay(400)
  }

  async inspectLayers(
    solution: WorkingSolution,
    envKey: 'uat' | 'prod',
    onProgress?: (done: number, total: number) => void,
    onSection?: (section: LayerSection) => void,
  ): Promise<LayerInspectionResult> {
    // Skip the by-design Active-layer types (env vars, connection refs) —
    // matches the real impl.
    const components = (this.components.get(solution.id) ?? []).filter(
      (c) => !LAYER_IGNORED_TYPES.has(c.typeCode),
    )
    const stacks: ComponentLayerStack[] = []
    onProgress?.(0, components.length)
    for (const [index, component] of components.entries()) {
      await delay(150)
      // Deterministic spread so every verdict is demoable offline.
      if (index === 0) {
        stacks.push({
          component,
          verdict: 'overridden',
          // Demo-only: show the precise canvas-app layers deep link.
          makerLayerPath: `objects/apps/${component.objectId}`,
          layers: [
            { id: `l-${index}-a`, solutionName: 'Active', order: 3 },
            {
              id: `l-${index}-m`,
              solutionName: 'deploy_2026_06',
              publisherName: 'DynPro GmbH',
              solutionVersion: '1.3.0.0',
              order: 2,
            },
            {
              id: `l-${index}-s`,
              solutionName: 'System',
              publisherName: 'MicrosoftCorporation',
              solutionVersion: '5.0',
              order: 1,
            },
          ],
        })
      } else if (index === 1) {
        stacks.push({
          component,
          verdict: 'unmanagedOnly',
          makerLayerPath: `entities/${component.objectId}`,
          layers: [{ id: `l-${index}-a`, solutionName: 'Active', order: 1 }],
        })
      } else if (index === 2) {
        stacks.push({ component, verdict: 'absent', layers: [] })
      } else {
        stacks.push({
          component,
          verdict: 'clean',
          layers: [
            {
              id: `l-${index}-m`,
              solutionName: 'deploy_2026_06',
              publisherName: 'DynPro GmbH',
              solutionVersion: '1.3.0.0',
              order: 1,
            },
          ],
        })
      }
      onProgress?.(index + 1, components.length)
    }
    // Emit one section per component type (progressive rendering demo).
    const byType = new Map<string, ComponentLayerStack[]>()
    for (const s of stacks) {
      const list = byType.get(s.component.typeName)
      if (list) list.push(s)
      else byType.set(s.component.typeName, [s])
    }
    for (const [typeName, sectionStacks] of byType) {
      await delay(120)
      onSection?.({
        typeCode: sectionStacks[0].component.typeCode,
        typeName,
        stacks: sectionStacks,
      })
    }
    return { envKey, stacks, warnings: [] }
  }

  async resolveSolutionIdInEnv(
    uniqueName: string,
    envKey: 'uat' | 'prod',
  ): Promise<string | null> {
    await delay(120)
    // Demo-only placeholder id so the deep-link structure is visible offline.
    return uniqueName && envKey ? '11111111-1111-1111-1111-111111111111' : null
  }

  async hasRole(): Promise<boolean> {
    await delay(150)
    return true // keep the full feature set demoable offline
  }

  async getCurrentUser(): Promise<{ id: string | null; name: string | null }> {
    await delay(150)
    // Matches the seeded owner of feature_4711 so the filter is demoable.
    return { id: 'u-0001', name: 'Marie Curie' }
  }

  async searchUsers(query: string): Promise<UserRef[]> {
    await delay(200)
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return MOCK_USERS.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q),
    ).map((u) => ({ ...u }))
  }

  async assignOwner(recordId: string, userId: string): Promise<void> {
    await delay(250)
    const solution = this.solutions.find((s) => s.recordId === recordId)
    if (!solution) throw new Error('Unknown working-solution record.')
    solution.ownerId = userId
    solution.owner = MOCK_USERS.find((u) => u.id === userId)?.name ?? 'Unknown'
  }

  async linkSolution(
    recordId: string,
    target: { id: string; uniqueName: string },
  ): Promise<void> {
    await delay(300)
    const record = this.solutions.find((s) => s.recordId === recordId)
    if (record) {
      record.uniqueName = target.uniqueName
      record.solutionMissing = undefined
    }
  }

  async updateSolutionType(
    recordId: string,
    kind: TrackSolutionInput['kind'],
  ): Promise<void> {
    await delay(250)
    const solution = this.solutions.find((s) => s.recordId === recordId)
    if (!solution) throw new Error('Unknown working-solution record.')
    solution.kind = kind
  }

  async updateWorkingSolution(
    input: UpdateWorkingSolutionInput,
  ): Promise<void> {
    await delay(250)
    const solution = this.solutions.find((s) => s.recordId === input.recordId)
    if (!solution) throw new Error('Unknown working-solution record.')
    solution.kind = input.kind
    solution.title = input.title
    solution.description = input.description
  }

  async setDeploymentStatus(
    recordId: string,
    statusCode: number,
  ): Promise<void> {
    await delay(250)
    const solution = this.solutions.find((s) => s.recordId === recordId)
    if (!solution) throw new Error('Unknown working-solution record.')
    solution.deploymentStatusCode = statusCode
    solution.deploymentStatus =
      statusCode === 500870003 ? 'Deployment completed' : 'None'
  }

  async setMergeTypeRules(
    recordId: string,
    allowed: number[],
    excluded: number[],
  ): Promise<void> {
    await delay(200)
    const solution = this.solutions.find((s) => s.recordId === recordId)
    if (!solution) throw new Error('Unknown working-solution record.')
    solution.allowedMergeTypes = [...allowed]
    solution.excludedMergeTypes = [...excluded]
  }

  async syncDevOpsWorkItemStatus(): Promise<number> {
    await delay(1500)
    // Demo: pretend the sync closed one more open entry's work item, so the
    // reconciliation lights up another "to be completed" after reload.
    const candidate = this.solutions.find(
      (s) => s.recordId && !s.solutionMissing && !s.toBeCompleted,
    )
    if (candidate) {
      candidate.toBeCompleted = true
      return 1
    }
    return 0
  }

  async deleteUnderlyingSolution(solutionId: string): Promise<void> {
    await delay(300)
    // The record stays; only the real solution is gone → now "WS only".
    const solution = this.solutions.find((s) => s.id === solutionId)
    if (solution) solution.solutionMissing = true
    this.components.delete(solutionId)
  }

  async deleteSolution(solution: WorkingSolution): Promise<void> {
    await delay(300)
    this.solutions = this.solutions.filter(
      (s) =>
        s.id !== solution.id &&
        (!solution.recordId || s.recordId !== solution.recordId),
    )
    this.components.delete(solution.id)
  }

  async trackSolution(input: TrackSolutionInput): Promise<void> {
    await delay(400)
    const solution = this.solutions.find((s) => s.id === input.solutionId)
    if (!solution) throw new Error('Unknown solution.')
    solution.recordId = `ws-${++mockIdCounter}`
    solution.title = input.title
    solution.devOpsId =
      input.kind === 'deployment' ? null : input.devOpsId
    solution.kind = input.kind
    solution.owner = 'Marie Curie'
    solution.ownerId = 'u-0001'
    solution.deploymentStatus = 'None'
  }

  async getWorkItem(devOpsId: string): Promise<WorkItemInfo | null> {
    await delay(350)
    const item = MOCK_WORK_ITEMS[devOpsId]
    if (!item) return null
    return { ...item, id: devOpsId, url: null }
  }

  async mergeIntoDeployment(
    targetUniqueName: string,
    sourceSolutionIds: string[],
    onProgress?: (done: number, total: number, current?: string) => void,
  ): Promise<MergeResult> {
    const target = this.solutions.find(
      (s) => s.uniqueName === targetUniqueName,
    )
    if (!target) throw new Error(`Unknown target solution ${targetUniqueName}`)
    const targetComponents = this.components.get(target.id) ?? []
    // Mirrors the real service: objectId → rootBehavior, because a table
    // already present as a shell can still be widened (see mergePlan.ts).
    const targetBehavior = new Map<string, number | undefined>(
      targetComponents.map((c) => [c.objectId.toLowerCase(), c.rootBehavior]),
    )

    const queue = sourceSolutionIds.flatMap(
      (id) => this.components.get(id) ?? [],
    )
    const allowed = target.allowedMergeTypes ?? []
    const excluded = target.excludedMergeTypes ?? []
    const isAllowed = (tc: number) =>
      (allowed.length === 0 || allowed.includes(tc)) && !excluded.includes(tc)
    const result: MergeResult = {
      added: 0,
      skipped: 0,
      widened: 0,
      excluded: 0,
      errors: [],
    }
    const added: MergeRunComponent[] = []
    let done = 0
    for (const component of queue) {
      await delay(120)
      const action = decideMergeAction(component, targetBehavior, isAllowed)
      if (action === 'excluded') {
        result.excluded++
      } else if (action === 'skip') {
        result.skipped++
      } else {
        const key = component.objectId.toLowerCase()
        if (action === 'widen') {
          // Upgrade in place — no new row, but the table now carries its
          // subcomponents.
          const row = targetComponents.find(
            (c) => c.objectId.toLowerCase() === key,
          )
          if (row) row.rootBehavior = component.rootBehavior
          result.widened++
        } else {
          targetComponents.push({ ...component, id: `c-merged-${++mockIdCounter}` })
          result.added++
        }
        targetBehavior.set(key, component.rootBehavior)
        added.push({ t: component.typeName, n: component.displayName })
      }
      onProgress?.(++done, queue.length, component.displayName || component.typeName)
    }
    this.components.set(target.id, targetComponents)
    target.modifiedOn = new Date().toISOString()
    // Mirror the real implementation's merge logging on the source rows.
    for (const source of this.solutions) {
      if (sourceSolutionIds.includes(source.id) && source.recordId) {
        source.deploymentStatus = 'Merged into Deployment Solution'
        source.deploymentStatusCode = 867520001
      }
    }
    // …and the merge-run history row on the target.
    if (
      target.recordId &&
      (result.added > 0 || result.widened > 0 || result.skipped > 0)
    ) {
      const runs = this.mergeRuns.get(target.recordId) ?? []
      runs.unshift({
        id: `mr-${++mockIdCounter}`,
        createdOn: new Date().toISOString(),
        createdBy: 'Marie Curie',
        added: result.added + result.widened,
        skipped: result.skipped,
        errors: result.errors.length,
        sources: this.solutions
          .filter((s) => sourceSolutionIds.includes(s.id))
          .map((s) => s.title),
        components: added,
      })
      this.mergeRuns.set(target.recordId, runs)
    }
    return result
  }

  async listMergeRuns(targetRecordId: string): Promise<MergeRun[]> {
    await delay(250)
    return (this.mergeRuns.get(targetRecordId) ?? [])
      .map((r) => ({ ...r, components: r.components.map((c) => ({ ...c })) }))
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
  }

  private releaseNotes = new Map<string, ReleaseNote[]>()
  private releaseNoteSeq = 1

  async listReleaseNotes(releaseRecordId: string): Promise<ReleaseNote[]> {
    await delay(200)
    return (this.releaseNotes.get(releaseRecordId) ?? [])
      .map((n) => ({ ...n }))
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
  }

  async publishReleaseNotes(
    input: PublishReleaseNotesInput,
  ): Promise<ReleaseNote> {
    await delay(250)
    const note: ReleaseNote = {
      id: `rn-${this.releaseNoteSeq++}`,
      releaseRecordId: input.releaseRecordId,
      name: input.name,
      version: input.version,
      markdown: input.markdown,
      text: input.text,
      summary: input.summary,
      createdOn: new Date().toISOString(),
      createdBy: 'You (demo)',
    }
    const list = this.releaseNotes.get(input.releaseRecordId) ?? []
    this.releaseNotes.set(input.releaseRecordId, [note, ...list])
    return { ...note }
  }
}

export const mockSolutionService = new MockSolutionService()
