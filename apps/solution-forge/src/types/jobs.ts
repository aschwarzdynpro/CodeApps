/**
 * Async Job / Flow Monitor — types over `asyncoperation`, `workflow`
 * (category 5 = cloud flows), `flowrun` and the customer watchdog tables.
 */

/** asyncoperation.statecode values. */
export const ASYNC_STATE = {
  ready: 0,
  suspended: 1,
  locked: 2,
  completed: 3,
} as const

/** asyncoperation.statuscode values (the ones the monitor works with). */
export const ASYNC_STATUS = {
  waitingForResources: 0,
  waiting: 10,
  inProgress: 20,
  pausing: 21,
  canceling: 22,
  succeeded: 30,
  failed: 31,
  canceled: 32,
} as const

export const ASYNC_STATUS_LABELS: Record<number, string> = {
  0: 'Waiting for resources',
  10: 'Waiting',
  20: 'In progress',
  21: 'Pausing',
  22: 'Canceling',
  30: 'Succeeded',
  31: 'Failed',
  32: 'Canceled',
}

/** One `asyncoperation` row in the job explorer. */
export interface AsyncJobInfo {
  id: string
  name: string
  /** operationtype option value (e.g. 10 workflow) and its display label. */
  operationType: number
  operationTypeLabel: string
  stateCode: number
  statusCode: number
  statusLabel: string
  createdOn: string
  startedOn: string
  completedOn: string
  retryCount: number
  /** friendlymessage — the error text for failed jobs. */
  message: string
  ownerName: string
  regardingName: string
}

/** Facet filters for the job explorer (server-side). */
export interface JobFilter {
  /** Look-back window in hours (enforced — asyncoperation is huge). */
  hours: number
  /** undefined = all states. */
  statusCodes?: number[]
  /** Filter on operationtype option value. */
  operationType?: number
  nameSearch?: string
}

/** Per-job outcome of a bulk cancel/retry. */
export interface JobActionResult {
  id: string
  name: string
  ok: boolean
  error?: string
}

/** One cloud flow (workflow row, category 5). */
export interface FlowInfo {
  workflowId: string
  /** Import-stable id used in Power Automate portal deep links. */
  workflowIdUnique: string
  name: string
  stateCode: number
  ownerName: string
  modifiedOn: string
  /** Filled by the run sample — undefined until loaded. */
  runStats?: FlowRunStats
}

export interface FlowRunStats {
  sampleSize: number
  failed: number
  /** failed / sampleSize, 0..1. */
  failRate: number
  lastRunOn: string
}

/** Server-side filters for the cloud-flow list. */
export interface FlowFilter {
  /** Only flows that are components of this solution (matched in the target env). */
  solutionUniqueName?: string
  /** Substring match on the flow name. */
  nameSearch?: string
}

/** One label/value pair of a flow run's full detail (shown in the run popup). */
export interface FlowRunDetailField {
  label: string
  value: string
}

/** One `flowrun` row. */
export interface FlowRunInfo {
  id: string
  /** The run name — also the id used in the portal run URL. */
  runName: string
  status: string
  startTime: string
  endTime: string
  durationMs: number
  errorMessage: string
  /** Deep link into the Power Automate portal run page. */
  portalUrl: string
}

/** Watchdog definition row (heartbeat contract of one integration/flow). */
export interface HeartbeatDefinition {
  id: string
  name: string
  expectedIntervalMinutes: number
  graceMinutes: number
  isActive: boolean
}

/** Latest heartbeat of one definition. */
export interface HeartbeatBeat {
  timestamp: string
  status: string
  message: string
}

export type WatchdogState = 'ok' | 'overdue' | 'never' | 'inactive'

export interface WatchdogEntry {
  definition: HeartbeatDefinition
  lastBeat: HeartbeatBeat | null
  state: WatchdogState
  /** Minutes since the beat became overdue (state 'overdue' / 'never'). */
  overdueMinutes: number
}

/** Health dashboard tiles. */
export interface JobHealthSummary {
  failed24h: number
  waitingCount: number
  /** createdon of the oldest waiting operation, '' when none. */
  oldestWaitingOn: string
  /** Sampled flow failure rate (top active flows) — null when unavailable. */
  flowFailRate24h: number | null
  flowSampleSize: number
  watchdog: { ok: number; overdue: number; never: number; inactive: number }
  /** False when the watchdog tables are not installed in this environment. */
  watchdogAvailable: boolean
}

/** One day in the failed-jobs trend. */
export interface JobTrendPoint {
  day: string
  failed: number
  total: number
}
