import type {
  ColumnRef,
  PreviewResult,
  SavedViewRef,
  TableRef,
  TransferEntry,
  TransferEntryInput,
  TransferPackage,
  TransferPackageInput,
  TransferRun,
} from '../types/transferHub'
import type { ColumnPlan } from '../utils/transferConfig'
import { dataverseTransferHubService } from './dataverseTransferHubService'

/**
 * Service contract for the Configuration Data Transfer Hub.
 *
 * Package/entry CRUD writes the `pro_transferpackage` / `pro_transferentry`
 * configuration tables in the HOST environment natively (signed-in user).
 * Source-environment lookups (tables, views, columns, preview) read the chosen
 * source environment through the Dataverse connector (SP identity) — the same
 * cross-env split every Operate/Validate feature uses.
 */
/** Options for {@link TransferHubService.createRun}. */
export interface CreateRunOptions {
  /** ISO time for "Run later" — omitted/empty means run immediately. */
  scheduledFor?: string
  /** Simulate: partition and log, but perform no writes in the targets. */
  dryRun?: boolean
}

export interface TransferHubService {
  // -- packages (host, native writes) --------------------------------------
  listPackages(): Promise<TransferPackage[]>
  createPackage(input: TransferPackageInput): Promise<TransferPackage>
  updatePackage(id: string, input: TransferPackageInput): Promise<void>
  /** Cascade-deletes the package's entries (model-level Delete=Cascade). */
  deletePackage(id: string): Promise<void>
  /** statecode toggle — the pipeline only executes active (0) packages. */
  setPackageActive(id: string, active: boolean): Promise<void>

  // -- entries (host, native writes) ---------------------------------------
  listEntries(packageId: string): Promise<TransferEntry[]>
  createEntry(input: TransferEntryInput): Promise<TransferEntry>
  updateEntry(id: string, input: TransferEntryInput): Promise<void>
  deleteEntry(id: string): Promise<void>
  setEntryActive(id: string, active: boolean): Promise<void>
  /** Persist a new in-package order (serial pro_order_int updates, 1-based). */
  reorderEntries(orderedIds: string[]): Promise<void>
  /**
   * Re-resolve the referenced saved view's FetchXML and update the entry's
   * snapshot + timestamp. Throws when the view no longer exists.
   */
  refreshViewSnapshot(entryId: string): Promise<TransferEntry>

  // -- runs (host, native writes) ------------------------------------------
  /**
   * Queue a run for the package: the package's target envs are snapshotted
   * onto the record. Without `scheduledFor` the run is Queued (executed
   * immediately); with an ISO time it is Scheduled — the scheduler flow
   * flips it to Queued once due. With `dryRun` the executor partitions and
   * logs as usual but writes nothing. The executor cloud flows pick Queued
   * runs up and write status/log back (docs/transfer-hub-contract.md) — the
   * hub never executes in-session.
   */
  createRun(pkg: TransferPackage, opts?: CreateRunOptions): Promise<TransferRun>
  /** Latest runs of the package, newest first. */
  listRuns(packageId: string, top?: number): Promise<TransferRun[]>
  /** Cancel a run that has not started yet (Queued or Scheduled). */
  cancelRun(id: string): Promise<void>

  // -- source-environment reads (connector, cross-env) ---------------------
  listTables(envKey: string): Promise<TableRef[]>
  /** System views (savedquery, querytype 0) of the table, name-sorted. */
  listViews(envKey: string, tableLogicalName: string): Promise<SavedViewRef[]>
  getViewFetchXml(envKey: string, viewId: string): Promise<{ name: string; fetchXml: string }>
  listColumns(envKey: string, tableLogicalName: string): Promise<ColumnRef[]>
  /** Run the query with an injected row cap; best-effort total count. */
  preview(
    envKey: string,
    tableLogicalName: string,
    fetchXml: string,
    maxRows?: number,
  ): Promise<PreviewResult>
  /**
   * Row count of the query (same filter, aggregate count) — undefined when
   * not countable (aggregate XML, >50k rows, or the count query failed).
   */
  countRows(
    envKey: string,
    tableLogicalName: string,
    fetchXml: string,
  ): Promise<number | undefined>
  /**
   * The write recipe this query WOULD be saved with — the very computation
   * `createEntry`/`updateEntry` persist into `pro_columnplan_txt`, so what the
   * entry dialog shows can never drift from what the executor receives.
   * `null` when the source metadata is unreachable (the dialog then simply
   * shows nothing — a transient metadata error must not block authoring).
   */
  previewColumnPlan(
    envKey: string,
    tableLogicalName: string,
    fetchXml: string,
  ): Promise<ColumnPlan | null>
}

export const transferHubService: TransferHubService = dataverseTransferHubService
