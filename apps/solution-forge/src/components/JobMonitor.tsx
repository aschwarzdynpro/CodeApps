import { Fragment, useCallback, useEffect, useState } from 'react'
import { isCurrentEnvKey } from '../config'
import { OperateEnvPicker } from './OperateEnvPicker'
import type {
  AsyncJobInfo,
  FlowInfo,
  FlowRunInfo,
  FlowRunStats,
  JobActionResult,
  JobHealthSummary,
  JobTrendPoint,
  WatchdogEntry,
} from '../types/jobs'
import { ASYNC_STATUS } from '../types/jobs'
import { jobMonitorService, JOB_BULK_LIMIT } from '../services/jobMonitorService'

/**
 * Async Job / Flow Monitor — "is async processing healthy?" in one look:
 *
 * - Health: failed/waiting/flow-failure/watchdog tiles, each drilling into
 *   its detail tab pre-filtered.
 * - System jobs: `asyncoperation` explorer with enforced look-back, facet
 *   filters and (deployment managers) sequential bulk cancel/retry with
 *   per-job outcome reporting.
 * - Flows: cloud flows with a sampled failure rate; per flow the recent runs
 *   with Power Automate portal deep links.
 * - Watchdog: heartbeat definitions vs. latest beats (pure-function verdict).
 * - Trends: failed jobs per day (7/30 d), aggregated server-side.
 */

interface Props {
  /** Deployment managers may bulk-cancel / retry jobs. */
  canManageJobs: boolean
  /** Selected target environment (shared across the Operate features). */
  envKey: string
  onEnvChange: (envKey: string) => void
}

type SubTab = 'health' | 'jobs' | 'flows' | 'watchdog' | 'trends'

const STATUS_CHIPS: { code: number; label: string }[] = [
  { code: ASYNC_STATUS.failed, label: 'Failed' },
  { code: ASYNC_STATUS.waiting, label: 'Waiting' },
  { code: ASYNC_STATUS.waitingForResources, label: 'Waiting (res.)' },
  { code: ASYNC_STATUS.inProgress, label: 'In progress' },
  { code: ASYNC_STATUS.succeeded, label: 'Succeeded' },
  { code: ASYNC_STATUS.canceled, label: 'Canceled' },
]

const JOB_WINDOWS = [24, 72, 168] as const

function fmtDateTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function fmtAgo(iso: string): string {
  if (!iso) return '—'
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`
  return `${Math.round(minutes / 1440)} d ago`
}

function statusClass(statusCode: number): string {
  if (statusCode === ASYNC_STATUS.failed) return 'jobs-status--failed'
  if (
    statusCode === ASYNC_STATUS.waiting ||
    statusCode === ASYNC_STATUS.waitingForResources
  )
    return 'jobs-status--waiting'
  if (statusCode === ASYNC_STATUS.succeeded) return 'jobs-status--ok'
  if (statusCode === ASYNC_STATUS.inProgress) return 'jobs-status--running'
  return ''
}

const WATCHDOG_LIGHT: Record<WatchdogEntry['state'], { icon: string; label: string }> = {
  ok: { icon: '🟢', label: 'OK' },
  overdue: { icon: '🔴', label: 'Overdue' },
  never: { icon: '🔴', label: 'Never beat' },
  inactive: { icon: '⚪', label: 'Inactive' },
}

export function JobMonitor({ canManageJobs, envKey, onEnvChange }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('health')
  // Native asyncoperation writes only reach the host environment.
  const canWrite = canManageJobs && isCurrentEnvKey(envKey)

  // --- health ------------------------------------------------------------
  const [health, setHealth] = useState<JobHealthSummary | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const loadHealth = useCallback(async () => {
    setHealthLoading(true)
    setHealthError(null)
    try {
      setHealth(await jobMonitorService.getHealthSummary(envKey))
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : String(err))
    } finally {
      setHealthLoading(false)
    }
  }, [envKey])

  useEffect(() => {
    if (subTab !== 'health' || health || healthLoading || healthError) return
    const t = window.setTimeout(() => void loadHealth(), 50)
    return () => window.clearTimeout(t)
  }, [subTab, health, healthLoading, healthError, loadHealth])

  // --- jobs ----------------------------------------------------------------
  const [jobs, setJobs] = useState<AsyncJobInfo[] | null>(null)
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [jobHours, setJobHours] = useState<number>(24)
  const [statusFilter, setStatusFilter] = useState<number[]>([])
  const [jobSearch, setJobSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [bulkProgress, setBulkProgress] = useState<[number, number] | null>(null)
  const [bulkResults, setBulkResults] = useState<JobActionResult[] | null>(null)

  const loadJobs = useCallback(
    async (f: { hours: number; statusCodes: number[]; search: string }) => {
      setJobsLoading(true)
      setJobsError(null)
      try {
        const rows = await jobMonitorService.listJobs(
          {
            hours: f.hours,
            statusCodes: f.statusCodes.length ? f.statusCodes : undefined,
            nameSearch: f.search || undefined,
          },
          envKey,
        )
        setJobs(rows)
        setSelected(new Set())
      } catch (err) {
        setJobsError(err instanceof Error ? err.message : String(err))
      } finally {
        setJobsLoading(false)
      }
    },
    [envKey],
  )
  const jobFilter = {
    hours: jobHours,
    statusCodes: statusFilter,
    search: jobSearch,
  }

  useEffect(() => {
    if (subTab !== 'jobs') return
    const t = window.setTimeout(
      () =>
        void loadJobs({
          hours: jobHours,
          statusCodes: statusFilter,
          search: jobSearch,
        }),
      300,
    )
    return () => window.clearTimeout(t)
  }, [subTab, jobHours, statusFilter, jobSearch, loadJobs])

  const toggleStatus = (code: number) =>
    setStatusFilter((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const runBulk = async (action: 'cancel' | 'retry') => {
    if (!jobs) return
    const targets = jobs
      .filter((j) => selected.has(j.id))
      .map((j) => ({ id: j.id, name: j.name }))
    if (targets.length === 0) return
    const verb = action === 'cancel' ? 'Cancel' : 'Retry'
    if (
      !window.confirm(
        `${verb} ${targets.length} job${targets.length === 1 ? '' : 's'}?` +
          (targets.length > JOB_BULK_LIMIT
            ? ` Only the first ${JOB_BULK_LIMIT} are processed per batch.`
            : ''),
      )
    )
      return
    setBulkProgress([0, Math.min(targets.length, JOB_BULK_LIMIT)])
    setBulkResults(null)
    try {
      const results =
        action === 'cancel'
          ? await jobMonitorService.cancelJobs(targets, envKey, (done, total) =>
              setBulkProgress([done, total]),
            )
          : await jobMonitorService.retryJobs(targets, envKey, (done, total) =>
              setBulkProgress([done, total]),
            )
      setBulkResults(results)
    } finally {
      setBulkProgress(null)
      void loadJobs(jobFilter)
    }
  }

  // --- flows ---------------------------------------------------------------
  const [flows, setFlows] = useState<FlowInfo[] | null>(null)
  const [flowsError, setFlowsError] = useState<string | null>(null)
  const [flowStats, setFlowStats] = useState<Map<string, FlowRunStats | undefined> | null>(null)
  const [statsProgress, setStatsProgress] = useState<[number, number] | null>(null)
  const [selectedFlow, setSelectedFlow] = useState<FlowInfo | null>(null)
  const [flowRuns, setFlowRuns] = useState<FlowRunInfo[] | null>(null)
  const [flowRunsError, setFlowRunsError] = useState<string | null>(null)

  useEffect(() => {
    if (subTab !== 'flows' || flows) return
    let cancelled = false
    jobMonitorService
      .listFlows(envKey)
      .then((f) => {
        if (!cancelled) setFlows(f)
      })
      .catch((err) => {
        if (!cancelled)
          setFlowsError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [subTab, flows, envKey])

  const loadFlowStats = async () => {
    if (!flows) return
    setStatsProgress([0, Math.min(flows.length, 20)])
    try {
      const stats = await jobMonitorService.sampleFlowStats(
        flows,
        envKey,
        (done, total) => setStatsProgress([done, total]),
      )
      setFlowStats(stats)
    } catch (err) {
      setFlowsError(err instanceof Error ? err.message : String(err))
    } finally {
      setStatsProgress(null)
    }
  }

  const openFlow = (flow: FlowInfo) => {
    setSelectedFlow(flow)
    setFlowRuns(null)
    setFlowRunsError(null)
    jobMonitorService
      .listFlowRuns(flow, envKey)
      .then(setFlowRuns)
      .catch((err) =>
        setFlowRunsError(err instanceof Error ? err.message : String(err)),
      )
  }

  const sortedFlows = flows
    ? [...flows].sort((a, b) => {
        const ra = flowStats?.get(a.workflowId)?.failRate ?? -1
        const rb = flowStats?.get(b.workflowId)?.failRate ?? -1
        return rb - ra
      })
    : null

  // --- watchdog ------------------------------------------------------------
  const [watchdog, setWatchdog] = useState<{
    available: boolean
    entries: WatchdogEntry[]
  } | null>(null)
  const [watchdogError, setWatchdogError] = useState<string | null>(null)

  useEffect(() => {
    if (subTab !== 'watchdog' || watchdog) return
    let cancelled = false
    jobMonitorService
      .listWatchdog(envKey)
      .then((w) => {
        if (!cancelled) setWatchdog(w)
      })
      .catch((err) => {
        if (!cancelled)
          setWatchdogError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [subTab, watchdog, envKey])

  // --- trends ----------------------------------------------------------------
  const [trendDays, setTrendDays] = useState(7)
  const [trend, setTrend] = useState<JobTrendPoint[] | null>(null)
  const [trendError, setTrendError] = useState<string | null>(null)
  const [trendLoading, setTrendLoading] = useState(false)

  useEffect(() => {
    if (subTab !== 'trends') return
    let cancelled = false
    const t = window.setTimeout(() => {
      setTrendLoading(true)
      setTrendError(null)
      jobMonitorService
        .getTrends(trendDays, envKey)
        .then((points) => {
          if (!cancelled) setTrend(points)
        })
        .catch((err) => {
          if (!cancelled)
            setTrendError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (!cancelled) setTrendLoading(false)
        })
    }, 50)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [subTab, trendDays, envKey])

  const maxFailed = Math.max(1, ...(trend ?? []).map((p) => p.failed))

  // Tile drill-downs.
  const drillFailed = () => {
    setStatusFilter([ASYNC_STATUS.failed])
    setJobHours(24)
    setSubTab('jobs')
  }
  const drillWaiting = () => {
    setStatusFilter([ASYNC_STATUS.waiting, ASYNC_STATUS.waitingForResources])
    setJobHours(168)
    setSubTab('jobs')
  }

  return (
    <div>
      <OperateEnvPicker envKey={envKey} onChange={onEnvChange} writeHint />
      <nav className="subtabs">
        {(
          [
            ['health', 'Health'],
            ['jobs', 'System jobs'],
            ['flows', 'Flows'],
            ['watchdog', 'Watchdog'],
            ['trends', 'Trends'],
          ] as [SubTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`subtab ${subTab === key ? 'subtab--active' : ''}`}
            onClick={() => setSubTab(key)}
          >
            {label}
          </button>
        ))}
        {subTab === 'health' && (
          <span className="trace-level-control">
            <button
              className="btn btn--small"
              onClick={() => void loadHealth()}
              disabled={healthLoading}
            >
              {healthLoading ? 'Refreshing…' : '⟳ Refresh'}
            </button>
          </span>
        )}
      </nav>

      {subTab === 'health' && (
        <>
          {healthError && <div className="state state--error">{healthError}</div>}
          {!health && !healthError && <div className="state">Checking async health…</div>}
          {health && (
            <div className="jobs-tiles">
              <button
                className={`jobs-tile ${health.failed24h > 0 ? 'jobs-tile--bad' : 'jobs-tile--good'}`}
                onClick={drillFailed}
              >
                <span className="jobs-tile-value">{health.failed24h}</span>
                <span className="jobs-tile-label">Failed jobs (24 h)</span>
                <span className="jobs-tile-hint">click for the list</span>
              </button>
              <button
                className={`jobs-tile ${health.waitingCount > 25 ? 'jobs-tile--warn' : ''}`}
                onClick={drillWaiting}
              >
                <span className="jobs-tile-value">{health.waitingCount}</span>
                <span className="jobs-tile-label">Waiting backlog</span>
                <span className="jobs-tile-hint">
                  {health.oldestWaitingOn
                    ? `oldest ${fmtAgo(health.oldestWaitingOn)}`
                    : 'nothing waiting'}
                </span>
              </button>
              <button
                className={`jobs-tile ${
                  health.flowFailRate24h === null
                    ? ''
                    : health.flowFailRate24h > 0.1
                      ? 'jobs-tile--bad'
                      : health.flowFailRate24h > 0
                        ? 'jobs-tile--warn'
                        : 'jobs-tile--good'
                }`}
                onClick={() => setSubTab('flows')}
              >
                <span className="jobs-tile-value">
                  {health.flowFailRate24h === null
                    ? 'n/a'
                    : `${Math.round(health.flowFailRate24h * 100)} %`}
                </span>
                <span className="jobs-tile-label">Flow failure rate (24 h)</span>
                <span className="jobs-tile-hint">
                  {health.flowFailRate24h === null
                    ? 'flowrun table not readable'
                    : `sample of ${health.flowSampleSize} runs`}
                </span>
              </button>
              <button
                className={`jobs-tile ${
                  !health.watchdogAvailable
                    ? ''
                    : health.watchdog.overdue + health.watchdog.never > 0
                      ? 'jobs-tile--bad'
                      : 'jobs-tile--good'
                }`}
                onClick={() => setSubTab('watchdog')}
              >
                <span className="jobs-tile-value">
                  {health.watchdogAvailable ? (
                    <>
                      {health.watchdog.ok} <span className="wd-dot wd-dot--ok" />{' '}
                      / {health.watchdog.overdue + health.watchdog.never}{' '}
                      <span className="wd-dot wd-dot--bad" />
                    </>
                  ) : (
                    'n/a'
                  )}
                </span>
                <span className="jobs-tile-label">Watchdog heartbeats</span>
                <span className="jobs-tile-hint">
                  {health.watchdogAvailable
                    ? `${health.watchdog.inactive} inactive`
                    : 'tables not installed'}
                </span>
              </button>
            </div>
          )}
        </>
      )}

      {subTab === 'jobs' && (
        <>
          <div className="card trace-toolbar">
            <label>
              Window
              <select
                value={jobHours}
                onChange={(e) => setJobHours(Number(e.target.value))}
              >
                {JOB_WINDOWS.map((h) => (
                  <option key={h} value={h}>
                    {h <= 24 ? `${h} h` : `${h / 24} d`}
                  </option>
                ))}
              </select>
            </label>
            <div className="chips">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.code}
                  className={`chip ${statusFilter.includes(chip.code) ? 'chip--active' : ''}`}
                  onClick={() => toggleStatus(chip.code)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <input
              className="search"
              type="search"
              placeholder="Job name…"
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
            />
            <span className="trace-toolbar-right">
              {canManageJobs && (
                <>
                  <button
                    className="btn btn--small"
                    disabled={selected.size === 0 || !!bulkProgress || !canWrite}
                    title={
                      canWrite
                        ? `Cancel the selected jobs (max ${JOB_BULK_LIMIT} per batch, sequential).`
                        : 'Cancelling jobs only works against the host environment — native writes cannot target another environment.'
                    }
                    onClick={() => void runBulk('cancel')}
                  >
                    ✕ Cancel selected ({selected.size})
                  </button>
                  <button
                    className="btn btn--small"
                    disabled={selected.size === 0 || !!bulkProgress || !canWrite}
                    title={
                      canWrite
                        ? 'Put the selected failed/canceled jobs back to Waiting.'
                        : 'Retrying jobs only works against the host environment.'
                    }
                    onClick={() => void runBulk('retry')}
                  >
                    ↻ Retry selected
                  </button>
                </>
              )}
              <button
                className="btn btn--small"
                onClick={() => void loadJobs(jobFilter)}
                disabled={jobsLoading}
              >
                {jobsLoading ? 'Refreshing…' : '⟳ Refresh'}
              </button>
            </span>
          </div>

          {bulkProgress && (
            <div className="sharing-progress" aria-live="polite">
              <span className="sharing-progress-spinner" />
              <span className="sharing-progress-text">
                Processing job {bulkProgress[0]}/{bulkProgress[1]}…
              </span>
            </div>
          )}
          {bulkResults && (
            <div
              className={`state ${bulkResults.some((r) => !r.ok) ? 'state--error' : 'state--success'}`}
            >
              <span>
                {bulkResults.filter((r) => r.ok).length} succeeded,{' '}
                {bulkResults.filter((r) => !r.ok).length} failed.
              </span>
              {bulkResults.some((r) => !r.ok) && (
                <ul className="merge-errors">
                  {bulkResults
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <li key={r.id}>
                        {r.name}: {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {jobsError && <div className="state state--error">{jobsError}</div>}
          {!jobs && !jobsError && <div className="state">Loading system jobs…</div>}
          {jobs && jobs.length === 0 && (
            <div className="state">No system jobs match the filters.</div>
          )}
          {jobs && jobs.length > 0 && (
            <div className="card trace-list">
              <table className="ops-table">
                <thead>
                  <tr>
                    {canManageJobs && <th></th>}
                    <th>Created</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th className="num">Retries</th>
                    <th>Owner</th>
                    <th>Regarding</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <Fragment key={j.id}>
                      <tr
                        className={`ops-row ${j.statusCode === ASYNC_STATUS.failed ? 'ops-row--error' : ''} ${expandedJob === j.id ? 'ops-row--open' : ''}`}
                        onClick={() =>
                          setExpandedJob(expandedJob === j.id ? null : j.id)
                        }
                      >
                        {canManageJobs && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(j.id)}
                              onChange={() => toggleSelected(j.id)}
                              aria-label={`Select ${j.name}`}
                            />
                          </td>
                        )}
                        <td className="nowrap">{fmtDateTime(j.createdOn)}</td>
                        <td className="trace-type" title={j.name}>
                          {j.name}
                        </td>
                        <td>{j.operationTypeLabel}</td>
                        <td>
                          <span className={`jobs-status ${statusClass(j.statusCode)}`}>
                            {j.statusLabel}
                          </span>
                        </td>
                        <td className="num">{j.retryCount}</td>
                        <td>{j.ownerName || <span className="muted">—</span>}</td>
                        <td>{j.regardingName || <span className="muted">—</span>}</td>
                      </tr>
                      {expandedJob === j.id && (
                        <tr className="ops-detail-row">
                          <td colSpan={canManageJobs ? 8 : 7}>
                            <div className="jobs-message">
                              <div>
                                <span className="muted">Started:</span>{' '}
                                {fmtDateTime(j.startedOn)}{' '}
                                <span className="muted">Completed:</span>{' '}
                                {fmtDateTime(j.completedOn)}
                              </div>
                              {j.message ? (
                                <pre>{j.message}</pre>
                              ) : (
                                <span className="muted">No message.</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {subTab === 'flows' && (
        <>
          {flowsError && <div className="state state--error">{flowsError}</div>}
          {!flows && !flowsError && <div className="state">Loading flows…</div>}
          {flows && (
            <div className="jobs-flows">
              <div className="card trace-list">
                <div className="jobs-flows-head">
                  <strong>Cloud flows ({flows.length})</strong>
                  <button
                    className="btn btn--small"
                    disabled={!!statsProgress}
                    title="Load the last runs of up to 20 flows to compute failure rates (marked sample — connector-friendly)."
                    onClick={() => void loadFlowStats()}
                  >
                    {statsProgress
                      ? `Sampling ${statsProgress[0]}/${statsProgress[1]}…`
                      : flowStats
                        ? '⟳ Re-sample failure rates'
                        : 'Load failure rates (sample)'}
                  </button>
                </div>
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Flow</th>
                      <th>Owner</th>
                      <th className="num" title="Failure rate over the sampled last runs.">
                        Fail rate*
                      </th>
                      <th>Last run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sortedFlows ?? []).map((f) => {
                      const stats = flowStats?.get(f.workflowId)
                      return (
                        <tr
                          key={f.workflowId}
                          className={`ops-row ${selectedFlow?.workflowId === f.workflowId ? 'ops-row--open' : ''} ${stats && stats.failRate > 0.1 ? 'ops-row--error' : ''}`}
                          onClick={() => openFlow(f)}
                        >
                          <td className="trace-type">{f.name}</td>
                          <td>{f.ownerName}</td>
                          <td className="num">
                            {stats
                              ? `${Math.round(stats.failRate * 100)} % (${stats.failed}/${stats.sampleSize})`
                              : '—'}
                          </td>
                          <td className="nowrap">
                            {stats ? fmtAgo(stats.lastRunOn) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="muted jobs-sample-note">
                  * sampled from each flow's most recent runs — not a full
                  history.
                </div>
              </div>

              {selectedFlow && (
                <div className="card trace-list">
                  <div className="jobs-flows-head">
                    <strong>Runs — {selectedFlow.name}</strong>
                  </div>
                  {flowRunsError && (
                    <div className="state state--error">{flowRunsError}</div>
                  )}
                  {!flowRuns && !flowRunsError && (
                    <div className="state">Loading runs…</div>
                  )}
                  {flowRuns && flowRuns.length === 0 && (
                    <div className="state">No runs recorded.</div>
                  )}
                  {flowRuns && flowRuns.length > 0 && (
                    <table className="ops-table">
                      <thead>
                        <tr>
                          <th>Start</th>
                          <th>Status</th>
                          <th className="num">Duration</th>
                          <th>Error</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {flowRuns.map((r) => (
                          <tr
                            key={r.id}
                            className={`ops-row ${r.status.toLowerCase().includes('fail') ? 'ops-row--error' : ''}`}
                          >
                            <td className="nowrap">{fmtDateTime(r.startTime)}</td>
                            <td>
                              <span
                                className={`jobs-status ${r.status.toLowerCase().includes('fail') ? 'jobs-status--failed' : 'jobs-status--ok'}`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="num nowrap">
                              {r.durationMs ? `${Math.round(r.durationMs / 1000)} s` : '—'}
                            </td>
                            <td className="jobs-run-error" title={r.errorMessage}>
                              {r.errorMessage || <span className="muted">—</span>}
                            </td>
                            <td className="nowrap">
                              <a
                                className="btn btn--small"
                                href={r.portalUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Open run ↗
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {subTab === 'watchdog' && (
        <>
          {watchdogError && <div className="state state--error">{watchdogError}</div>}
          {!watchdog && !watchdogError && (
            <div className="state">Evaluating heartbeats…</div>
          )}
          {watchdog && !watchdog.available && (
            <div className="state">
              The watchdog tables are not installed in this environment
              (expected: <code>cust_heartbeatdefinition</code> /{' '}
              <code>cust_heartbeat</code>, configurable in{' '}
              <code>config.ts → WATCHDOG_TABLES</code>). The board turns on
              automatically once they exist and are readable.
            </div>
          )}
          {watchdog?.available && watchdog.entries.length === 0 && (
            <div className="state">No heartbeat definitions found.</div>
          )}
          {watchdog?.available && watchdog.entries.length > 0 && (
            <div className="card trace-list">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Integration</th>
                    <th className="num">Expected every</th>
                    <th className="num">Grace</th>
                    <th>Last beat</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {watchdog.entries.map((entry) => {
                    const light = WATCHDOG_LIGHT[entry.state]
                    return (
                      <tr
                        key={entry.definition.id}
                        className={`ops-row ${entry.state === 'overdue' || entry.state === 'never' ? 'ops-row--error' : ''}`}
                      >
                        <td>{light.icon}</td>
                        <td className="trace-type">{entry.definition.name}</td>
                        <td className="num nowrap">
                          {entry.definition.expectedIntervalMinutes} min
                        </td>
                        <td className="num nowrap">
                          {entry.definition.graceMinutes} min
                        </td>
                        <td className="nowrap">
                          {entry.lastBeat
                            ? `${fmtAgo(entry.lastBeat.timestamp)}${entry.lastBeat.status ? ` (${entry.lastBeat.status})` : ''}`
                            : 'never'}
                        </td>
                        <td>
                          {light.label}
                          {entry.state === 'overdue' && (
                            <span className="muted"> — {entry.overdueMinutes} min over</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {subTab === 'trends' && (
        <>
          <div className="card trace-toolbar">
            <label>
              Range
              <select
                value={trendDays}
                onChange={(e) => setTrendDays(Number(e.target.value))}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
              </select>
            </label>
          </div>
          {trendError && <div className="state state--error">{trendError}</div>}
          {trendLoading && <div className="state">Aggregating…</div>}
          {!trendLoading && trend && (
            <div className="card jobs-trend">
              <div className="jobs-trend-title">Failed system jobs per day</div>
              <div className="jobs-trend-chart">
                {trend.map((p) => (
                  <div
                    key={p.day}
                    className="jobs-trend-col"
                    title={`${p.day}: ${p.failed} failed${p.total ? ` of ${p.total}` : ''}`}
                  >
                    <div
                      className={`jobs-trend-bar ${p.failed > 0 ? 'jobs-trend-bar--failed' : ''}`}
                      style={{
                        height: `${Math.max(2, (p.failed / maxFailed) * 100)}%`,
                      }}
                    />
                    <span className="jobs-trend-day">{p.day.slice(5)}</span>
                  </div>
                ))}
              </div>
              {trend.every((p) => p.total === 0) && (
                <div className="muted jobs-sample-note">
                  Totals unavailable (aggregate limit) — showing failed counts
                  only.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
