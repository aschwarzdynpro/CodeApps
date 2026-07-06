import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ConnRefRow,
  EnvConfigColumn,
  EnvConfigResult,
  EnvVarRow,
} from '../types/envConfig'
import type { WorkingSolution } from '../types/solution'
import { envConfigService } from '../services/envConfigService'
import { SolutionSelect } from './SolutionSelect'

/**
 * Environment Variable & Connection Reference cockpit — every configured
 * environment's config side by side, matched by import-stable name, with the
 * classic deployment gaps flagged:
 *
 * - env var present but without a value (and no default) in an environment,
 * - connection reference not bound to a connection,
 * - a setting that exists in one environment but is missing from another.
 *
 * Read-only; all environments are read through the connector. The result is
 * kept in a session-scoped cache so switching to this tab does NOT re-fetch —
 * only the Refresh button and changing the release-solution filter do. Once
 * loaded, the picture is filtered client-side (name search, counter chips, two
 * collapsible sections, sorted by display name). A release-solution filter is
 * server-side: only that solution's components (resolved in the host) are read.
 */

interface Props {
  /** All working solutions — the release ones drive the solution filter. */
  solutions: WorkingSolution[]
}

/**
 * Session cache: survives tab navigation (module scope), resets on reload.
 * Holds the last loaded picture AND the release filter it was loaded with, so
 * a remount restores exactly what the user last saw.
 */
let sessionCache: {
  releaseId: string
  result: EnvConfigResult
  loadedAt: Date
} | null = null

/**
 * Host-env connection-reference → cloud-flow-usage count, cached for the
 * session (independent of the release filter and the compared environments).
 * `inflight` dedupes concurrent loads.
 */
let flowUsageCache: Record<string, number> | null = null
let flowUsageInflight: Promise<Record<string, number>> | null = null

/** Which counter chip is currently narrowing the tables. */
type Filter = 'missing' | 'unbound' | 'gaps' | null

/** A row has a value missing in at least one environment it exists in. */
function envHasMissing(row: EnvVarRow, cols: EnvConfigColumn[]): boolean {
  return cols.some((c) => {
    const cell = row.cells[c.key]
    return cell.present && !cell.hasValue
  })
}

/** A row exists in one environment but is absent from another (transport gap). */
function envHasGap(row: EnvVarRow, cols: EnvConfigColumn[]): boolean {
  const cells = cols.map((c) => row.cells[c.key])
  return cells.some((c) => c.present) && cells.some((c) => !c.present)
}

function connUnbound(row: ConnRefRow, cols: EnvConfigColumn[]): boolean {
  return cols.some((c) => {
    const cell = row.cells[c.key]
    return cell.present && !cell.bound
  })
}

function connHasGap(row: ConnRefRow, cols: EnvConfigColumn[]): boolean {
  const cells = cols.map((c) => row.cells[c.key])
  return cells.some((c) => c.present) && cells.some((c) => !c.present)
}

const byDisplayName = <T extends { displayName: string }>(a: T, b: T) =>
  a.displayName.localeCompare(b.displayName)

