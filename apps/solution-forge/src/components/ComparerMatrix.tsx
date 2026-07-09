import { Fragment, useState } from 'react'
import type { ComparerResult, ComparerRow } from '../types/comparer'
import { hasDefinitionMismatch } from '../types/comparer'
import { ENVIRONMENTS } from '../config'
import { formatRelative } from '../utils/format'

/** A power (on/off) glyph so the action button reads as a control, not a badge. */
const PowerIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 3v9" />
    <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
  </svg>
)

interface Props {
  result: ComparerResult
  /** Host (current) env key — the reference the target cells are compared to. */
  hostKey: string
  /** Plugin steps show a version; flows show the modified time instead. */
  showVersion: boolean
  /** Deployment-manager: enables the per-cell turn on/off buttons. */
  canManage: boolean
  /** `${envKey}:${rowId}` currently toggling (shows a spinner, disables). */
  busyCell: string | null
  /** When set, rows are grouped by this key into collapsible sections. */
  groupKey?: (row: ComparerRow) => string
  onToggle: (
    env: { key: string; label: string },
    row: ComparerRow,
    desiredOn: boolean,
  ) => void
}

/**
 * The comparer matrix: one row per compared item (flow / plugin step), one
 * column per configured environment. Each cell splits an info zone (status
 * pill + version/modified) from a separated action zone (portal deep-link +
 * turn on/off). Cells whose on/off differs from the host are highlighted, the
 * whole row is flagged when any target drifts, and — with `groupKey` — rows are
 * grouped into collapsible sections (e.g. by plugin assembly).
 */
