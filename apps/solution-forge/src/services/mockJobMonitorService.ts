import type {
  AsyncJobInfo,
  FlowFilter,
  FlowInfo,
  FlowRunDetailField,
  FlowRunInfo,
  FlowRunStats,
  JobActionResult,
  JobFilter,
  JobHealthSummary,
  JobTrendPoint,
  WatchdogEntry,
} from '../types/jobs'
import { ASYNC_STATUS, ASYNC_STATUS_LABELS } from '../types/jobs'
import type { JobMonitorService } from './jobMonitorService'
import { JOB_BULK_LIMIT } from './jobMonitorService'
import { evaluateHeartbeat } from '../utils/heartbeat'
import { environmentIdForEnvKey, flowRunUrl } from '../config'

/**
 * Mock implementation of {@link JobMonitorService} — a seeded operational
 * picture with a failing flow, a waiting backlog and one overdue heartbeat,
 * so every Job Monitor view is demonstrable offline. Cancels/retries mutate
 * the in-memory jobs.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const OPERATION_TYPES: Record<number, string> = {
  1: 'System Event',
  10: 'Workflow',
  12: 'Bulk Delete',
  29: 'Solution Import',
}

interface MockJob extends AsyncJobInfo {
  /** hours back from "now" the job was created. */
  age: number
}

function job(
  n: number,
  name: string,
  operationType: number,
  statusCode: number,
  age: number,
  message = '',
): MockJob {
  const stateCode =
    statusCode === ASYNC_STATUS.waiting ||
    statusCode === ASYNC_STATUS.waitingForResources
      ? 0
      : statusCode === ASYNC_STATUS.inProgress
        ? 2
        : 3
  const createdOn = new Date(Date.now() - age * 3600_000).toISOString()
  return {
    id: `job-${n}`,
    name,
    operationType,
    operationTypeLabel: OPERATION_TYPES[operationType] ?? 'System Job',
    stateCode,
    statusCode,
    statusLabel: ASYNC_STATUS_LABELS[statusCode] ?? String(statusCode),
    createdOn,
    startedOn: stateCode !== 0 ? createdOn : '',
    completedOn: stateCode === 3 ? new Date(Date.now() - age * 3500_000).toISOString() : '',
    retryCount: statusCode === ASYNC_STATUS.failed ? 2 : 0,
    message,
    ownerName: 'SYSTEM',
    regardingName: n % 3 === 0 ? 'Contoso GmbH' : '',
    age,
  }
}

const MOCK_JOBS: MockJob[] = [
  job(1, 'PA | SCHED | Invoice Export', 10, ASYNC_STATUS.failed, 2, 'The remote endpoint returned 503 Service Unavailable.'),
  job(2, 'PA | SCHED | Invoice Export', 10, ASYNC_STATUS.failed, 26, 'The remote endpoint returned 503 Service Unavailable.'),
  job(3, 'Workflow: Set account rating', 10, ASYNC_STATUS.succeeded, 1),
  job(4, 'Workflow: Set account rating', 10, ASYNC_STATUS.succeeded, 3),
  job(5, 'Bulk delete: Completed system jobs', 12, ASYNC_STATUS.inProgress, 0.5),
  job(6, 'Workflow: Escalate overdue case', 10, ASYNC_STATUS.waiting, 30),
  job(7, 'Workflow: Escalate overdue case', 10, ASYNC_STATUS.waiting, 6),
  job(8, 'Solution import: DeploymentQ3', 29, ASYNC_STATUS.succeeded, 20),
  job(9, 'PA | MANUAL | Sync DevOps Status', 10, ASYNC_STATUS.failed, 5, 'Authorization failed: token expired.'),
  job(10, 'Workflow: Send welcome mail', 10, ASYNC_STATUS.canceled, 40),
  ...Array.from({ length: 14 }, (_, i) =>
    job(
      20 + i,
      'Workflow: Recalculate rollups',
      10,
      i % 5 === 0 ? ASYNC_STATUS.failed : ASYNC_STATUS.succeeded,
      i * 4 + 1,
      i % 5 === 0 ? 'Record was locked by another process.' : '',
    ),
  ),
]

const MOCK_FLOWS: FlowInfo[] = [
  {
    workflowId: 'flow-0001',
    workflowIdUnique: 'u-flow-0001',
    name: 'PA | SCHED | Invoice Export',
    stateCode: 1,
    ownerName: 'Andy Schwarz',
    modifiedOn: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  },
  {
    workflowId: 'flow-0002',
    workflowIdUnique: 'u-flow-0002',
    name: 'PA | AUTO | Case escalation',
    stateCode: 1,
    ownerName: 'Marie Curie',
    modifiedOn: new Date(Date.now() - 10 * 86_400_000).toISOString(),
  },
  {
    workflowId: 'flow-0003',
    workflowIdUnique: 'u-flow-0003',
    name: 'PA | SCHED | Heartbeat Integration Hub',
    stateCode: 1,
    ownerName: 'Andy Schwarz',
    modifiedOn: new Date(Date.now() - 30 * 86_400_000).toISOString(),
  },
]