export function EnvConfigWorkspace({ solutions }: Props) {
  const [result, setResult] = useState<EnvConfigResult | null>(
    sessionCache?.result ?? null,
  )
  const [loadedAt, setLoadedAt] = useState<Date | null>(
    sessionCache?.loadedAt ?? null,
  )
  const [releaseId, setReleaseId] = useState<string>(
    sessionCache?.releaseId ?? '',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>(null)
  const [openEnv, setOpenEnv] = useState(false)
  const [openConn, setOpenConn] = useState(false)

  // Connection-reference → host-env cloud-flow-usage count (lazy, cached).
  const [flowUsage, setFlowUsage] = useState<Record<string, number> | null>(
    flowUsageCache,
  )
  const [flowUsageLoading, setFlowUsageLoading] = useState(false)
  const [flowUsageError, setFlowUsageError] = useState<string | null>(null)

  const loadFlowUsage = useCallback(async () => {
    if (flowUsageCache) {
      setFlowUsage(flowUsageCache)
      return
    }
    setFlowUsageLoading(true)
    setFlowUsageError(null)
    try {
      flowUsageInflight ??= envConfigService.countConnectionReferenceUsage()
      const usage = await flowUsageInflight
      flowUsageCache = usage
      setFlowUsage(usage)
    } catch (err) {
      flowUsageInflight = null
      setFlowUsageError(err instanceof Error ? err.message : String(err))
    } finally {
      setFlowUsageLoading(false)
    }
  }, [])

  // Count flow usage the first time the Connection References section is shown
  // (the scan reads every flow's clientdata — not worth it until it's looked
  // at). Deferred via a timeout so it isn't a synchronous setState in the effect.
  useEffect(() => {
    if (!openConn || flowUsage) return
    const t = window.setTimeout(() => void loadFlowUsage(), 0)
    return () => window.clearTimeout(t)
  }, [openConn, flowUsage, loadFlowUsage])

  // Release solutions (deployment kind, real record) drive the solution filter.
  const releases = solutions.filter(
    (s, index) =>
      s.kind === 'deployment' &&
      !s.solutionMissing &&
      !!s.recordId &&
      solutions.findIndex((o) => o.id === s.id) === index,
  )

  const load = useCallback(
    async (relId: string) => {
      setLoading(true)
      setError(null)
      try {
        const rel = relId ? releases.find((r) => r.id === relId) : null
        const res = await envConfigService.loadEnvConfig(
          (done, total, label) =>
            setProgress(`Reading ${label} (${done}/${total})…`),
          rel ? { solutionUniqueName: rel.uniqueName } : undefined,
        )
        const now = new Date()
        setResult(res)
        setLoadedAt(now)
        sessionCache = { releaseId: relId, result: res, loadedAt: now }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
        setProgress(null)
      }
    },
    [releases],
  )

  // Fetch on first mount ONLY when the session cache is empty — later visits
  // reuse the cached picture. Refresh and a release change re-fetch explicitly.
  useEffect(() => {
    if (sessionCache) return
    const t = window.setTimeout(() => void load(''), 30)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onReleaseChange = (id: string) => {
    setReleaseId(id)
    void load(id)
  }

  // Row-based counts so that clicking a chip surfaces exactly that many rows.
  const stats = useMemo(() => {
    if (!result) return null
    const cols = result.columns
    const missing = result.envVars.filter((r) => envHasMissing(r, cols)).length
    const unbound = result.connRefs.filter((r) => connUnbound(r, cols)).length
    const gaps =
      result.envVars.filter((r) => envHasGap(r, cols)).length +
      result.connRefs.filter((r) => connHasGap(r, cols)).length
    return { missing, unbound, gaps }
  }, [result])

  const q = search.trim().toLowerCase()

  const envRows = useMemo(() => {
    if (!result) return []
    const cols = result.columns
    return result.envVars
      .filter(
        (r) =>
          !q ||
          r.displayName.toLowerCase().includes(q) ||
          r.schemaName.toLowerCase().includes(q),
      )
      .filter((r) =>
        filter === null
          ? true
          : filter === 'missing'
            ? envHasMissing(r, cols)
            : filter === 'gaps'
              ? envHasGap(r, cols)
              : false,
      )
      .sort(byDisplayName)
  }, [result, q, filter])

  const connRows = useMemo(() => {
    if (!result) return []
    const cols = result.columns
    return result.connRefs
      .filter(
        (r) =>
          !q ||
          r.displayName.toLowerCase().includes(q) ||
          r.logicalName.toLowerCase().includes(q) ||
          r.connectorName.toLowerCase().includes(q),
      )
      .filter((r) =>
        filter === null
          ? true
          : filter === 'unbound'
            ? connUnbound(r, cols)
            : filter === 'gaps'
              ? connHasGap(r, cols)
              : false,
      )
      .sort(byDisplayName)
  }, [result, q, filter])

  const narrowing = q !== '' || filter !== null

  const onSearch = (v: string) => {
    setSearch(v)
    if (v.trim()) {
      setOpenEnv(true)
      setOpenConn(true)
    }
  }

  // A chip toggles its filter; activating it opens the section(s) it targets.
  const toggleFilter = (f: Exclude<Filter, null>) => {
    const next = filter === f ? null : f
    setFilter(next)
    if (next === 'missing') setOpenEnv(true)
    else if (next === 'unbound') setOpenConn(true)
    else if (next === 'gaps') {
      setOpenEnv(true)
      setOpenConn(true)
    }
  }

  const chip = (
    kind: Exclude<Filter, null>,
    count: number,
    label: string,
    tone: 'bad' | 'warn',
  ) => (
    <button
      type="button"
      className={`envcfg-pill envcfg-pill--btn ${
        count > 0 ? `envcfg-pill--${tone}` : 'envcfg-pill--ok'
      } ${filter === kind ? 'is-active' : ''}`}
      disabled={count === 0}
      aria-pressed={filter === kind}
      onClick={() => toggleFilter(kind)}
      title={count === 0 ? 'Nothing to filter' : `Show only these ${label}`}
    >
      {count} {label}
    </button>
  )

  return (
    <div>
      <div className="card trace-toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search variables & references…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <SolutionSelect
          options={releases}
          value={releaseId}
          onChange={onReleaseChange}
          placeholder="All solutions"
        />
        <span className="trace-toolbar-right">
          <span className="muted">
            {result?.columns.length ?? 0} environment
            {result?.columns.length === 1 ? '' : 's'}
          </span>
          {loadedAt && (
            <span className="muted" title={loadedAt.toLocaleString()}>
              Updated{' '}
              {loadedAt.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          <button
            className="btn btn--small"
            onClick={() => void load(releaseId)}
            disabled={loading}
          >
            {loading ? 'Reading…' : '⟳ Refresh'}
          </button>
        </span>
      </div>

      {releaseId && (
        <div className="muted jobs-sample-note">
          Filtered to the environment variables &amp; connection references that
          are components of the selected release solution (matched in the host
          environment).
        </div>
      )}

      {progress && (
        <div className="sharing-progress" aria-live="polite">
          <span className="sharing-progress-spinner" />
          <span className="sharing-progress-text">{progress}</span>
        </div>
      )}
      {error && <div className="state state--error">{error}</div>}

      {result && (
        <>
          {result.errors.length > 0 && (
            <div className="state state--error">
              Some environments could not be read:
              <ul className="merge-errors">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {stats && (
            <div className="envcfg-summary">
              {chip(
                'missing',
                stats.missing,
                `env var${stats.missing === 1 ? '' : 's'} without a value`,
                'bad',
              )}
              {chip(
                'unbound',
                stats.unbound,
                `unbound connection reference${stats.unbound === 1 ? '' : 's'}`,
                'bad',
              )}
              {chip(
                'gaps',
                stats.gaps,
                `transport gap${stats.gaps === 1 ? '' : 's'}`,
                'warn',
              )}
              {filter && (
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => setFilter(null)}
                >
                  Clear filter
                </button>
              )}
            </div>
          )}

          <div className="card trace-list">
            <button
              type="button"
              className="envcfg-section-head"
              aria-expanded={openEnv}
              onClick={() => setOpenEnv((o) => !o)}
            >
              <span className="envcfg-caret">{openEnv ? '▾' : '▸'}</span>
              <strong>Environment Variables</strong>
              <span className="muted">
                {narrowing
                  ? `${envRows.length} of ${result.envVars.length}`
                  : result.envVars.length}
              </span>
            </button>
            {openEnv &&
              (result.envVars.length === 0 ? (
                <div className="state">No environment variables found.</div>
              ) : envRows.length === 0 ? (
                <div className="state">No variables match the filter.</div>
              ) : (
                <table className="ops-table envcfg-table">
                  <thead>
                    <tr>
                      <th>Variable</th>
                      <th>Type</th>
                      {result.columns.map((c) => (
                        <th key={c.key}>
                          {c.label}
                          {c.isCurrent ? ' · host' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {envRows.map((row) => (
                      <tr key={row.schemaName}>
                        <td>
                          <div className="envcfg-name">{row.displayName}</div>
                          <div className="envcfg-schema">{row.schemaName}</div>
                        </td>
                        <td className="nowrap">{row.typeLabel}</td>
                        {result.columns.map((c) => {
                          const cell = row.cells[c.key]
                          if (!cell.present)
                            return (
                              <td
                                key={c.key}
                                className="envcfg-cell envcfg-cell--gap"
                              >
                                <span title="Not present in this environment">
                                  — absent
                                </span>
                              </td>
                            )
                          if (!cell.hasValue)
                            return (
                              <td
                                key={c.key}
                                className="envcfg-cell envcfg-cell--bad"
                              >
                                <span title="No value and no default — the app has nothing to read">
                                  ✗ no value
                                </span>
                              </td>
                            )
                          return (
                            <td key={c.key} className="envcfg-cell">
                              <span className="envcfg-value" title={cell.value}>
                                {cell.value || '(empty)'}
                              </span>
                              {cell.usingDefault && (
                                <span
                                  className="envcfg-tag"
                                  title="Falling back to the default value"
                                >
                                  default
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
          </div>

          <div className="card trace-list">
            <button
              type="button"
              className="envcfg-section-head"
              aria-expanded={openConn}
              onClick={() => setOpenConn((o) => !o)}
            >
              <span className="envcfg-caret">{openConn ? '▾' : '▸'}</span>
              <strong>Connection References</strong>
              <span className="muted">
                {narrowing
                  ? `${connRows.length} of ${result.connRefs.length}`
                  : result.connRefs.length}
              </span>
            </button>
            {openConn && (
              <>
                {flowUsageLoading && !flowUsage && (
                  <div className="muted jobs-sample-note">
                    Counting cloud-flow usage in the host environment…
                  </div>
                )}
                {flowUsageError && !flowUsage && (
                  <div className="muted jobs-sample-note">
                    Flow usage unavailable: {flowUsageError}
                  </div>
                )}
                {result.connRefs.length === 0 ? (
                <div className="state">No connection references found.</div>
              ) : connRows.length === 0 ? (
                <div className="state">No references match the filter.</div>
              ) : (
                <table className="ops-table envcfg-table">
                  <thead>
                    <tr>
                      <th>Connection reference</th>
                      <th>Connector</th>
                      {result.columns.map((c) => (
                        <th key={c.key}>
                          {c.label}
                          {c.isCurrent ? ' · host' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {connRows.map((row) => (
                      <tr key={row.logicalName}>
                        <td>
                          <div className="envcfg-name">{row.displayName}</div>
                          <div className="envcfg-schema">{row.logicalName}</div>
                          {flowUsage && (
                            <span
                              className={`envcfg-usage-chip ${(flowUsage[row.logicalName] ?? 0) === 0 ? 'envcfg-usage-chip--zero' : ''}`}
                              title="Cloud flows in the host environment that use this connection reference"
                            >
                              {flowUsage[row.logicalName] ?? 0} flow
                              {(flowUsage[row.logicalName] ?? 0) === 1 ? '' : 's'}
                            </span>
                          )}
                        </td>
                        <td className="trace-type">{row.connectorName}</td>
                        {result.columns.map((c) => {
                          const cell = row.cells[c.key]
                          if (!cell.present)
                            return (
                              <td
                                key={c.key}
                                className="envcfg-cell envcfg-cell--gap"
                              >
                                — absent
                              </td>
                            )
                          return (
                            <td
                              key={c.key}
                              className={`envcfg-cell ${cell.bound ? '' : 'envcfg-cell--bad'}`}
                            >
                              {cell.bound ? '✓ bound' : '✗ unbound'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
