import type { ComparerResult, ComparerRow } from '../types/comparer'
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
  onToggle: (
    env: { key: string; label: string },
    row: ComparerRow,
    desiredOn: boolean,
  ) => void
}

/**
 * The comparer matrix: one row per compared item (flow / plugin step), one
 * column per configured environment. Each cell shows the item's status
 * (+version or modified time), a portal deep-link and — for deployment managers
 * — a turn on/off button. Cells whose on/off differs from the host are
 * highlighted, and the whole row is flagged when any target drifts.
 */
export function ComparerMatrix({
  result,
  hostKey,
  showVersion,
  canManage,
  busyCell,
  onToggle,
}: Props) {
  return (
    <div className="cmp-table-wrap">
      <table className="cmp-table">
        <thead>
          <tr>
            <th className="cmp-th-item">Item</th>
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
          {result.rows.map((row) => {
            const host = row.byEnv[hostKey] ?? null
            return (
              <tr
                key={row.id}
                className={row.statusDrift ? 'cmp-row--drift' : ''}
              >
                <td className="cmp-item">
                  <div className="cmp-item-name" title={row.name}>
                    {row.name}
                  </div>
                  {row.subtitle && (
                    <div className="cmp-item-sub muted">{row.subtitle}</div>
                  )}
                </td>
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
                            <span
                              className={`cmp-ver ${state.version ? '' : 'muted'}`}
                            >
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
                                  state.active
                                    ? 'cmp-toggle--off'
                                    : 'cmp-toggle--on'
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
                                {busy
                                  ? '…'
                                  : state.active
                                    ? 'Turn off'
                                    : 'Turn on'}
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
          })}
        </tbody>
      </table>
    </div>
  )
}