/** Deterministic run history per flow: flow-0001 fails often. */
function runsForFlow(flow: FlowInfo, environmentId: string | null): FlowRunInfo[] {
  const failEvery = flow.workflowId === 'flow-0001' ? 3 : 12
  return Array.from({ length: 20 }, (_, i) => {
    const start = Date.now() - i * 3 * 3600_000
    const failed = i % failEvery === 0
    const runName = `0858${flow.workflowId.slice(-4)}${String(1000 - i)}`
    return {
      id: `${flow.workflowId}-run-${i}`,
      runName,
      status: failed ? 'Failed' : 'Succeeded',
      startTime: new Date(start).toISOString(),
      endTime: new Date(start + 42_000).toISOString(),
      durationMs: 42_000,
      errorMessage: failed
        ? 'Action "Send_to_SFTP" failed: connection timed out.'
        : '',
      portalUrl: flowRunUrl(environmentId, flow.workflowIdUnique, runName),
    }
  })
}

const MOCK_WATCHDOG_DEFS = [
  {
    id: 'hb-0001',
    name: 'Integration Hub → SAP',
    expectedIntervalMinutes: 60,
    graceMinutes: 15,
    isActive: true,
    lastBeatMinutesAgo: 12,
    status: 'OK',
  },
  {
    id: 'hb-0002',
    name: 'Nightly master-data sync',
    expectedIntervalMinutes: 1440,
    graceMinutes: 120,
    isActive: true,
    // Overdue: last beat ~2.2 days ago.
    lastBeatMinutesAgo: 3200,
    status: 'OK',
  },
  {
    id: 'hb-0003',
    name: 'Legacy CSV import (retired)',
    expectedIntervalMinutes: 60,
    graceMinutes: 10,
    isActive: false,
    lastBeatMinutesAgo: null,
    status: '',
  },
] as const

class MockJobMonitorService implements JobMonitorService {
  async getHealthSummary(_envKey: string): Promise<JobHealthSummary> {
    void _envKey
    await delay(250)
    const failed24h = MOCK_JOBS.filter(
      (j) => j.statusCode === ASYNC_STATUS.failed && j.age <= 24,
    ).length
    const waiting = MOCK_JOBS.filter(
      (j) =>
        j.statusCode === ASYNC_STATUS.waiting ||
        j.statusCode === ASYNC_STATUS.waitingForResources,
    )
    const oldest = waiting.reduce<string>(
      (acc, j) => (acc && acc < j.createdOn ? acc : j.createdOn),
      '',
    )
    const watchdog = await this.listWatchdog('')
    const wd = { ok: 0, overdue: 0, never: 0, inactive: 0 }
    for (const entry of watchdog.entries) wd[entry.state]++
    return {
      failed24h,
      waitingCount: waiting.length,
      oldestWaitingOn: oldest,
      flowFailRate24h: 0.18,
      flowSampleSize: 60,
      watchdog: wd,
      watchdogAvailable: true,
    }
  }

  async listJobs(filter: JobFilter, _envKey: string): Promise<AsyncJobInfo[]> {
    void _envKey
    await delay(250)
    const needle = filter.nameSearch?.trim().toLowerCase() ?? ''
    return MOCK_JOBS.filter((j) => {
      if (j.age > filter.hours) return false
      if (
        filter.statusCodes &&
        filter.statusCodes.length > 0 &&
        !filter.statusCodes.includes(j.statusCode)
      )
        return false
      if (
        filter.operationType !== undefined &&
        j.operationType !== filter.operationType
      )
        return false
      if (needle && !j.name.toLowerCase().includes(needle)) return false
      return true
    })
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
      .map(({ age, ...jobInfo }) => {
        void age
        return jobInfo
      })
  }

  private async bulk(
    jobs: { id: string; name: string }[],
    apply: (j: MockJob) => void,
    onProgress?: (done: number, total: number) => void,
  ): Promise<JobActionResult[]> {
    const batch = jobs.slice(0, JOB_BULK_LIMIT)
    const results: JobActionResult[] = []
    let done = 0
    for (const target of batch) {
      await delay(120)
      const found = MOCK_JOBS.find((j) => j.id === target.id)
      if (found && found.stateCode !== 3) {
        apply(found)
        results.push({ id: target.id, name: target.name, ok: true })
      } else {
        results.push({
          id: target.id,
          name: target.name,
          ok: false,
          error: found
            ? 'The job is already completed and cannot be changed.'
            : 'Job not found.',
        })
      }
      onProgress?.(++done, batch.length)
    }
    return results
  }

