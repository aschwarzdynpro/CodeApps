import { Fragment, useEffect, useMemo, useState } from 'react'
import type {
  ImportJobStatus,
  ImportJobSummary,
  ImportLogDetail,
} from '../types/importHistory'
import { importHistoryService } from '../services/importHistoryService'
import { OperateEnvPicker } from './OperateEnvPicker'

/**
 * Solution Import History — the `importjob` rows of the selected environment,
 * newest first. Expanding a row lazily fetches and parses the import-log XML;
 * missing-dependency failures are extracted into a precise table (which
 * component is missing, which imported component needs it), other
 * failures/warnings are listed below it.
 */
interface Props {
  envKey: string
  onEnvChange: (envKey: string) => void
}

function fmtDateTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function fmtDuration(startedOn: string, completedOn: string): string {
  if (!startedOn || !completedOn) return '—'
  const ms = new Date(completedOn).getTime() - new Date(startedOn).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 90) return `${s} s`
  return `${Math.round(s / 60)} min`
}

function StatusBadge({ status }: { status: ImportJobStatus }) {
  const map: Record<ImportJobStatus, { label: string; cls: string }> = {
    succeeded: { label: 'Succeeded', cls: 'jobs-status--ok' },
    failed: { label: 'Failed', cls: 'jobs-status--failed' },
    running: { label: 'Running', cls: 'jobs-status--running' },
    unknown: { label: 'Unknown', cls: '' },
  }
  const m = map[status]
  return <span className={`jobs-status ${m.cls}`}>{m.label}</span>
}