export function ComparerMatrix({
  result,
  hostKey,
  showVersion,
  canManage,
  busyCell,
  groupKey,
  onToggle,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))

  const envKeys = ENVIRONMENTS.map((e) => e.key)
  // Only flows carry a definition — the column appears only when data exists.
  const hasDefinition = result.rows.some((r) => r.definition !== undefined)
  const colSpan = 1 + (hasDefinition ? 1 : 0) + ENVIRONMENTS.length

  const renderRow = (row: ComparerRow) => {
    const host = row.byEnv[hostKey] ?? null
    const offDef = hasDefinition && hasDefinitionMismatch(row, envKeys)
    return (
      <tr key={row.id}>
        <td className="cmp-item">
          <div className="cmp-item-name" title={row.name}>
            {row.name}
            {row.statusDrift && (
              <span
                className="cmp-mark cmp-mark--drift"
                title="Status differs from current in some environment"
              >
                drift
              </span>
            )}
            {offDef && (
              <span
                className="cmp-mark cmp-mark--def"
                title="Some environment is not in its defined state"
              >
                off-def
              </span>
            )}
          </div>
          {row.subtitle && !groupKey && (
            <div className="cmp-item-sub muted">{row.subtitle}</div>
          )}
        </td>
        {hasDefinition && (
          <td className="cmp-def">
            {row.definition ? (
              <span
                className={`cmp-defpill ${
                  row.definitionActive ? 'cmp-defpill--on' : 'cmp-defpill--off'
                }`}
                title="Defined desired state (hso_cloudflow)"
              >
                {row.definition}
              </span>
            ) : (
              <span className="muted" title="No definition found">
                —
              </span>
            )}
          </td>
        )}
        {ENVIRONMENTS.map((env) => {
          const state = row.byEnv[env.key] ?? null
          const isHost = env.key === hostKey
          const busy = busyCell === `${env.key}:${row.id}`
          if (state === null)
            return (
              <td
                key={env.key}
                className="cmp-cell cmp-cell--unknown"
                title="Environment could not be read"
              >
                ?
              </td>
            )
          if (!state.present)
            return (
              <td key={env.key} className="cmp-cell cmp-cell--missing">
                <span className="cmp-missing">Missing</span>
              </td>
            )
          const drift =
            !isHost && !!host?.present && state.active !== host.active
          return (
            <td
              key={env.key}
              className={`cmp-cell ${drift ? 'cmp-cell--drift' : ''}`}
            >
              <div className="cmp-cell-body">
                <div className="cmp-cell-info">
                  <span
                    className={`cmp-pill ${
                      state.active ? 'cmp-pill--on' : 'cmp-pill--off'
                    }`}
                  >
                    {state.statusLabel}
                  </span>
                  {showVersion ? (
                    <span className={`cmp-ver ${state.version ? '' : 'muted'}`}>
                      {state.version ? `v${state.version}` : '—'}
                    </span>
                  ) : (
                    state.modifiedOn && (
                      <span className="cmp-when muted">
                        {formatRelative(state.modifiedOn)}
                      </span>
                    )
                  )}
                </div>
                {state.desired && (
                  <span
                    className={`cmp-desired ${
                      state.desiredActive === state.active
                        ? 'cmp-desired--ok'
                        : 'cmp-desired--bad'
                    }`}
                    title={
                      state.desiredActive === state.active
                        ? 'Matches the defined state'
                        : `Should be “${state.desired}” per the definition`
                    }
                  >
                    def: {state.desired}
                    {state.desiredActive !== state.active && ' ⚠'}
                  </span>
                )}
                {(state.link || canManage) && (
                  <div className="cmp-actions">
                    {state.link && (
                      <a
                        className="cmp-jump"
                        href={state.link}
                        target="_blank"
                        rel="noreferrer"
                        title={`Open in ${env.label}`}
                        aria-label={`Open in ${env.label}`}
                      >
                        ↗
                      </a>
                    )}
                    {canManage && (
                      <button
                        className={`cmp-toggle ${
                          state.active ? 'cmp-toggle--off' : 'cmp-toggle--on'
                        }`}
                        disabled={busy}
                        onClick={() => onToggle(env, row, !state.active)}
                        title={
                          state.active
                            ? `Turn off in ${env.label}`
                            : `Turn on in ${env.label}`
                        }
                      >
                        <PowerIcon />
                        {busy ? '…' : state.active ? 'Turn off' : 'Turn on'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </td>
          )
        })}
      </tr>
    )
  }

  // Group rows by the key when provided; groups with any drift first, then by
  // name; every row keeps its incoming (drift-first) order within a group.
  const groups: { key: string; rows: ComparerRow[] }[] = []
  if (groupKey) {
    const byKey = new Map<string, ComparerRow[]>()
    for (const row of result.rows) {
      const k = groupKey(row) || '(none)'
      const list = byKey.get(k)
      if (list) list.push(row)
      else byKey.set(k, [row])
    }
    groups.push(...[...byKey.entries()].map(([key, rows]) => ({ key, rows })))
    groups.sort((a, b) => {
      const da = a.rows.some((r) => r.statusDrift) ? 0 : 1
      const db = b.rows.some((r) => r.statusDrift) ? 0 : 1
      return da - db || a.key.localeCompare(b.key)
    })
  }

  return (
    <div className="cmp-table-wrap">
      <table className="cmp-table">
        <thead>
          <tr>
            <th className="cmp-th-item">Item</th>
            {hasDefinition && (
              <th className="cmp-th-def" title="Defined desired state">
                Definition
              </th>
            )}
            {ENVIRONMENTS.map((env) => (
              <th
                key={env.key}
                className={env.key === hostKey ? 'cmp-th--host' : ''}
                title={result.envErrors[env.key]}
              >
                {env.label}
                {env.key === hostKey && !/current/i.test(env.label) && (
                  <span className="cmp-th-tag"> · current</span>
                )}
                {result.envErrors[env.key] && (
                  <span className="cmp-th-err" title={result.envErrors[env.key]}>
                    {' '}
                    ⚠
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!groupKey && result.rows.map(renderRow)}
          {groupKey &&
            groups.map((g) => {
              const open = !collapsed[g.key]
              const driftInGroup = g.rows.filter((r) => r.statusDrift).length
              return (
                <Fragment key={`g:${g.key}`}>
                  <tr className="cmp-group-head">
                    <td colSpan={colSpan}>
                      <button
                        className="cmp-group-toggle"
                        onClick={() => toggleGroup(g.key)}
                        aria-expanded={open}
                      >
                        <span
                          className={`cmp-group-chevron ${
                            open ? 'cmp-group-chevron--open' : ''
                          }`}
                        >
                          ▸
                        </span>
                        <span className="cmp-group-name">{g.key}</span>
                        <span className="muted">({g.rows.length})</span>
                        {driftInGroup > 0 && (
                          <span className="cmp-group-drift">
                            {driftInGroup} drift
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                  {open && g.rows.map(renderRow)}
                </Fragment>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}
