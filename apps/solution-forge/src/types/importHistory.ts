/**
 * Solution Import History — the `importjob` rows of one environment plus the
 * parsed import-log XML (`importjob.data`) per job. The XML is heavy (it is
 * the whole annotated solution manifest), so the list never carries it; it is
 * fetched and parsed only when a row is expanded.
 */

/** Derived from progress/completedon in the list; refined by the parsed log. */
export type ImportJobStatus = 'succeeded' | 'failed' | 'running' | 'unknown'

/**
 * Server-side narrowing for the import list. All conditions run in FetchXML
 * against `importjob` (the list is capped, so client-side filtering would only
 * ever see the latest page). Status is the same heuristic the viewer shows,
 * expressed as `progress`/`completedon` conditions.
 */
export interface ImportJobQuery {
  /** Filter by `importjob.solutionname`. */
  solutionName?: string
  /** Exact match (from the release-solution picker) or substring (free text). */
  solutionMatch?: 'eq' | 'like'
  /** Only jobs of this status (heuristic → fetch conditions). */
  status?: Exclude<ImportJobStatus, 'unknown'>
}

export interface ImportJobSummary {
  id: string
  /** Solution unique name the job reports (importjob.solutionname). */
  solutionName: string
  startedOn: string
  completedOn: string
  /** 0–100 (importjob.progress). */
  progress: number
  status: ImportJobStatus
  /** Import initiator — kept for the release timeline; often not a real user
   *  (system imports), so the Import History table shows the publisher instead. */
  createdBy: string
  /** Publisher of the imported solution, resolved via the target env's
   *  `solution` → `publisher` (matched by unique name). '' when the solution is
   *  not (or no longer) present in the environment. */
  publisher: string
  /** Formatted operation/import context when present. */
  context: string
}

/** One missing-dependency row extracted from <MissingDependencies>. */
export interface MissingDependencyRow {
  /** Component that is MISSING in the target. */
  requiredTypeCode: number | null
  requiredTypeLabel: string
  requiredSchemaName: string
  requiredDisplayName: string
  /** Solution the required component lives in (per the source env). */
  requiredSolution: string
  /** Component in the imported solution that NEEDS it. */
  dependentTypeCode: number | null
  dependentTypeLabel: string
  dependentSchemaName: string
  dependentDisplayName: string
  /** Owning parent (e.g. the table of a form/column), when reported. */
  dependentParent: string
}

/** One non-dependency failure/warning result node from the log. */
export interface ImportFailureItem {
  severity: 'failure' | 'warning'
  errorCode: string
  errorText: string
  /** Best-effort context: the component the result node is attached to. */
  context: string
}

/** Parsed import-log payload of one job. */
export interface ImportLogDetail {
  solutionUniqueName: string
  solutionVersion: string
  /** Overall verdict from the manifest result node (refines the heuristic). */
  status: ImportJobStatus
  /** Manifest-level error text, when the import failed. */
  topErrorText: string
  missingDependencies: MissingDependencyRow[]
  failures: ImportFailureItem[]
}
