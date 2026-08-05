/**
 * Configuration Data Transfer Hub — domain types.
 *
 * A Transfer Package groups Transfer Entries; each entry describes ONE
 * source-environment query (table + filter + columns, via saved-view snapshot
 * or hand-written FetchXML) whose result rows an EXTERNAL pipeline transports
 * into the package's target environments. The hub only authors these
 * configurations — execution is deliberately out of app scope.
 *
 * Choice codes below are the single source of truth mirrored by
 * `installer/provision-model.ps1` and `docs/transfer-hub-contract.md`.
 */

export type TransferQueryMode = 'view' | 'fetchxml'
export type TransferMatchMode = 'guid' | 'columns'
export type OrphanHandling = 'ignore' | 'deactivate' | 'delete'
/** Whether an entry transfers everything or only what changed since last time. */
export type TransferDeltaMode = 'none' | 'modified'
/** Cadence of an automatically recurring package run. */
export type TransferRecurrence = 'none' | 'daily' | 'weekly'
export type TransferRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'partial'
  | 'cancelled'
  | 'scheduled'

/** pro_querymode_opt option values. */
export const QUERY_MODE_CODES: Record<TransferQueryMode, number> = {
  view: 867520000,
  fetchxml: 867520001,
}

/** pro_matchmode_opt option values (null on the record = 'guid'). */
export const MATCH_MODE_CODES: Record<TransferMatchMode, number> = {
  guid: 867520000,
  columns: 867520001,
}

/** pro_orphanhandling_opt option values (null on the record = 'ignore'). */
export const ORPHAN_CODES: Record<OrphanHandling, number> = {
  ignore: 867520000,
  deactivate: 867520001,
  delete: 867520002,
}

/** pro_deltamode_opt option values (null on the record = 'none'). */
export const DELTA_MODE_CODES: Record<TransferDeltaMode, number> = {
  none: 867520000,
  modified: 867520001,
}

/** pro_status_opt option values on pro_transferrun. */
export const RUN_STATUS_CODES: Record<TransferRunStatus, number> = {
  queued: 867520000,
  running: 867520001,
  succeeded: 867520002,
  failed: 867520003,
  partial: 867520004,
  cancelled: 867520005,
  scheduled: 867520006,
}

/** pro_recurrence_opt option values on pro_transferpackage. */
export const RECURRENCE_CODES: Record<TransferRecurrence, number> = {
  none: 867520000,
  daily: 867520001,
  weekly: 867520002,
}

export function recurrenceFromCode(code: number | null | undefined): TransferRecurrence {
  if (code === RECURRENCE_CODES.daily) return 'daily'
  if (code === RECURRENCE_CODES.weekly) return 'weekly'
  return 'none'
}

export function runStatusFromCode(code: number | null | undefined): TransferRunStatus {
  const entry = (Object.entries(RUN_STATUS_CODES) as [TransferRunStatus, number][]).find(
    ([, value]) => value === code,
  )
  return entry?.[0] ?? 'queued'
}

export function queryModeFromCode(code: number | null | undefined): TransferQueryMode {
  return code === QUERY_MODE_CODES.fetchxml ? 'fetchxml' : 'view'
}
export function matchModeFromCode(code: number | null | undefined): TransferMatchMode {
  return code === MATCH_MODE_CODES.columns ? 'columns' : 'guid'
}
export function orphanFromCode(code: number | null | undefined): OrphanHandling {
  if (code === ORPHAN_CODES.deactivate) return 'deactivate'
  if (code === ORPHAN_CODES.delete) return 'delete'
  return 'ignore'
}
export function deltaModeFromCode(code: number | null | undefined): TransferDeltaMode {
  return code === DELTA_MODE_CODES.modified ? 'modified' : 'none'
}

/** One configuration bundle the pipeline executes as a unit. */
export interface TransferPackage {
  id: string
  name: string
  description: string
  /** ENVIRONMENTS keys (e.g. ['uat','prod']) — comma string on the record. */
  targetEnvKeys: string[]
  /** Cross-package execution order (ascending). */
  order: number
  /** statecode 0 = active; the pipeline skips inactive packages. */
  active: boolean
  /** Automatic cadence — 'none' unless a schedule is configured. */
  recurrence: TransferRecurrence
  /**
   * ISO timestamp of the next automatic run. The time-of-day (and weekday for
   * 'weekly') live inside this value — the scheduler flow queues a run once it
   * is due and rolls the timestamp forward by the cadence.
   */
  nextRun: string
  entryCount?: number
  modifiedOn?: string
}