export function ImportHistoryWorkspace({ envKey, onEnvChange }: Props) {
  const [jobs, setJobs] = useState<ImportJobSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Map<string, ImportLogDetail>>(
    new Map(),
  )
  const [detailLoading, setDetailLoading] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      importHistoryService
        .listImportJobs(envKey)
        .then((rows) => {
          if (!cancelled) setJobs(rows)
        })
        .catch((err) => {
          if (!cancelled)
            setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 20)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [envKey])

  const reload = () => {
    setJobs(null)
    setDetails(new Map())
    setExpanded(null)
    setLoading(true)
    setError(null)
    importHistoryService
      .listImportJobs(envKey)
      .then(setJobs)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false))
  }

  const toggle = (job: ImportJobSummary) => {
    if (expanded === job.id) {
      setExpanded(null)
      return
    }
    setExpanded(job.id)
    setDetailError(null)
    if (details.has(job.id)) return
    setDetailLoading(job.id)
    importHistoryService
      .getImportLog(job.id, envKey)
      .then((d) => setDetails((prev) => new Map(prev).set(job.id, d)))
      .catch((err) =>
        setDetailError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setDetailLoading(null))
  }

  const filtered = useMemo(() => {
    if (!jobs) return []
    const q = search.trim().toLowerCase()
    return jobs.filter(
      (j) =>
        !q ||
        j.solutionName.toLowerCase().includes(q) ||
        j.createdBy.toLowerCase().includes(q),
    )
  }, [jobs, search])

  const failedCount = useMemo(
    () => (jobs ?? []).filter((j) => j.status === 'failed').length,
    [jobs],
  )

  return (
    <div>
      <OperateEnvPicker envKey={envKey} onChange={onEnvChange} />

      <div className="card trace-toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search solution or user…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="trace-toolbar-right">
          {jobs && (
            <span className="muted">
              {jobs.length} import{jobs.length === 1 ? '' : 's'}
              {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            </span>
          )}
          <button
            className="btn btn--small"
            onClick={reload}
            disabled={loading}
          >
            {loading ? 'Reading…' : '⟳ Refresh'}
          </button>
        </span>
      </div>

      {error && <div className="state state--error">{error}</div>}
      {loading && !jobs && <div className="state">Reading import history…</div>}
      {jobs && filtered.length === 0 && (
        <div className="state">
          {jobs.length === 0
            ? 'No import jobs recorded in this environment.'
            : 'No imports match the search.'}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="card trace-list">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Solution</th>
                <th>Status</th>
                <th className="num">Progress</th>
                <th className="num">Duration</th>
                <th>By</th>
                <th>Context</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => {
                const isOpen = expanded === job.id
                const detail = details.get(job.id)
                return (
                  <Fragment key={job.id}>
                    <tr
                      className={`ops-row ${job.status === 'failed' ? 'ops-row--error' : ''} ${isOpen ? 'ops-row--open' : ''}`}
                      onClick={() => toggle(job)}
                    >
                      <td className="nowrap">{fmtDateTime(job.startedOn)}</td>
                      <td className="trace-type">{job.solutionName}</td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="num nowrap">
                        <span className="imp-progress">
                          <span
                            className="imp-progress-bar"
                            style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
                          />
                        </span>
                        {Math.round(job.progress)}%
                      </td>
                      <td className="num nowrap">
                        {fmtDuration(job.startedOn, job.completedOn)}
                      </td>
                      <td>{job.createdBy || <span className="muted">—</span>}</td>
                      <td>{job.context || <span className="muted">—</span>}</td>
                    </tr>
                    {isOpen && (
                      <tr className="ops-detail-row">
                        <td colSpan={7}>
                          {detailLoading === job.id && !detail && (
                            <div className="state">Loading import log…</div>
                          )}
                          {detailError && !detail && (
                            <div className="state state--error">
                              {detailError}
                            </div>
                          )}
                          {detail && (
                            <div className="imp-detail">
                              <div className="imp-detail-head">
                                <StatusBadge status={detail.status !== 'unknown' ? detail.status : job.status} />
                                <span className="trace-type">
                                  {detail.solutionUniqueName || job.solutionName}
                                </span>
                                {detail.solutionVersion && (
                                  <span className="muted">
                                    v{detail.solutionVersion}
                                  </span>
                                )}
                              </div>
                              {detail.topErrorText && (
                                <div className="imp-toperror">
                                  {detail.topErrorText}
                                </div>
                              )}

                              {detail.missingDependencies.length > 0 && (
                                <>
                                  <h4 className="imp-h4">
                                    Missing dependencies (
                                    {detail.missingDependencies.length})
                                  </h4>
                                  <table className="ops-table imp-deps">
                                    <thead>
                                      <tr>
                                        <th colSpan={3} className="imp-deps-group">
                                          Missing in target — install first
                                        </th>
                                        <th colSpan={3} className="imp-deps-group">
                                          Needed by (in the imported solution)
                                        </th>
                                      </tr>
                                      <tr>
                                        <th>Type</th>
                                        <th>Component</th>
                                        <th>From solution</th>
                                        <th>Type</th>
                                        <th>Component</th>
                                        <th>Parent</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detail.missingDependencies.map((d, i) => (
                                        <tr key={i}>
                                          <td className="nowrap">
                                            {d.requiredTypeLabel ||
                                              (d.requiredTypeCode ?? '—')}
                                          </td>
                                          <td>
                                            <div className="envcfg-name">
                                              {d.requiredDisplayName ||
                                                d.requiredSchemaName}
                                            </div>
                                            {d.requiredDisplayName &&
                                              d.requiredSchemaName && (
                                                <div className="envcfg-schema">
                                                  {d.requiredSchemaName}
                                                </div>
                                              )}
                                          </td>
                                          <td>
                                            {d.requiredSolution || (
                                              <span className="muted">—</span>
                                            )}
                                          </td>
                                          <td className="nowrap">
                                            {d.dependentTypeLabel ||
                                              (d.dependentTypeCode ?? '—')}
                                          </td>
                                          <td>
                                            <div className="envcfg-name">
                                              {d.dependentDisplayName ||
                                                d.dependentSchemaName}
                                            </div>
                                            {d.dependentDisplayName &&
                                              d.dependentSchemaName && (
                                                <div className="envcfg-schema">
                                                  {d.dependentSchemaName}
                                                </div>
                                              )}
                                          </td>
                                          <td>
                                            {d.dependentParent || (
                                              <span className="muted">—</span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <div className="muted jobs-sample-note">
                                    Install or include the “missing in target”
                                    components (left) before retrying — the
                                    Deployment Readiness check finds them
                                    up-front.
                                  </div>
                                </>
                              )}

                              {detail.failures.length > 0 && (
                                <>
                                  <h4 className="imp-h4">
                                    Other issues ({detail.failures.length})
                                  </h4>
                                  <table className="ops-table">
                                    <thead>
                                      <tr>
                                        <th>Severity</th>
                                        <th>Code</th>
                                        <th>Message</th>
                                        <th>Context</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detail.failures.map((f, i) => (
                                        <tr key={i}>
                                          <td>
                                            <span
                                              className={`jobs-status ${f.severity === 'failure' ? 'jobs-status--failed' : 'jobs-status--waiting'}`}
                                            >
                                              {f.severity}
                                            </span>
                                          </td>
                                          <td className="trace-type nowrap">
                                            {f.errorCode || '—'}
                                          </td>
                                          <td className="imp-message">
                                            {f.errorText}
                                          </td>
                                          <td>
                                            {f.context || (
                                              <span className="muted">—</span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </>
                              )}

                              {detail.missingDependencies.length === 0 &&
                                detail.failures.length === 0 &&
                                !detail.topErrorText && (
                                  <div className="muted">
                                    No issues recorded in the import log.
                                  </div>
                                )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
