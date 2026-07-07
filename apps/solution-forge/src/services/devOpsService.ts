import type { WorkItemInfo } from '../types/solution'
import type { WorkItemPick } from '../utils/workItem'
import { dataverseDevOpsService } from './dataverseDevOpsService'

/**
 * Azure DevOps integration service. Reads work items DIRECTLY through the Azure
 * DevOps connector (the generated `AzureDevOpsService`) bound to the
 * `pro_CR_SAC_DevOps` connection reference — no cloud flow involved.
 *
 * The whole feature is OPTIONAL and stays dark unless three things line up
 * (see {@link import('../config').isDevOpsAvailable}):
 *   1. DevOps is explicitly enabled (`pro_devopsenabled`),
 *   2. the connection reference is bound to a connection, and
 *   3. an org URL + project are configured.
 * A customer without DevOps imports the solution and simply sees no DevOps
 * affordances — the connection reference ships unbound and nothing calls it.
 *
 * The status write-back sync stays on the {@link import('./solutionService').SolutionService}
 * (flow for Schulz, connector for the product bundle — chosen by `pro_devopssyncvia`).
 */
export interface DevOpsService {
  /**
   * Re-check whether DevOps is wired (connection reference bound) and update the
   * shared availability flag in config. Call once at startup, after the runtime
   * config is applied. Returns the resolved availability.
   */
  refreshAvailability(): Promise<boolean>
  /**
   * Work item summary for a DevOps number, or null when DevOps isn't available
   * or the item can't be found. Reads via the connector (`ListWorkItems`) as the
   * bound connection's identity.
   */
  getWorkItem(devOpsId: string): Promise<WorkItemInfo | null>
  /**
   * Batch read: work items for many ids in as few connector calls as possible
   * (one ListWorkItems per ~100 ids). Powers the list's live status badges
   * without a call per row. Returns only the items that resolved.
   */
  getWorkItems(devOpsIds: string[]): Promise<WorkItemInfo[]>
  /**
   * Live search over the configured project's work items (by title, or exact id
   * when the term is numeric) for the New-Working-Solution picker. Returns [] when
   * DevOps is unavailable, the term is too short, or nothing matches.
   */
  searchWorkItems(term: string): Promise<WorkItemPick[]>
  /**
   * The signed-in user's open (not Closed/Done/Removed) work items in the
   * configured project, newest first. Powers the "My work items" drawer. Returns
   * [] when DevOps is unavailable.
   */
  myWorkItems(): Promise<WorkItemPick[]>
}

export const devOpsService: DevOpsService = dataverseDevOpsService