/** One table query inside a package. */
export interface TransferEntry {
  id: string
  packageId: string
  name: string
  /** ENVIRONMENTS key of the environment the data is read from. */
  sourceEnvKey: string
  tableLogicalName: string
  tableDisplayName: string
  /** Metadata-resolved entity-set snapshot (never naively pluralized). */
  entitySet: string
  /** Primary-id attribute snapshot (GUID upsert convenience). */
  primaryIdAttribute: string
  queryMode: TransferQueryMode
  /** savedqueryid + name — provenance only; the snapshot below is executable. */
  viewId: string
  viewName: string
  /** When the view FetchXML was last snapshotted (ISO). */
  viewSnapshotAt: string
  /** ALWAYS populated — the self-contained query the pipeline runs. */
  fetchXml: string
  matchMode: TransferMatchMode
  /** Logical column names (columns mode) — comma string on the record. */
  matchColumns: string[]
  orphanHandling: OrphanHandling
  /**
   * 'modified' transfers only rows whose `modifiedon` is at or after the
   * watermark of the target being written. Mutually exclusive with orphan
   * handling — see the save gate in `utils/transferConfig`.
   */
  deltaMode: TransferDeltaMode
  /**
   * Target env key → ISO watermark, written by the executor after a clean
   * cell. Per TARGET because a run can succeed for UAT and fail for PROD;
   * a shared stamp would make PROD skip those rows forever. A missing key
   * means "never transferred" and yields a full run.
   */
  deltaWatermarks: Record<string, string>
  /** In-package execution order (parents before children for lookups). */
  order: number
  notes: string
  /** statecode 0 = active; the pipeline skips inactive entries. */
  active: boolean
  /**
   * Executor write recipe (ColumnPlan JSON) — computed by the hub at save
   * time from source metadata; '' on legacy entries (re-save to fill).
   */
  columnPlan: string
}

/** Create/update shape for a package (id-less). */
export interface TransferPackageInput {
  name: string
  description: string
  targetEnvKeys: string[]
  order: number
  recurrence: TransferRecurrence
  /** ISO; '' clears the schedule (also written when recurrence is 'none'). */
  nextRun: string
}

/** Create/update shape for an entry (id-less). */
export interface TransferEntryInput {
  packageId: string
  name: string
  sourceEnvKey: string
  tableLogicalName: string
  tableDisplayName: string
  entitySet: string
  primaryIdAttribute: string
  queryMode: TransferQueryMode
  viewId: string
  viewName: string
  viewSnapshotAt: string
  fetchXml: string
  matchMode: TransferMatchMode
  matchColumns: string[]
  orphanHandling: OrphanHandling
  deltaMode: TransferDeltaMode
  order: number
  notes: string
}

/**
 * One queued/executed run of a package. The hub only CREATES runs (status
 * queued, target snapshot); an external executor picks them up and writes
 * status/log back — see docs/transfer-hub-contract.md.
 */
export interface TransferRun {
  id: string
  packageId: string
  name: string
  status: TransferRunStatus
  /** Target env keys snapshotted at request time (package may change later). */
  targetEnvKeys: string[]
  /** ISO time a "Run later" is due (status scheduled); '' for immediate runs. */
  scheduledFor: string
  requestedOn: string
  requestedBy: string
  startedOn: string
  finishedOn: string
  summary: string
  /** Executor-written result JSON (per entry × target env). */
  log: string
  /** Simulation: the executor counts and logs but writes nothing. */
  dryRun: boolean
}

/** A source-environment table candidate (from EntityDefinitions). */
export interface TableRef {
  logicalName: string
  displayName: string
  /** Plural display name (DisplayCollectionName) — entry-name suggestion. */
  displayCollectionName: string
  entitySet: string
  primaryIdAttribute: string
}

/** A system view (savedquery, querytype 0) of the source table. */
export interface SavedViewRef {
  id: string
  name: string
  description: string
  isDefault: boolean
}

/** A column of the source table (from EntityDefinitions/Attributes). */
export interface ColumnRef {
  logicalName: string
  displayName: string
  attributeType: string
}

/** Result of a source-environment preview run. */
export interface PreviewResult {
  /** Column order for rendering (parsed attributes, else keys of row 0). */
  columns: string[]
  rows: Record<string, unknown>[]
  /** Best-effort aggregate count; undefined when unavailable (>50k, aggregate XML). */
  totalCount?: number
  /** The row cap the preview query used. */
  limit: number
}
