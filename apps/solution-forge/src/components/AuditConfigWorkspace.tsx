import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AuditColumnInfo,
  AuditConfigResult,
  AuditTableInfo,
} from '../types/auditConfig'
import { auditConfigService } from '../services/auditConfigService'
import { describeTableAudit, formatRetention } from '../utils/auditConfig'
import { OperateEnvPicker } from './OperateEnvPicker'

/**
 * Audit Configuration Analyzer — the auditing setup of the selected
 * environment: the org master switch + retention, and per-table / per-column
 * `IsAuditEnabled`. A table only actually records history when org auditing
 * AND the table are both on; the workspace flags "configured but off".
 *
 * Read-only. Columns are loaded lazily when a table is expanded.
 */
interface Props {
  envKey: string
  onEnvChange: (envKey: string) => void
}

export function AuditConfigWorkspace({ envKey, onEnvChange }: Props) {
  const [result, setResult] = useState<AuditConfigResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [auditedOnly, setAuditedOnly] = useState(true)

  // Lazily-loaded columns per expanded table.
  const [expanded, setExpanded] = useState<string | null>(null)
  const [columns, setColumns] = useState<Map<string, AuditColumnInfo[]>>(
    new Map(),
  )
  const [columnsLoading, setColumnsLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setResult(await auditConfigService.loadAuditConfig(envKey))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [envKey])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 30)
    return () => window.clearTimeout(t)
  }, [load])

  const toggleTable = (table: AuditTableInfo) => {
    if (expanded === table.logicalName) {
      setExpanded(null)
      return
    }
    setExpanded(table.logicalName)
    if (columns.has(table.logicalName)) return
    setColumnsLoading(true)
    auditConfigService
      .listAuditColumns(envKey, table.logicalName)
      .then((cols) =>
        setColumns((prev) => new Map(prev).set(table.logicalName, cols)),
      )
      .catch(() =>
        setColumns((prev) => new Map(prev).set(table.logicalName, [])),
      )
      .finally(() => setColumnsLoading(false))
  }

  const stats = useMemo(() => {
    if (!result) return null
    const audited = result.tables.filter((t) => t.auditEnabled).length
    return { audited, total: result.tables.length }
  }, [result])

  const filtered = useMemo(() => {
    if (!result) return []
    const q = search.trim().toLowerCase()
    return result.tables.filter(
      (t) =>
        (!auditedOnly || t.auditEnabled) &&
        (!q ||
          t.displayName.toLowerCase().includes(q) ||
          t.logicalName.toLowerCase().includes(q)),
    )
  }, [result, search, auditedOnly])

  return (
    <div>
      <OperateEnvPicker envKey={envKey} onChange={onEnvChange} />

      {error && <div className="state state--error">{error}</div>}
      {loading && !result && (
        <div className="state">Reading audit configuration…</div>
      )}

      {result && (
        <>
          <div
            className={`card audit-org ${result.org.auditingEnabled ? '' : 'audit-org--off'}`}
          >
            <div className="audit-org-main">
              <span className="audit-org-label">Organization auditing</span>
              <span
                className={`audit-badge ${result.org.auditingEnabled ? 'audit-badge--on' : 'audit-badge--off'}`}
              >
                {result.org.auditingEnabled ? '● Enabled' : '○ Disabled'}
              </span>
              <span className="muted">
                Retention: {formatRetention(result.org.retentionDays)}
              </span>
            </div>
            {!result.org.auditingEnabled && (
              <div className="audit-org-warn">
                ⚠ The org master switch is off — no audit history is recorded,
                regardless of the per-table settings below.
              </div>
            )}
          </div>

          <div className="card trace-toolbar">
            <input
              className="search"
              type="search"
              placeholder="Search tables…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="trace-check">
              <input
                type="checkbox"
                checked={auditedOnly}
                onChange={(e) => setAuditedOnly(e.target.checked)}
              />
              audited tables only
            </label>
            <span className="trace-toolbar-right">
              {stats && (
                <span className="muted">
                  {stats.audited} of {stats.total} tables audit-enabled
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

          {filtered.length === 0 ? (
            <div className="state">
              {auditedOnly
                ? 'No audit-enabled tables match the filter.'
                : 'No tables match the search.'}
            </div>
          ) : (
            <div className="card trace-list">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Logical name</th>
                    <th>Table auditing</th>
                    <th>Effective</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const state = describeTableAudit(result.org, t)
                    const isOpen = expanded === t.logicalName
                    const cols = columns.get(t.logicalName)
                    return (
                      <Fragment key={t.logicalName}>
                        <tr
                          className={`ops-row ${isOpen ? 'ops-row--open' : ''}`}
                          onClick={() => toggleTable(t)}
                        >
                          <td className="envcfg-name">{t.displayName}</td>
                          <td className="trace-type">{t.logicalName}</td>
                          <td>
                            <span
                              className={`audit-badge ${t.auditEnabled ? 'audit-badge--on' : 'audit-badge--off'}`}
                            >
                              {t.auditEnabled ? 'On' : 'Off'}
                            </span>
                          </td>
                          <td>
                            {state === 'effective' && (
                              <span className="audit-eff audit-eff--on">
                                ✓ auditing
                              </span>
                            )}
                            {state === 'configured-but-off' && (
                              <span className="audit-eff audit-eff--warn">
                                ⚠ no effect (org off)
                              </span>
                            )}
                            {state === 'not-audited' && (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="nowrap">
                            <button className="btn btn--small">
                              {isOpen ? 'Hide columns' : 'Columns'}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="ops-detail-row">
                            <td colSpan={5}>
                              {columnsLoading && !cols ? (
                                <div className="state">Loading columns…</div>
                              ) : !cols || cols.length === 0 ? (
                                <div className="muted">
                                  No columns reported for this table.
                                </div>
                              ) : (
                                <table className="ops-table audit-columns">
                                  <thead>
                                    <tr>
                                      <th>Column</th>
                                      <th>Logical name</th>
                                      <th>Audited</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cols.map((c) => (
                                      <tr key={c.logicalName}>
                                        <td>{c.displayName}</td>
                                        <td className="trace-type">
                                          {c.logicalName}
                                        </td>
                                        <td>
                                          <span
                                            className={`audit-badge ${c.auditEnabled ? 'audit-badge--on' : 'audit-badge--off'}`}
                                          >
                                            {c.auditEnabled ? 'On' : 'Off'}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {cols &&
                                cols.length > 0 &&
                                t.auditEnabled &&
                                !cols.some((c) => c.auditEnabled) && (
                                  <div className="muted audit-note">
                                    Table auditing is on but no column is
                                    flagged — only record create/delete and
                                    relationship changes are captured, not
                                    field-level history.
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
        </>
      )}
    </div>
  )
}
