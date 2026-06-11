/**
 * Domain model for managing Dataverse solutions during feature / bug
 * development.
 *
 * A "working solution" is a row of the custom table `ssid_workingsolution`
 * (the curated presentation layer: title, dedicated DevOps id, type, owner,
 * deployment status) linked via `ssid_uniquesolutionname` to the real
 * unmanaged Dataverse solution that carries the components.
 *
 * The classification (`SolutionKind`) comes from the row's `sst_type_opt`
 * choice (Feature / Bug / Release — internal key `deployment`). Solutions
 * without a working-solution row fall back to the unique-name convention
 * (feature_<id> / bug_<id> / deploy_<name>) and are otherwise `other`.
 */

export type SolutionKind = 'feature' | 'bug' | 'deployment' | 'other'

export interface PublisherInfo {
  /** publisherid */
  id: string
  /** uniquename, e.g. "dynpro" */
  uniqueName: string
  /** friendlyname, e.g. "DynPro GmbH" */
  friendlyName: string
  /** customizationprefix, e.g. "dyn" */
  prefix: string
}

export interface WorkingSolution {
  /**
   * solutionid of the real solution. For working-solution rows whose linked
   * solution can't be resolved this is a synthetic key — check
   * {@link solutionMissing} before using it against Dataverse.
   */
  id: string
  /** ssid_workingsolutionid of the presentation row, when one exists. */
  recordId?: string
  /** Owner of the working-solution row (owneridname). */
  owner?: string
  /** Formatted ssid_deploymentstatus label, e.g. "Deployment completed". */
  deploymentStatus?: string
  /** True when the row's ssid_uniquesolutionname matches no real solution. */
  solutionMissing?: boolean
  /** uniquename, e.g. "feature_4711" */
  uniqueName: string
  /** friendlyname — the title entered by the developer. */
  title: string
  description: string
  /** Classification derived from the unique-name convention. */
  kind: SolutionKind
  /** Azure DevOps work item id parsed from the unique name (null for deploy/other). */
  devOpsId: string | null
  version: string
  isManaged: boolean
  /** createdon (ISO date-time) */
  createdOn: string
  /** modifiedon (ISO date-time) */
  modifiedOn: string
  publisher: PublisherInfo | null
}

/** One row of the `solutioncomponent` table, resolved for display. */
export interface SolutionComponentInfo {
  /** solutioncomponentid */
  id: string
  /** objectid — the id of the customization the row points at. */
  objectId: string
  /** componenttype option-set value, e.g. 1 = Entity, 61 = Web Resource. */
  typeCode: number
  /** Friendly type label ("Entity", "Web Resource", …). */
  typeName: string
  /** Best-effort display name of the component (logical name / GUID fallback). */
  displayName: string
  /** Schema name (e.g. "dyn_OnboardingCase"), when the summary view provides it. */
  schemaName?: string
  /** Owning table for child components like columns or forms. */
  parentTable?: string
  /**
   * rootcomponentbehavior for table components: 0 = include subcomponents,
   * 1 = do not include, 2 = shell only. Undefined for non-table components.
   */
  rootBehavior?: number
}

/** Azure DevOps work item summary shown next to a working solution. */
export interface WorkItemInfo {
  id: string
  /** Work item type, e.g. "Bug", "Product Backlog Item", "Feature". */
  type: string
  title: string
  /** State, e.g. "New", "Active", "Resolved", "Closed". */
  state: string
  /** Display name of the assignee, or null when unassigned. */
  assignedTo: string | null
  /** Browser link to the work item, when resolvable. */
  url: string | null
}

export interface CreateWorkingSolutionInput {
  /** Becomes the solution friendlyname. */
  title: string
  /** Azure DevOps work item id — becomes part of the unique name. */
  devOpsId: string
  kind: Extract<SolutionKind, 'feature' | 'bug' | 'deployment'>
  description: string
  publisherId: string
}

/** Plan row for the merge workbench: one component and where it comes from. */
export interface MergePlanItem {
  component: SolutionComponentInfo
  /** Titles of every selected source solution containing this component. */
  sources: string[]
  /** True when more than one source contributes the same object. */
  conflict: boolean
}

export interface MergeResult {
  added: number
  skipped: number
  errors: string[]
}
