/**
 * Domain model for managing Dataverse solutions during feature / bug
 * development.
 *
 * A "working solution" is a row of the custom table `pro_workingsolution`
 * (the curated presentation layer: title, dedicated DevOps id, type, owner,
 * deployment status) linked via `pro_uniquesolutionname` to the real
 * unmanaged Dataverse solution that carries the components.
 *
 * The classification (`SolutionKind`) comes from the row's `pro_type_opt`
 * choice (Feature / Bug / Release — internal key `deployment`). Solutions
 * without a working-solution row fall back to the unique-name convention
 * (feature_<id> / bug_<id> / deploy_<name>) and are otherwise `other`.
 */

export type SolutionKind = 'feature' | 'bug' | 'deployment' | 'other'

/** A user for the owner picker — display name plus the unique login. */
export interface UserRef {
  /** systemuserid */
  id: string
  /** fullname (display name — not unique). */
  name: string
  /** domainname / UPN — the unique login, shown to disambiguate. */
  username: string
}

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
  /** pro_workingsolutionid of the presentation row, when one exists. */
  recordId?: string
  /** Owner of the working-solution row (owneridname). */
  owner?: string
  /** Raw owner id (systemuser/team guid) for the "Mine" filter. */
  ownerId?: string
  /** Formatted pro_deploymentstatus label, e.g. "Deployment completed". */
  deploymentStatus?: string
  /** Raw pro_deploymentstatus option value (informational only). */
  deploymentStatusCode?: number
  /**
   * statecode of the working-solution record: 0 = active (open), 1 = inactive
   * (closed). Undefined for untracked solutions (no record). This — not the
   * deployment status — determines whether an entry counts as open.
   */
  recordStateCode?: number
  /**
   * Release solutions only: component-type codes allowed when merging into
   * this release (from the pro_allowedmergetypes multi-select). Empty/undefined
   * means no restriction (all types allowed). See {@link MERGEABLE_COMPONENT_TYPES}.
   */
  allowedMergeTypes?: number[]
  /**
   * Release solutions only: component-type codes blocked on merge
   * (pro_excludedmergetypes). Applied on top of the allow-list — a type is
   * mergeable when (allow empty or in allow) AND not in exclude.
   */
  excludedMergeTypes?: number[]
  /** True when the row's pro_uniquesolutionname matches no real solution. */
  solutionMissing?: boolean
  /**
   * Derived flag: the entry is still open but its DevOps work item is closed
   * (pro_devopsworkitemstatus), so it's ready to be marked completed. Not
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
  /**
   * DevOps work-item state synced onto the record (pro_devopsworkitemstatus),
   * e.g. "New", "Active", "Resolved", "Closed". Undefined when never synced.
   * Drives the work-item status chip in the list; {@link isClosedWorkItemState}
   * classifies it.
   */
  workItemStatus?: string
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

/** Edits to an existing working solution (type, title, description). */
export interface UpdateWorkingSolutionInput {
  /** pro_workingsolution record id (type + name live here). */
  recordId: string
  /** Real solution id — friendlyname/description updated when it exists. */
  solutionId: string
  /** True when no real solution backs the record (skip the solution update). */
  solutionMissing?: boolean
  kind: Extract<SolutionKind, 'feature' | 'bug' | 'deployment'>
  title: string
  description: string
}

/**
 * pro_deploymentstatus values that count as "closed" for the workbench's
 * default Open filter: Deployment completed, Merged into Deployment
 * Solution, Merged into Core Solution. Everything else (None, To be
 * deployed, Deployment in progress, unset) is open.
 */
export const CLOSED_STATUS_CODES = new Set([500870003, 867520001, 867520002])

/** pro_deploymentstatus value for "Deployment completed". */
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
 * DevOps work-item states (pro_devopsworkitemstatus, lower-cased) that count
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
  /**
   * Tables already present in the target that the merge upgraded from
   * "shell only" / "no subcomponents" to "include all subcomponents", because
   * a source carried the full table. Counted apart from {@link added}: no new
   * row appears in the target, but its columns/forms/views do.
   */
  widened: number
  /** Components dropped because their type isn't in the target's allow-list. */
  excluded: number
  errors: string[]
}

/**
 * Component types selectable in a release's merge allow-list. The codes are
 * the Dataverse `componenttype` values and MUST mirror the option values of
 * the `pro_allowedmergetypes` multi-select choice in Dataverse — add an option
 * there and a matching entry here together.
 */
export const MERGEABLE_COMPONENT_TYPES: { code: number; label: string }[] = [
  { code: 1, label: 'Table' },
  { code: 2, label: 'Column' },
  { code: 9, label: 'Choice' },
  { code: 20, label: 'Security Role' },
  { code: 26, label: 'View' },
  { code: 29, label: 'Process (Flow/WF/BPF/Action)' },
  { code: 59, label: 'Chart' },
  { code: 60, label: 'Form' },
  { code: 61, label: 'Web Resource' },
  { code: 70, label: 'Field Security Profile' },
  { code: 80, label: 'Model-driven App' },
  { code: 91, label: 'Plugin Assembly' },
  { code: 92, label: 'SDK Message Step' },
  { code: 95, label: 'Service Endpoint' },
  { code: 300, label: 'Canvas App' },
  { code: 10021, label: 'Custom API' },
  { code: 10022, label: 'Custom API Request Parameter' },
  { code: 10023, label: 'Custom API Response Property' },
  { code: 10064, label: 'Connection Reference' },
  { code: 380, label: 'Environment Variable' },
  { code: 381, label: 'Environment Variable Value' },
]

/**
 * Component-type labels that are rolled up to a single counter row (instead of
 * listed individually) in the merge component plan and the merge history.
 * App Elements are the internal building blocks of a model-driven app — dozens
 * of GUID rows are noise; they're still merged, just summarised. Matched by
 * label so it covers both the resolved "App Element" name and the legacy
 * "Type 10044" fallback stored in older merge-run logs.
 */
export const COLLAPSED_COMPONENT_TYPE_LABELS = new Set<string>([
  'App Element',
  'Type 10044',
])

/** Canonical display label for a rolled-up component type. */
export function canonicalCollapsedLabel(label: string): string {
  return label === 'Type 10044' ? 'App Element' : label
}

/**
 * One added component captured in a merge run. Stored compactly (type + name,
 * short keys) so the whole list fits in a single multiline column on the
 * `pro_mergerun` row — no child table. The type label drives grouping/icons
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
 * `pro_mergerun` table). Counts plus the source solution titles and the
 * concrete components that were added in that run.
 */
export interface MergeRun {
  /** pro_mergerunid */
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
  /** Components added in this run (parsed from pro_addedcomponents_txt). */
  components: MergeRunComponent[]
}

/**
 * A published release-notes snapshot — one row of the `pro_releasenote` table,
 * frozen at publish time (both render formats stored) and linked to its
 * release solution.
 */
export interface ReleaseNote {
  /** pro_releasenoteid */
  id: string
  /** pro_workingsolutionid of the release this belongs to. */
  releaseRecordId: string
  /** pro_name — generated title. */
  name: string
  /** Release version at publish time. */
  version: string
  /** Published Markdown. */
  markdown: string
  /** Published plain text. */
  text: string
  /** "N solutions · M components". */
  summary: string
  /** createdon (ISO date-time) — when it was published. */
  createdOn: string
  /** createdby display name, when resolvable. */
  createdBy?: string
}

/** Payload for publishing a new release-notes snapshot. */
export interface PublishReleaseNotesInput {
  releaseRecordId: string
  name: string
  version: string
  markdown: string
  text: string
  summary: string
}
