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
  /** Raw owner id (systemuser/team guid) for the "Mine" filter. */
  ownerId?: string
  /** Formatted ssid_deploymentstatus label, e.g. "Deployment completed". */
  deploymentStatus?: string
  /** Raw ssid_deploymentstatus option value (informational only). */
  deploymentStatusCode?: number
  /**
   * statecode of the working-solution record: 0 = active (open), 1 = inactive
   * (closed). Undefined for untracked solutions (no record). This — not the
   * deployment status — determines whether an entry counts as open.
   */
  recordStateCode?: number
  /** True when the row's ssid_uniquesolutionname matches no real solution. */
  solutionMissing?: boolean
  /**
   * Derived flag: the entry is still open but its DevOps work item is closed
   * (sst_devopsworkitemstatus), so it's ready to be marked completed. Not
   * persisted — computed when the list loads.
   */
  toBeCompleted?: boolean
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

/**
 * ssid_deploymentstatus values that count as "closed" for the workbench's
 * default Open filter: Deployment completed, Merged into Deployment
 * Solution, Merged into Core Solution. Everything else (None, To be
 * deployed, Deployment in progress, unset) is open.
 */
export const CLOSED_STATUS_CODES = new Set([500870003, 867520001, 867520002])

/** ssid_deploymentstatus value for "Deployment completed". */
export const DEPLOYMENT_COMPLETED_CODE = 500870003

/**
 * Returns true when a working solution counts as open. Open ⇔ the
 * working-solution record is active (statecode 0); the deployment status is
 * informational only and does NOT affect this. Untracked solutions (no record,
 * hence no statecode) count as open.
 */
export function isOpenStatus(s: WorkingSolution): boolean {
  return s.recordStateCode === undefined || s.recordStateCode === 0
}

/**
 * DevOps work-item states (sst_devopsworkitemstatus, lower-cased) that count
 * as closed/done — an open working solution in one of these is "to be
 * completed". Extend if the process adds other terminal states.
 */
export const CLOSED_WORK_ITEM_STATES = new Set(['closed', 'done'])

/** Whether a stored DevOps work-item status string is a closed state. */
export function isClosedWorkItemState(status?: string): boolean {
  return CLOSED_WORK_ITEM_STATES.has((status ?? '').trim().toLowerCase())
}

/** Attach a working-solution record to an already existing solution. */
export interface TrackSolutionInput {
  /** solutionid of the real solution to track. */
  solutionId: string
  uniqueName: string
  title: string
  devOpsId: string
  kind: Extract<SolutionKind, 'feature' | 'bug' | 'deployment'>
}

/**
 * Collision radar: one component that is contained in more than one open
 * working solution — whoever deploys last overwrites the others.
 */
export interface ComponentCollision {
  component: SolutionComponentInfo
  /** The other working solutions containing the same component. */
  otherSolutions: { id: string; title: string }[]
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

/**
 * One added component captured in a merge run. Stored compactly (type + name,
 * short keys) so the whole list fits in a single multiline column on the
 * `sst_mergerun` row — no child table. The type label drives grouping/icons
 * in the UI; the name is what the release notes need.
 */
export interface MergeRunComponent {
  /** Component type label, e.g. "Web Resource". */
  t: string
  /** Component display name. */
  n: string
}

/**
 * One logged merge into a release/deployment solution (a row of the
 * `sst_mergerun` table). Counts plus the source solution titles and the
 * concrete components that were added in that run.
 */
export interface MergeRun {
  /** sst_mergerunid */
  id: string
  /** createdon (ISO date-time) — when the merge ran. */
  createdOn: string
  /** createdby display name, when resolvable. */
  createdBy?: string
  added: number
  skipped: number
  errors: number
  /** Titles of the source solutions merged in this run. */
  sources: string[]
  /** Components added in this run (parsed from sst_addedcomponents_txt). */
  components: MergeRunComponent[]
}
