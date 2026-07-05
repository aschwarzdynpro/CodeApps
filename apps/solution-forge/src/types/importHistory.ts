/**
 * Solution Import History — the `importjob` rows of one environment plus the
 * parsed import-log XML (`importjob.data`) per job. The XML is heavy (it is
 * the whole annotated solution manifest), so the list never carries it; it is
 * fetched and parsed only when a row is expanded.
 */

/** Derived from progress/completedon in the list; refined by the parsed log. */
export type ImportJobStatus = 'succeeded' | 'failed' | 'running' | 'unknown'

export interface ImportJobSummary {
  id: string
  /** Solution unique name the job reports (importjob.solutionname). */
  solutionName: string
  startedOn: string
  completedOn: string
  /** 0–100 (importjob.progress). */
  progress: number
  status: ImportJobStatus
  createdBy: string
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
