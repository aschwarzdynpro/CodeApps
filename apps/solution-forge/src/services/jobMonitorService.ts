import type {
  AsyncJobInfo,
  FlowInfo,
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
export interface JobMonitorService {
  getHealthSummary(): Promise<JobHealthSummary>
  listJobs(filter: JobFilter): Promise<AsyncJobInfo[]>
  cancelJobs(
    jobs: { id: string; name: string }[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<JobActionResult[]>
  retryJobs(
    jobs: { id: string; name: string }[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<JobActionResult[]>
  listFlows(): Promise<FlowInfo[]>
  /**
   * Failure rate over the last runs of the given flows (bounded sample —
   * marked as such in the UI). Mutates nothing; returns stats per flow id.
   */
  sampleFlowStats(
    flows: FlowInfo[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Map<string, FlowInfo['runStats']>>
  listFlowRuns(
    flow: FlowInfo,
    environmentId: string | null,
  ): Promise<FlowRunInfo[]>
  listWatchdog(): Promise<{ available: boolean; entries: WatchdogEntry[] }>
  getTrends(days: number): Promise<JobTrendPoint[]>
}

/** Bulk actions are capped per call — keep batches reviewable. */
export const JOB_BULK_LIMIT = 50

export const jobMonitorService: JobMonitorService = dataverseJobMonitorService
