import type {
  CreateWorkingSolutionInput,
  MergeResult,
  PublisherInfo,
  SolutionComponentInfo,
  TrackSolutionInput,
  WorkItemInfo,
  WorkingSolution,
} from '../types/solution'
import { dataverseSolutionService } from './dataverseSolutionService'

/**
 * Service contract for the Solution Administration Console workbench.
 *
 * - `listSolutions()` powers the workbench list (unmanaged solutions from the
 *   Dataverse `solution` table, classified by the unique-name convention).
 * - `createWorkingSolution()` creates a real unmanaged solution in the
 *   environment — it appears in the maker portal immediately.
 * - `listComponents()` resolves the `solutioncomponent` rows of one solution,
 *   loaded lazily when a solution is opened.
 * - `mergeIntoDeployment()` copies the component set of the selected feature /
 *   bug solutions into a deployment solution (Dataverse `AddSolutionComponent`
 *   action under the hood).
 *
 * The exported singleton is the Dataverse-backed implementation, which falls
 * back to mock data automatically when no environment/data source is wired up.
 * The UI and hooks only depend on this interface, so going live never touches
 * the UI.
 */
export interface SolutionService {
  /** All visible unmanaged solutions, newest-modified first. */
  listSolutions(): Promise<WorkingSolution[]>
  /** Publishers available for new working solutions. */
  listPublishers(): Promise<PublisherInfo[]>
  /** Creates the solution in Dataverse and returns the stored record. */
  createWorkingSolution(
    input: CreateWorkingSolutionInput,
  ): Promise<WorkingSolution>
  /**
   * Creates only the ssid_workingsolution presentation record for an
   * already existing solution ("nacherfassen").
   */
  trackSolution(input: TrackSolutionInput): Promise<void>
  /**
   * Hard-deletes whatever the entry consists of: the working-solution
   * record (when present) and/or the real solution (when it exists).
   * Components inside the solution are not deleted — only the container.
   * The 5-second undo window lives in the UI; once this is called the
   * deletion is final.
   */
  deleteSolution(solution: WorkingSolution): Promise<void>
  /**
   * Resolves the signed-in user for the "Mine" filter. id is the
   * systemuser guid (matched against the rows' ownerId); name is a
   * display-name fallback. Both may be null when the host exposes no
   * usable identity.
   */
  getCurrentUser(): Promise<{ id: string | null; name: string | null }>
  /** Components contained in one solution. */
  listComponents(solutionId: string): Promise<SolutionComponentInfo[]>
  /**
   * Azure DevOps work item summary for a solution's number. Returns null
   * when the item doesn't exist or the DevOps connector isn't wired yet.
   */
  getWorkItem(devOpsId: string): Promise<WorkItemInfo | null>
  /**
   * Adds every component of the source solutions to the target deployment
   * solution. Already-present components are skipped, not duplicated.
   * @param onProgress optional callback fired after each processed component.
   */
  mergeIntoDeployment(
    targetUniqueName: string,
    sourceSolutionIds: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<MergeResult>
}

export const solutionService: SolutionService = dataverseSolutionService
