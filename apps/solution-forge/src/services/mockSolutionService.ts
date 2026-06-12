import type {
  CreateWorkingSolutionInput,
  MergeResult,
  PublisherInfo,
  SolutionComponentInfo,
  TrackSolutionInput,
  WorkItemInfo,
  WorkingSolution,
} from '../types/solution'
import { buildUniqueName } from '../utils/naming'
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

  async listSolutions(): Promise<WorkingSolution[]> {
    await delay(350)
    return [...this.solutions]
      .sort((a, b) => b.modifiedOn.localeCompare(a.modifiedOn))
      .map((s) => ({ ...s }))
  }

  async listPublishers(): Promise<PublisherInfo[]> {
    await delay(150)
    return mockPublishers.map((p) => ({ ...p }))
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

  async hasRole(): Promise<boolean> {
    await delay(150)
    return true // keep the full feature set demoable offline
  }

  async getCurrentUser(): Promise<{ id: string | null; name: string | null }> {
    await delay(150)
    // Matches the seeded owner of feature_4711 so the filter is demoable.
    return { id: 'u-0001', name: 'Marie Curie' }
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
    onProgress?: (done: number, total: number) => void,
  ): Promise<MergeResult> {
    const target = this.solutions.find(
      (s) => s.uniqueName === targetUniqueName,
    )
    if (!target) throw new Error(`Unknown target solution ${targetUniqueName}`)
    const targetComponents = this.components.get(target.id) ?? []
    const existing = new Set(targetComponents.map((c) => c.objectId))

    const queue = sourceSolutionIds.flatMap(
      (id) => this.components.get(id) ?? [],
    )
    const result: MergeResult = { added: 0, skipped: 0, errors: [] }
    let done = 0
    for (const component of queue) {
      await delay(120)
      if (existing.has(component.objectId)) {
        result.skipped++
      } else {
        existing.add(component.objectId)
        targetComponents.push({ ...component, id: `c-merged-${++mockIdCounter}` })
        result.added++
      }
      onProgress?.(++done, queue.length)
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
    return result
  }
}

export const mockSolutionService = new MockSolutionService()
