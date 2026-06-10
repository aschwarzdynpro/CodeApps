import type {
  CreateWorkingSolutionInput,
  MergeResult,
  PublisherInfo,
  SolutionComponentInfo,
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
    }
    this.solutions.unshift(created)
    this.components.set(created.id, [])
    return { ...created }
  }

  async listComponents(solutionId: string): Promise<SolutionComponentInfo[]> {
    await delay(300)
    return (this.components.get(solutionId) ?? []).map((c) => ({ ...c }))
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
    return result
  }
}

export const mockSolutionService = new MockSolutionService()
