import type {
  CreateWorkingSolutionInput,
  MergeResult,
  MergeRun,
  PublisherInfo,
  SolutionComponentInfo,
  TrackSolutionInput,
  WorkItemInfo,
  WorkingSolution,
} from '../types/solution'
import type { DependencyCheckResult } from '../types/dependency'
import type { LayerInspectionResult, LayerSection } from '../types/layers'
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
   * The 3-second undo window lives in the UI; once this is called the
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
  /**
   * Required components of the solution that the solution itself doesn't
   * contain (RetrieveMissingDependencies), each checked for presence in
   * the chosen target environment.
   */
  checkDependencies(
    solution: WorkingSolution,
    envKey: 'uat' | 'prod',
    onProgress?: (message: string) => void,
  ): Promise<DependencyCheckResult>
  /** Adds one missing required component to the release solution. */
  addDependencyToSolution(
    targetUniqueName: string,
    componentId: string,
    componentType: number,
  ): Promise<void>
  /**
   * Layer inspector: resolves the msdyn_componentlayer stack of every
   * component of the solution in the chosen target environment and flags
   * unmanaged "Active" layers sitting on top of managed layers.
   */
  inspectLayers(
    solution: WorkingSolution,
    envKey: 'uat' | 'prod',
    onProgress?: (done: number, total: number) => void,
    /** Fired per component type as soon as that section is resolved. */
    onSection?: (section: LayerSection) => void,
  ): Promise<LayerInspectionResult>
  /**
   * Resolves a solution's id in a target environment by its unique name
   * (solution ids differ per environment). Used to build maker-portal deep
   * links into a component's solution layers there. Null when the solution
   * isn't present in the target (or the lookup fails).
   */
  resolveSolutionIdInEnv(
    uniqueName: string,
    envKey: 'uat' | 'prod',
  ): Promise<string | null>
  /**
   * Whether the signed-in user holds the given security role (direct
   * assignment; team-inherited roles are not considered). Used to gate
   * the Merge and Compare tabs.
   */
  hasRole(roleName: string): Promise<boolean>
  /** Updates sst_type_opt on an existing working-solution record. */
  updateSolutionType(
    recordId: string,
    kind: TrackSolutionInput['kind'],
  ): Promise<void>
  /**
   * Sets ssid_deploymentstatus on a working-solution record — e.g. to mark
   * it completed (DEPLOYMENT_COMPLETED_CODE) or to reopen it.
   */
  setDeploymentStatus(recordId: string, statusCode: number): Promise<void>
  /**
   * Deletes only the real unmanaged solution (the container — components
   * stay), leaving the working-solution record intact. Used when completing
   * a working solution and cleaning up its solution.
   */
  deleteUnderlyingSolution(solutionId: string): Promise<void>
  /**
   * Runs the "Sync DevOps Work Item Status" cloud flow, which refreshes each
   * working solution's sst_devopsworkitemstatus from Azure DevOps. Returns the
   * count the flow reports. Callers should reload the list afterwards so the
   * "to be completed" reconciliation re-runs.
   */
  syncDevOpsWorkItemStatus(): Promise<number>
  /**
   * Re-links an orphaned working-solution record to an existing solution
   * (updates ssid_uniquesolutionname and the maker link).
   */
  linkSolution(
    recordId: string,
    target: { id: string; uniqueName: string },
  ): Promise<void>
  /** Components contained in one solution (summary view, for display). */
  listComponents(solutionId: string): Promise<SolutionComponentInfo[]>
  /**
   * Exact solutioncomponent membership for merging — every row literally in
   * the solution, including individually included subcomponents (columns,
   * forms, …) that {@link listComponents} collapses under their table. Used
   * by the merge and its plan so the full content is carried over.
   */
  listMergeComponents(solutionId: string): Promise<SolutionComponentInfo[]>
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
  /**
   * Merge history of a release solution: the logged merge runs (counts,
   * source solutions and the components added each time) for the given
   * working-solution record id, newest first.
   */
  listMergeRuns(targetRecordId: string): Promise<MergeRun[]>
}

export const solutionService: SolutionService = dataverseSolutionService
