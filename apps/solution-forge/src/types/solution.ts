/**
 * Domain model for managing Dataverse solutions during feature / bug
 * development. A "working solution" is a plain unmanaged Dataverse solution
 * whose unique name encodes its purpose:
 *
 *   feature_<ADO-id>   – development container for one Azure DevOps feature
 *   bug_<ADO-id>       – development container for one Azure DevOps bug
 *   deploy_<name>      – deployment solution that working solutions merge into
 *
 * Everything else in the environment is classified as `other` and hidden from
 * the workbench by default.
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
  /** solutionid */
  id: string
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
