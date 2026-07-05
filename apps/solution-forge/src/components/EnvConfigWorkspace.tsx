import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EnvConfigResult } from '../types/envConfig'
import { envConfigService } from '../services/envConfigService'

/**
 * Environment Variable & Connection Reference cockpit — every configured
 * environment's config side by side, matched by import-stable name, with the
 * classic deployment gaps flagged:
 *
 * - env var present but without a value (and no default) in an environment,
 * - connection reference not bound to a connection,
 * - a setting that exists in one environment but is missing from another
 *   (a transport gap).
 *
 * Read-only; all environments are read through the connector.
 */
export function EnvConfigWorkspace() {
  const [result, setResult] = useState<EnvConfigResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await envConfigService.loadEnvConfig((done, total, label) =>
        setProgress(`Reading ${label} (${done}/${total})…`),
      )
      setResult(res)
      setLoadedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 30)
    return () => window.clearTimeout(t)
  }, [load])

  const stats = useMemo(() => {
    if (!result) return null
    let missingValues = 0
    let unbound = 0
    let gaps = 0
    for (const row of result.envVars) {
      const cells = result.columns.map((c) => row.cells[c.key])
      const anyPresent = cells.some((c) => c.present)
      for (const c of cells) {
        if (c.present && !c.hasValue) missingValues++
        if (anyPresent && !c.present) gaps++
      }
    }
    for (const row of result.connRefs) {
      const cells = result.columns.map((c) => row.cells[c.key])
      const anyPresent = cells.some((c) => c.present)
      for (const c of cells) {
        if (c.present && !c.bound) unbound++
        if (anyPresent && !c.present) gaps++
      }
    }
    return { missingValues, unbound, gaps }
  }, [result])

  return (
    <div>
      <div className="card trace-toolbar">
        <span className="muted">
          Environment variables &amp; connection references across{' '}
          {result?.columns.length ?? 0} configured environment
          {result?.columns.length === 1 ? '' : 's'}, matched by name.
        </span>
        <span className="trace-toolbar-right">
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
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? 'Reading…' : '⟳ Refresh'}
          </button>
        </span>
      </div>

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
              <span
                className={`envcfg-pill ${stats.missingValues > 0 ? 'envcfg-pill--bad' : 'envcfg-pill--ok'}`}
              >
                {stats.missingValues} env var value
                {stats.missingValues === 1 ? '' : 's'} missing
              </span>
              <span
                className={`envcfg-pill ${stats.unbound > 0 ? 'envcfg-pill--bad' : 'envcfg-pill--ok'}`}
              >
                {stats.unbound} connection reference
                {stats.unbound === 1 ? '' : 's'} unbound
              </span>
              <span
                className={`envcfg-pill ${stats.gaps > 0 ? 'envcfg-pill--warn' : 'envcfg-pill--ok'}`}
              >
                {stats.gaps} transport gap{stats.gaps === 1 ? '' : 's'}
              </span>
            </div>
          )}

          <div className="card trace-list">
            <div className="jobs-flows-head">
              <strong>Environment Variables ({result.envVars.length})</strong>
            </div>
            {result.envVars.length === 0 ? (
              <div className="state">No environment variables found.</div>
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
                  {result.envVars.map((row) => (
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
                            <td key={c.key} className="envcfg-cell envcfg-cell--gap">
                              <span title="Not present in this environment">— absent</span>
                            </td>
                          )
                        if (!cell.hasValue)
                          return (
                            <td key={c.key} className="envcfg-cell envcfg-cell--bad">
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
                              <span className="envcfg-tag" title="Falling back to the default value">
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
            )}
          </div>

          <div className="card trace-list">
            <div className="jobs-flows-head">
              <strong>Connection References ({result.connRefs.length})</strong>
            </div>
            {result.connRefs.length === 0 ? (
              <div className="state">No connection references found.</div>
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
                  {result.connRefs.map((row) => (
                    <tr key={row.logicalName}>
                      <td>
                        <div className="envcfg-name">{row.displayName}</div>
                        <div className="envcfg-schema">{row.logicalName}</div>
                      </td>
                      <td className="trace-type">{row.connectorName}</td>
                      {result.columns.map((c) => {
                        const cell = row.cells[c.key]
                        if (!cell.present)
                          return (
                            <td key={c.key} className="envcfg-cell envcfg-cell--gap">
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
          </div>
        </>
      )}
    </div>
  )
}
