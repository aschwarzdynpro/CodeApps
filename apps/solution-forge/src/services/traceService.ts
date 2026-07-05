import type {
  PluginTraceDetail,
  PluginTraceSummary,
  TraceFilter,
  TraceLevel,
  TraceLevelInfo,
  TracePerfBucket,
} from '../types/traces'
import { dataverseTraceService } from './dataverseTraceService'

/**
 * Service contract for the Plugin Trace Explorer.
 *
 * - `listTraces()` powers the polling stream — summaries only, the heavy
 *   `messageblock` / `exceptiondetails` columns are never part of it.
 * - `getTraceDetail()` fetches one row's payload lazily.
 * - `listCorrelation()` resolves a whole request chain (same correlationid)
 *   for the timeline view.
 * - `getPerfBuckets()` aggregates duration by plugin type × message
 *   server-side (FetchXML aggregate).
 * - `getTraceLevel()` / `setTraceLevel()` read and switch
 *   `organization.plugintracelogsetting` (0 Off / 1 Exception / 2 All).
 *
 * The exported singleton is the Dataverse-backed implementation, which falls
 * back to mock data automatically outside a Power Platform host.
 */
/**
 * Every method takes the target-environment key (from the app's configured
 * ENVIRONMENTS). Reads go cross-env through the connector; `setTraceLevel`
 * writes through the native `organization` source and therefore only ever
 * targets the host environment (the UI gates it accordingly).
 */
export interface TraceService {
  /** Newest traces matching the filter, newest first, capped server-side. */
  listTraces(filter: TraceFilter, envKey: string): Promise<PluginTraceSummary[]>
  /** The heavy payload of one trace row. */
  getTraceDetail(id: string, envKey: string): Promise<PluginTraceDetail>
  /** All traces of one correlation id, oldest first (execution order). */
  listCorrelation(
    correlationId: string,
    envKey: string,
  ): Promise<PluginTraceSummary[]>
  /** Duration aggregates per type × message over the look-back window. */
  getPerfBuckets(hours: number, envKey: string): Promise<TracePerfBucket[]>
  /** Current org-wide trace-level setting of the target environment. */
  getTraceLevel(envKey: string): Promise<TraceLevelInfo>
  /**
   * Switch the org-wide trace level. Runs as the signed-in user via the
   * native `organization` data source, so Dataverse enforces the update
   * privilege server-side — and it only affects the HOST environment
   * (`envKey` must be the current env; the UI disables it otherwise).
   */
  setTraceLevel(
    organizationId: string,
    level: TraceLevel,
    envKey: string,
  ): Promise<void>
}

export const traceService: TraceService = dataverseTraceService
