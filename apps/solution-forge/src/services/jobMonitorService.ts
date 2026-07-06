import type {
  AsyncJobInfo,
  FlowFilter,
  FlowInfo,
  FlowRunDetailField,
  FlowRunInfo,
  JobActionResult,
  JobFilter,
  JobHealthSummary,
  JobTrendPoint,
  WatchdogEntry,
} from '../types/jobs'
import { dataverseJobMonitorService } from './dataverseJobMonitorService'

/**
 * Service contract for the Async Job / Flow Monitor.
 *
 * - `getHealthSummary()` fills the dashboard tiles ("is async processing
 *   healthy?" in under 10 seconds).
 * - `listJobs()` is the `asyncoperation` explorer — a look-back window is
 *   always enforced, the table is huge.
 * - `cancelJobs()` / `retryJobs()` run sequentially (≤ 50 per call) and
 *   report a per-job outcome; they write as the signed-in user through the
 *   native `asyncoperation` data source.
 * - `listFlows()` returns the environment's cloud flows; `sampleFlowStats()`
 *   loads a bounded run sample per flow to compute failure rates.
 * - `listFlowRuns()` resolves recent runs of one flow (`flowrun` table) with
 *   Power Automate portal deep links.
 * - `listWatchdog()` evaluates the heartbeat contract per definition.
 * - `getTrends()` aggregates failed/total jobs per day server-side.
 *
 * The exported singleton is the Dataverse-backed implementation, which falls
 * back to mock data automatically outside a Power Platform host.
 */
/**
 * Every method takes the target-environment key (from the app's configured
 * ENVIRONMENTS). Reads go cross-env through the connector; the writes
 * (`cancelJobs` / `retryJobs`) go through the native `asyncoperation`
 * source and therefore only ever target the host environment — the UI gates
 * them accordingly.
 */
export interface JobMonitorService {
  getHealthSummary(envKey: string): Promise<JobHealthSummary>
  listJobs(filter: JobFilter, envKey: string): Promise<AsyncJobInfo[]>
  cancelJobs(
    jobs: { id: string; name: string }[],
    envKey: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<JobActionResult[]>
  retryJobs(
    jobs: { id: string; name: string }[],
    envKey: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<JobActionResult[]>
  /**
   * The environment's cloud flows, optionally narrowed by a {@link FlowFilter}
   * (release-solution membership and/or a name substring). NOT capped — every
   * matching flow is returned (paged).
   */
  listFlows(envKey: string, filter?: FlowFilter): Promise<FlowInfo[]>
  /**
   * Failure rate for EVERY given flow, over each flow's most recent runs
   * (a bounded per-flow run sample — no flow is skipped). Per-flow queries run
   * with bounded concurrency. Mutates nothing; returns stats per flow id.
   */
  sampleFlowStats(
    flows: FlowInfo[],
    envKey: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Map<string, FlowInfo['runStats']>>
  listFlowRuns(flow: FlowInfo, envKey: string): Promise<FlowRunInfo[]>
  /**
   * All available fields of one flow run (the whole `flowrun` record), for the
   * run-detail popup. Trigger inputs/outputs proper live in the portal.
   */
  getFlowRunDetail(
    run: FlowRunInfo,
    envKey: string,
  ): Promise<FlowRunDetailField[]>
  listWatchdog(
    envKey: string,
  ): Promise<{ available: boolean; entries: WatchdogEntry[] }>
  getTrends(days: number, envKey: string): Promise<JobTrendPoint[]>
}

/** Bulk actions are capped per call — keep batches reviewable. */
export const JOB_BULK_LIMIT = 50

export const jobMonitorService: JobMonitorService = dataverseJobMonitorService