  async cancelJobs(
    jobs: { id: string; name: string }[],
    _envKey: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<JobActionResult[]> {
    void _envKey
    return this.bulk(
      jobs,
      (j) => {
        j.stateCode = 3
        j.statusCode = ASYNC_STATUS.canceled
        j.statusLabel = ASYNC_STATUS_LABELS[ASYNC_STATUS.canceled]
      },
      onProgress,
    )
  }

  async retryJobs(
    jobs: { id: string; name: string }[],
    _envKey: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<JobActionResult[]> {
    void _envKey
    return this.bulk(
      jobs,
      (j) => {
        j.stateCode = 0
        j.statusCode = ASYNC_STATUS.waitingForResources
        j.statusLabel = ASYNC_STATUS_LABELS[ASYNC_STATUS.waitingForResources]
      },
      onProgress,
    )
  }

  async listFlows(_envKey: string, filter?: FlowFilter): Promise<FlowInfo[]> {
    void _envKey
    await delay(200)
    let flows = MOCK_FLOWS.map((f) => ({ ...f }))
    if (filter?.nameSearch?.trim()) {
      const q = filter.nameSearch.trim().toLowerCase()
      flows = flows.filter((f) => f.name.toLowerCase().includes(q))
    }
    if (filter?.solutionUniqueName) {
      // Deterministic pseudo-membership so the solution filter is demoable.
      const u = filter.solutionUniqueName
      flows = flows.filter((f) => {
        const s = `${u}|${f.name}`
        let h = 0
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997
        return h % 3 !== 0
      })
    }
    return flows
  }

  async getFlowRunDetail(
    run: FlowRunInfo,
    _envKey: string,
  ): Promise<FlowRunDetailField[]> {
    void _envKey
    await delay(120)
    const failed = run.status.toLowerCase().includes('fail')
    const fields: FlowRunDetailField[] = [
      { label: 'Run id', value: run.runName },
      { label: 'Status', value: run.status },
      { label: 'Start time', value: run.startTime },
      { label: 'End time', value: run.endTime },
      {
        label: 'Duration',
        value: run.durationMs ? `${Math.round(run.durationMs / 1000)} s` : '—',
      },
      { label: 'Trigger type', value: 'Automated — When a row is added (Dataverse)' },
      {
        label: 'Trigger input',
        value:
          '{\n  "entity": "salesorder",\n  "id": "3b2f…-…-a1",\n  "SdkMessage": "Create"\n}',
      },
    ]
    if (failed) {
      fields.push({ label: 'Error code', value: 'ActionFailed' })
      fields.push({ label: 'Error message', value: run.errorMessage })
    }
    return fields
  }

  async sampleFlowStats(
    flows: FlowInfo[],
    _envKey: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Map<string, FlowRunStats | undefined>> {
    void _envKey
    const map = new Map<string, FlowRunStats | undefined>()
    let done = 0
    for (const flow of flows) {
      await delay(120)
      const runs = runsForFlow(flow, null)
      const failed = runs.filter((r) => r.status === 'Failed').length
      map.set(flow.workflowId, {
        sampleSize: runs.length,
        failed,
        failRate: failed / runs.length,
        lastRunOn: runs[0].startTime,
      })
      onProgress?.(++done, flows.length)
    }
    return map
  }

  async listFlowRuns(flow: FlowInfo, envKey: string): Promise<FlowRunInfo[]> {
    await delay(200)
    return runsForFlow(flow, envKey ? environmentIdForEnvKey(envKey) : null)
  }

  async listWatchdog(_envKey: string): Promise<{
    available: boolean
    entries: WatchdogEntry[]
  }> {
    void _envKey
    await delay(150)
    const now = new Date()
    const entries: WatchdogEntry[] = MOCK_WATCHDOG_DEFS.map((def) => {
      const lastBeat =
        def.lastBeatMinutesAgo === null
          ? null
          : {
              timestamp: new Date(
                now.getTime() - def.lastBeatMinutesAgo * 60_000,
              ).toISOString(),
              status: def.status,
              message: '',
            }
      const verdict = evaluateHeartbeat(def, lastBeat, now)
      return {
        definition: {
          id: def.id,
          name: def.name,
          expectedIntervalMinutes: def.expectedIntervalMinutes,
          graceMinutes: def.graceMinutes,
          isActive: def.isActive,
        },
        lastBeat,
        state: verdict.state,
        overdueMinutes: verdict.overdueMinutes,
      }
    })
    const rank = { overdue: 0, never: 1, ok: 2, inactive: 3 } as const
    entries.sort((a, b) => rank[a.state] - rank[b.state])
    return { available: true, entries }
  }

  async getTrends(days: number, _envKey: string): Promise<JobTrendPoint[]> {
    void _envKey
    await delay(250)
    const points: JobTrendPoint[] = []
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86_400_000)
        .toISOString()
        .slice(0, 10)
      // Deterministic wave with a failure spike two days ago.
      const total = 120 + ((i * 37) % 60)
      const failed = i === 2 ? 24 : (i * 13) % 7
      points.push({ day, failed, total })
    }
    return points
  }
}

export const mockJobMonitorService: JobMonitorService =
  new MockJobMonitorService()
