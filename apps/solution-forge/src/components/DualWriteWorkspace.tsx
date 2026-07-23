import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DualWriteMapSummary } from '../types/dualWrite'
import { dualWriteService } from '../services/dualWriteService'
import {
  countFieldMappings,
  parseDualWriteMapping,
  syncDirectionInfo,
} from '../utils/dualWriteMapping'

/**
 * Dual-Write Table Maps cockpit — lists the custom (unmanaged)
 * `msdyn_dualwriteentitymap` records in the current environment (one row per
 * map name at its current version), and opens a mapping overlay on click that
 * renders the map's legs + field mappings from the `msdyn_mapping` JSON.
 *
 * Read-only. The list is kept in a session-scoped cache so switching tabs does
 * not re-read; the Refresh button and the "Updated …" time cover freshness.
 */

/** Session cache: survives tab navigation (module scope), resets on reload. */
let sessionCache: { maps: DualWriteMapSummary[]; loadedAt: Date } | null = null

function fmtDateTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

/** Overlay that lazy-loads and renders one map's mapping definition. */
function DualWriteMappingModal({
  map,
  onClose,
}: {
  map: DualWriteMapSummary
  onClose: () => void
}) {
  const [raw, setRaw] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [hideSystem, setHideSystem] = useState(false)
  const [fieldSearch, setFieldSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    dualWriteService
      .getMapping(map.id)
      .then((m) => {
        if (!cancelled) setRaw(m)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [map.id])

  const detail = useMemo(
    () => (raw !== null ? parseDualWriteMapping(raw) : null),
    [raw],
  )
  const totalFields = detail ? countFieldMappings(detail) : 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card modal--wide dw-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="dw-modal-title">{map.name}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="dw-modal-body">
          <div className="dw-modal-meta">
            <span className="dw-badge">v{map.version}</span>
            {detail && !detail.unparsed && (
              <span className="dw-badge dw-badge--env">
                {detail.leftEnvironmentType} ↔ {detail.centerEnvironmentType}
              </span>
            )}
            {detail && !detail.unparsed && (
              <span className="muted">
                {detail.legs.length} leg{detail.legs.length === 1 ? '' : 's'} ·{' '}
                {totalFields} field mapping{totalFields === 1 ? '' : 's'}
              </span>
            )}
            <span className="dw-modal-actions">
              <input
                className="dw-field-search"
                type="search"
                placeholder="Search fields…"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
              />
              <label className="dw-check">
                <input
                  type="checkbox"
                  checked={hideSystem}
                  onChange={(e) => setHideSystem(e.target.checked)}
                />
                Hide system-generated
              </label>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => setShowRaw((s) => !s)}
                disabled={raw === null}
              >
                {showRaw ? 'Formatted view' : 'Show raw JSON'}
              </button>
            </span>
          </div>

          {error && <div className="state state--error">{error}</div>}
          {raw === null && !error && (
            <div className="state">Loading mapping…</div>
          )}

          {raw !== null && showRaw && (
            <pre className="dw-raw">{raw || '(empty)'}</pre>
          )}

          {detail && !showRaw && detail.unparsed && (
            <div className="state">
              The mapping could not be parsed — use “Show raw JSON”.
            </div>
          )}

          {detail && !showRaw && !detail.unparsed && (
            <div className="dw-legs">
              {detail.legs.map((leg, li) => {
                const fq = fieldSearch.trim().toLowerCase()
                const rows = leg.fieldMappings.filter(
                  (f) =>
                    (!hideSystem || !f.isSystemGenerated) &&
                    (!fq ||
                      f.sourceField.toLowerCase().includes(fq) ||
                      f.destinationField.toLowerCase().includes(fq) ||
                      (f.lookupRelatedEntity ?? '').toLowerCase().includes(fq)),
                )
                return (
                  <div className="dw-leg" key={leg.id || li}>
                    <div className="dw-leg-head">
                      <span className="dw-schema">
                        {leg.sourceSchema}
                        <span className="dw-env">
                          {leg.sourceEnvironmentType}
                        </span>
                      </span>
                      <span className="dw-leg-arrow">↔</span>
                      <span className="dw-schema">
                        {leg.destinationSchema}
                        <span className="dw-env">
                          {leg.destinationEnvironmentType}
                        </span>
                      </span>
                    </div>
                    {leg.sourceFilter && (
                      <div className="muted dw-filter">
                        Source filter: <code>{leg.sourceFilter}</code>
                      </div>
                    )}
                    <table className="ops-table dw-fields">
                      <thead>
                        <tr>
                          <th className="dw-dir-col">Dir</th>
                          <th>Source ({leg.sourceEnvironmentType})</th>
                          <th>Destination ({leg.destinationEnvironmentType})</th>
                          <th>Transform</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((f, i) => {
                          const dir = syncDirectionInfo(f.syncDirection)
                          return (
                            <tr
                              key={i}
                              className={
                                f.isSystemGenerated ? 'dw-field--system' : ''
                              }
                            >
                              <td
                                className={`dw-dir dw-dir--${dir.key}`}
                                title={dir.label}
                              >
                                {dir.arrow}
                              </td>
                              <td>
                                <code>{f.sourceField}</code>
                              </td>
                              <td>
                                <code>{f.destinationField}</code>
                                {f.lookupRelatedEntity && (
                                  <span
                                    className="dw-lookup"
                                    title={`Lookup resolved via ${f.lookupRelatedEntity}`}
                                  >
                                    ↳ {f.lookupRelatedEntity}
                                  </span>
                                )}
                              </td>
                              <td>
                                {f.valueMap ? (
                                  <div className="dw-valuemap">
                                    {f.valueMap.map((p, j) => (
                                      <span className="dw-vm" key={j}>
                                        <code>{p.from}</code> →{' '}
                                        <code>{p.to}</code>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="muted">—</span>
                                )}
                                {f.isSystemGenerated && (
                                  <span className="dw-systag" title="System-generated (e.g. integration key)">
                                    system
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        {rows.length === 0 && (
                          <tr>
                            <td colSpan={4} className="muted">
                              {fieldSearch.trim()
                                ? 'No field mappings in this leg match the search.'
                                : 'All field mappings in this leg are system-generated (hidden).'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}

          <div className="muted jobs-sample-note dw-legend">
            Direction: <span className="dw-dir dw-dir--both">↔</span>{' '}
            bidirectional · <span className="dw-dir dw-dir--to-dest">→</span> to
            destination · <span className="dw-dir dw-dir--to-source">←</span> to
            source
          </div>
        </div>
      </div>
    </div>
  )
}

export function DualWriteWorkspace() {
  const [maps, setMaps] = useState<DualWriteMapSummary[] | null>(
    sessionCache?.maps ?? null,
  )
  const [loadedAt, setLoadedAt] = useState<Date | null>(
    sessionCache?.loadedAt ?? null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<DualWriteMapSummary | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await dualWriteService.listTableMaps()
      const now = new Date()
      setMaps(list)
      setLoadedAt(now)
      sessionCache = { maps: list, loadedAt: now }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on first mount only when the session cache is empty.
  useEffect(() => {
    if (sessionCache) return
    const t = window.setTimeout(() => void load(), 30)
    return () => window.clearTimeout(t)
  }, [load])

  const q = search.trim().toLowerCase()
  const rows = useMemo(() => {
    if (!maps) return []
    return maps.filter(
      (m) =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.sourceSchema.toLowerCase().includes(q) ||
        m.destinationSchema.toLowerCase().includes(q) ||
        // Also match a field inside the mapping (e.g. "accountnumber").
        m.fields?.some((f) => f.includes(q)),
    )
  }, [maps, q])

  return (
    <div>
      <div className="card trace-toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search maps by name, table or mapped field…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="trace-toolbar-right">
          <span className="muted">
            {maps ? `${rows.length} of ${maps.length}` : '—'} map
            {maps && maps.length === 1 ? '' : 's'}
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
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? 'Reading…' : '⟳ Refresh'}
          </button>
        </span>
      </div>

      <div className="muted jobs-sample-note">
        Custom (unmanaged) dual-write table maps in the current environment.
        Each map is shown at its current (highest) version; click a row to see
        its field mappings.
      </div>

      {error && <div className="state state--error">{error}</div>}
      {loading && !maps && <div className="state">Reading table maps…</div>}

      {maps && (
        <div className="card trace-list">
          {rows.length === 0 ? (
            <div className="state">
              {maps.length === 0
                ? 'No custom dual-write table maps found in this environment.'
                : 'No maps match the search.'}
            </div>
          ) : (
            <table className="ops-table dw-list">
              <thead>
                <tr>
                  <th>Table map</th>
                  <th>Current version</th>
                  <th>Source → Target</th>
                  <th>Modified</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const nameOrTable =
                    !!q &&
                    (m.name.toLowerCase().includes(q) ||
                      m.sourceSchema.toLowerCase().includes(q) ||
                      m.destinationSchema.toLowerCase().includes(q))
                  // Show which mapped fields matched, but only when the row
                  // appeared solely because of a field (not name/table).
                  const hits =
                    q && !nameOrTable
                      ? (m.fields ?? []).filter((f) => f.includes(q))
                      : []
                  return (
                    <tr
                      key={m.id}
                      className="dw-list-row"
                      onClick={() => setSelected(m)}
                    >
                      <td>
                        <span className="dw-map-name">{m.name}</span>
                        {hits.length > 0 && (
                          <div className="dw-field-hits">
                            {hits.slice(0, 4).map((f) => (
                              <span key={f} className="dw-field-hit">
                                <code>{f}</code>
                              </span>
                            ))}
                            {hits.length > 4 && (
                              <span className="dw-field-more muted">
                                +{hits.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    <td className="nowrap">
                      <span className="dw-badge">v{m.version}</span>
                      {m.versionCount > 1 && (
                        <span
                          className="muted dw-versions"
                          title={`${m.versionCount} version records exist for this map`}
                        >
                          +{m.versionCount - 1} older
                        </span>
                      )}
                    </td>
                    <td>
                      {m.sourceSchema || m.destinationSchema ? (
                        <span className="dw-conn">
                          <span className="dw-conn-side">
                            {m.sourceSchema || '—'}
                            {m.sourceEnv && (
                              <span className="dw-env">{m.sourceEnv}</span>
                            )}
                          </span>
                          <span
                            className={`dw-conn-dir dw-dir--${syncDirectionInfo(m.direction).key}`}
                            title={syncDirectionInfo(m.direction).label}
                          >
                            {syncDirectionInfo(m.direction).arrow}
                          </span>
                          <span className="dw-conn-side">
                            {m.destinationSchema || '—'}
                            {m.destinationEnv && (
                              <span className="dw-env">{m.destinationEnv}</span>
                            )}
                          </span>
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="nowrap muted">{fmtDateTime(m.modifiedOn)}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selected && (
        <DualWriteMappingModal
          map={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
