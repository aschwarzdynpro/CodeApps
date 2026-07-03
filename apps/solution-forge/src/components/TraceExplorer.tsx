import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type {
  PluginTraceDetail,
  PluginTraceSummary,
  TraceFilter,
  TraceLevelInfo,
  TraceModeFilter,
  TracePerfBucket,
} from '../types/traces'
import {
  TRACE_LEVELS,
  TRACE_TEXT_SEARCH_MAX_HOURS,
  TRACE_WINDOWS,
} from '../types/traces'
import { traceService } from '../services/traceService'

/**
 * Plugin Trace Explorer — a usable frontend over `plugintracelog`:
 *
 * - Stream: polling list (15 s, paused while the tab is hidden) with
 *   server-side filters; rows expand into the lazily-loaded message block.
 * - Correlation timeline: every trace of one correlationid as an indented
 *   cascade (depth) with duration bars.
 * - Performance: server-side duration aggregates per plugin × message;
 *   clicking a bucket jumps back to the pre-filtered stream.
 * - Trace level: shows and (deployment managers only) switches
 *   `organization.plugintracelogsetting`.
 */

const POLL_MS = 15_000

interface Props {
  /** Deployment managers may switch the org-wide trace level. */
  canManageTraceLevel: boolean
}

type SubTab = 'stream' | 'performance'

function fmtTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString([], { month: '2-digit', day: '2-digit' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

function fmtMs(ms: number): string {
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.round(ms)} ms`
}

/** Render `text` with every occurrence of `needle` wrapped in <mark>. */
function highlight(text: string, needle: string) {
  const q = needle.trim()
  if (!q) return text
  const parts: (string | { m: string })[] = []
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  let index = 0
  for (;;) {
    const at = lower.indexOf(ql, index)
    if (at < 0) break
    if (at > index) parts.push(text.slice(index, at))
    parts.push({ m: text.slice(at, at + q.length) })
    index = at + q.length
  }
  parts.push(text.slice(index))
  return parts.map((p, i) =>
    typeof p === 'string' ? p : <mark key={i}>{p.m}</mark>,
  )
}

/** Lazily-loaded detail body of one trace (message block + exception). */
function TraceDetailPane({ id }: { id: string }) {
  const [detail, setDetail] = useState<PluginTraceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    traceService
      .getTraceDetail(id)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) return <div className="state state--error">{error}</div>
  if (!detail) return <div className="state">Loading trace payload…</div>

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="trace-detail">
      <div className="trace-detail-toolbar">
        <input
          className="search trace-detail-search"
          type="search"
          placeholder="Find in message block…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="btn btn--small"
          onClick={() =>
            copy(
              detail.messageBlock +
                (detail.exceptionDetails
                  ? `\n\n--- EXCEPTION ---\n${detail.exceptionDetails}`
                  : ''),
            )
          }
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      {detail.exceptionDetails && (
        <div className="trace-block trace-block--exception">
          <div className="trace-block-title">Exception details</div>
          <pre>{highlight(detail.exceptionDetails, search)}</pre>
        </div>
      )}
      <div className="trace-block">
        <div className="trace-block-title">Message block</div>
        <pre>
          {detail.messageBlock
            ? highlight(detail.messageBlock, search)
            : '(empty)'}
        </pre>
      </div>
    </div>
  )
}

/** Correlation timeline overlay: the whole request chain of one trace. */
function CorrelationOverlay({
  correlationId,
  onClose,
}: {
  correlationId: string
  onClose: () => void
}) {
  const [rows, setRows] = useState<PluginTraceSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    traceService
      .listCorrelation(correlationId)
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [correlationId])

  const maxMs = Math.max(1, ...(rows ?? []).map((r) => r.durationMs))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card modal--wide trace-correlation"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>
            Correlation timeline{' '}
            <code className="trace-correlation-id">{correlationId}</code>
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {error && <div className="state state--error">{error}</div>}
        {!rows && !error && <div className="state">Loading chain…</div>}
        {rows && rows.length === 0 && (
          <div className="state">No traces found for this correlation id.</div>
        )}
        {rows && rows.length > 0 && (
          <div className="trace-timeline">
            {rows.map((r) => (
              <div key={r.id}>
                <button
                  className={`trace-timeline-row ${r.hasException ? 'trace-timeline-row--error' : ''} ${openId === r.id ? 'trace-timeline-row--open' : ''}`}
                  style={{ paddingLeft: `${(Math.max(1, r.depth) - 1) * 26 + 8}px` }}
                  onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  title="Show message block"
                >
                  <span className="trace-timeline-depth">d{r.depth}</span>
                  <span className="trace-timeline-name">
                    {r.hasException && <span className="trace-ex">⚠ </span>}
                    {r.typeName}
                  </span>
                  <span className="muted">
                    {r.messageName}
                    {r.primaryEntity ? ` · ${r.primaryEntity}` : ''}
                  </span>
                  <span className="trace-timeline-bar-wrap">
                    <span
                      className="trace-timeline-bar"
                      style={{
                        width: `${Math.max(2, (r.durationMs / maxMs) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="trace-timeline-ms num">{fmtMs(r.durationMs)}</span>
                </button>
                {openId === r.id && <TraceDetailPane id={r.id} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function TraceExplorer({ canManageTraceLevel }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('stream')

  // --- filters ---------------------------------------------------------
  const [hours, setHours] = useState<number>(24)
  const [typeName, setTypeName] = useState('')
  const [messageName, setMessageName] = useState('')
  const [primaryEntity, setPrimaryEntity] = useState('')
  const [modeFilter, setModeFilter] = useState<TraceModeFilter>('all')
  const [exceptionsOnly, setExceptionsOnly] = useState(false)
  const [textSearchOn, setTextSearchOn] = useState(false)
  const [messageText, setMessageText] = useState('')

  // --- stream state ----------------------------------------------------
  const [traces, setTraces] = useState<PluginTraceSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [correlationId, setCorrelationId] = useState<string | null>(null)

  // --- performance state -------------------------------------------------
  const [buckets, setBuckets] = useState<TracePerfBucket[] | null>(null)
  const [perfLoading, setPerfLoading] = useState(false)
  const [perfError, setPerfError] = useState<string | null>(null)

  // --- trace level -------------------------------------------------------
  const [level, setLevel] = useState<TraceLevelInfo | null>(null)
  const [levelSaving, setLevelSaving] = useState(false)
  const [levelError, setLevelError] = useState<string | null>(null)

  const filter: TraceFilter = useMemo(
    () => ({
      hours,
      typeName,
      messageName,
      primaryEntity,
      mode: modeFilter,
      exceptionsOnly,
      messageText: textSearchOn ? messageText : undefined,
    }),
    [
      hours,
      typeName,
      messageName,
      primaryEntity,
      modeFilter,
      exceptionsOnly,
      textSearchOn,
      messageText,
    ],
  )
  const load = useCallback(async (f: TraceFilter, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const rows = await traceService.listTraces(f)
      setTraces(rows)
      setError(null)
      setLoadedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Initial + filter-driven load (debounced so typing doesn't spam queries).
  useEffect(() => {
    const t = window.setTimeout(() => void load(filter), 350)
    return () => window.clearTimeout(t)
  }, [filter, load])

  // Poll every 15 s while auto-refresh is on and the browser tab is visible.
  useEffect(() => {
    if (!autoRefresh || subTab !== 'stream') return
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(filter, true)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [autoRefresh, subTab, filter, load])

  // Trace level, read once.
  useEffect(() => {
    let cancelled = false
    traceService
      .getTraceLevel()
      .then((info) => {
        if (!cancelled) setLevel(info)
      })
      .catch((err) => {
        if (!cancelled)
          setLevelError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadPerf = useCallback(async (h: number) => {
    setPerfLoading(true)
    setPerfError(null)
    try {
      setBuckets(await traceService.getPerfBuckets(h))
    } catch (err) {
      setPerfError(err instanceof Error ? err.message : String(err))
    } finally {
      setPerfLoading(false)
    }
  }, [])

  useEffect(() => {
    if (subTab !== 'performance') return
    const t = window.setTimeout(() => void loadPerf(hours), 100)
    return () => window.clearTimeout(t)
  }, [subTab, hours, loadPerf])

  const switchLevel = async (next: number) => {
    if (!level) return
    const target = TRACE_LEVELS.find((l) => l.value === next)
    if (!target || target.value === level.level) return
    if (
      target.value === 2 &&
      !window.confirm(
        'Set the trace level to "All"? Every plugin execution will be logged — the plugintracelog table can grow quickly. Remember to switch back.',
      )
    )
      return
    setLevelSaving(true)
    setLevelError(null)
    try {
      await traceService.setTraceLevel(level.organizationId, target.value)
      setLevel({ ...level, level: target.value })
    } catch (err) {
      setLevelError(err instanceof Error ? err.message : String(err))
    } finally {
      setLevelSaving(false)
    }
  }

  /** Jump from a perf bucket back into the pre-filtered stream. */
  const openBucketInStream = (bucket: TracePerfBucket) => {
    setTypeName(bucket.typeName)
    setMessageName(bucket.messageName)
    setSubTab('stream')
  }

  const textSearchBlocked = textSearchOn && hours > TRACE_TEXT_SEARCH_MAX_HOURS

  return (
    <div>
      <nav className="subtabs">
        <button
          className={`subtab ${subTab === 'stream' ? 'subtab--active' : ''}`}
          onClick={() => setSubTab('stream')}
        >
          Trace stream
        </button>
        <button
          className={`subtab ${subTab === 'performance' ? 'subtab--active' : ''}`}
          onClick={() => setSubTab('performance')}
        >
          Performance
        </button>
        <span className="trace-level-control">
          {levelError && <span className="trace-level-error">{levelError}</span>}
          <span className="muted">Trace level:</span>
          {level ? (
            <select
              value={level.level}
              disabled={!canManageTraceLevel || levelSaving}
              title={
                canManageTraceLevel
                  ? 'organization.plugintracelogsetting — "All" grows the log quickly.'
                  : 'Switching the trace level requires the deployment-manager role (and the org update privilege).'
              }
              onChange={(e) => void switchLevel(Number(e.target.value))}
            >
              {TRACE_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="muted">…</span>
          )}
        </span>
      </nav>

      <div className="state trace-hint">
        ℹ The platform prunes plugin trace logs after ~24 h — this is an
        explorer, not an archive.
      </div>

      <div className="card trace-toolbar">
        <label>
          Window
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            {TRACE_WINDOWS.map((h) => (
              <option key={h} value={h}>
                {h <= 24 ? `${h} h` : `${h / 24} d`}
              </option>
            ))}
          </select>
        </label>
        <input
          className="search"
          type="search"
          placeholder="Plugin type…"
          value={typeName}
          onChange={(e) => setTypeName(e.target.value)}
        />
        <input
          className="search"
          type="search"
          placeholder="Message (Create, Update…)"
          value={messageName}
          onChange={(e) => setMessageName(e.target.value)}
        />
        <input
          className="search"
          type="search"
          placeholder="Entity…"
          value={primaryEntity}
          onChange={(e) => setPrimaryEntity(e.target.value)}
        />
        <select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value as TraceModeFilter)}
        >
          <option value="all">sync + async</option>
          <option value="sync">sync only</option>
          <option value="async">async only</option>
        </select>
        <label className="trace-check">
          <input
            type="checkbox"
            checked={exceptionsOnly}
            onChange={(e) => setExceptionsOnly(e.target.checked)}
          />
          exceptions only
        </label>
        <label
          className="trace-check"
          title={`Full-text search inside the message block — expensive, limited to a ${TRACE_TEXT_SEARCH_MAX_HOURS} h window.`}
        >
          <input
            type="checkbox"
            checked={textSearchOn}
            onChange={(e) => setTextSearchOn(e.target.checked)}
          />
          message text
        </label>
        {textSearchOn && (
          <input
            className="search"
            type="search"
            placeholder="Search in message block…"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
          />
        )}
        <span className="trace-toolbar-right">
          {loadedAt && (
            <span className="muted" title={loadedAt.toLocaleString()}>
              Updated{' '}
              {loadedAt.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          )}
          <label className="trace-check" title="Poll every 15 s (paused while this browser tab is hidden).">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            auto-refresh
          </label>
          <button
            className="btn btn--small"
            onClick={() => void load(filter)}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : '⟳ Refresh'}
          </button>
        </span>
      </div>

      {textSearchBlocked && (
        <div className="state state--error">
          Message-text search is limited to a {TRACE_TEXT_SEARCH_MAX_HOURS} h
          window — pick a shorter look-back.
        </div>
      )}

      {subTab === 'stream' && (
        <>
          {error && <div className="state state--error">{error}</div>}
          {!traces && !error && <div className="state">Loading traces…</div>}
          {traces && traces.length === 0 && (
            <div className="state">
              No traces in the selected window. Check the trace level (top
              right) — with “Off” nothing is logged.
            </div>
          )}
          {traces && traces.length > 0 && (
            <div className="card trace-list">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Plugin type</th>
                    <th>Message</th>
                    <th>Entity</th>
                    <th>Mode</th>
                    <th className="num">Depth</th>
                    <th className="num">Duration</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {traces.map((t) => (
                    <Fragment key={t.id}>
                      <tr
                        className={`ops-row ${t.hasException ? 'ops-row--error' : ''} ${expandedId === t.id ? 'ops-row--open' : ''}`}
                        onClick={() =>
                          setExpandedId(expandedId === t.id ? null : t.id)
                        }
                      >
                        <td className="nowrap">{fmtTime(t.createdOn)}</td>
                        <td className="trace-type" title={t.typeName}>
                          {t.hasException && <span className="trace-ex">⚠ </span>}
                          {t.typeName}
                        </td>
                        <td>{t.messageName}</td>
                        <td>{t.primaryEntity || <span className="muted">—</span>}</td>
                        <td>
                          <span className={`chip chip--static ${t.mode === 1 ? 'chip-async' : ''}`}>
                            {t.mode === 1 ? 'async' : 'sync'}
                          </span>
                        </td>
                        <td className="num">{t.depth}</td>
                        <td className="num nowrap">{fmtMs(t.durationMs)}</td>
                        <td className="nowrap">
                          <button
                            className="btn btn--small"
                            title="Show the whole request chain (same correlation id) as a timeline."
                            onClick={(e) => {
                              e.stopPropagation()
                              setCorrelationId(t.correlationId)
                            }}
                            disabled={!t.correlationId}
                          >
                            ⛓ Chain
                          </button>
                        </td>
                      </tr>
                      {expandedId === t.id && (
                        <tr className="ops-detail-row">
                          <td colSpan={8}>
                            <TraceDetailPane id={t.id} />
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

      {subTab === 'performance' && (
        <>
          {perfError && <div className="state state--error">{perfError}</div>}
          {perfLoading && <div className="state">Aggregating…</div>}
          {!perfLoading && buckets && buckets.length === 0 && (
            <div className="state">No traces in the selected window.</div>
          )}
          {!perfLoading && buckets && buckets.length > 0 && (
            <div className="card trace-list">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Plugin type</th>
                    <th>Message</th>
                    <th className="num">Count</th>
                    <th className="num">Avg</th>
                    <th className="num" title="Approximated — FetchXML aggregates have no percentile.">
                      p95 ≈
                    </th>
                    <th className="num">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr
                      key={`${b.typeName}|${b.messageName}`}
                      className="ops-row"
                      title="Open the pre-filtered trace stream"
                      onClick={() => openBucketInStream(b)}
                    >
                      <td className="trace-type">{b.typeName}</td>
                      <td>{b.messageName}</td>
                      <td className="num">{b.count}</td>
                      <td className="num nowrap">{fmtMs(b.avgMs)}</td>
                      <td className="num nowrap">{fmtMs(b.p95Ms)}</td>
                      <td className="num nowrap">{fmtMs(b.maxMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {correlationId && (
        <CorrelationOverlay
          correlationId={correlationId}
          onClose={() => setCorrelationId(null)}
        />
      )}
    </div>
  )
}
