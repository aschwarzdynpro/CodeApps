/**
 * Drill-down for one role in the Role Comparer: every entity × action the role
 * grants in ANY environment, with the depth per environment, plus the
 * non-table ("misc") privileges. Rows that differ are highlighted; a toggle
 * hides the identical ones, which is what you want on a role with hundreds of
 * grants and three deltas.
 */
import { useMemo, useState } from 'react'
import type {
  RoleComparerRow,
  RolePrivilegeDiff,
} from '../types/roleComparer'
import type { PrivilegeDepthMask } from '../types/roles'
import { depthLabel, depthShort } from '../utils/privileges'

interface Props {
  row: RoleComparerRow
  diff: RolePrivilegeDiff
  envKeys: string[]
  envLabel: (envKey: string) => string
  onClose: () => void
}

function DepthCell({ depth }: { depth: PrivilegeDepthMask | null }) {
  if (depth === null)
    return (
      <span className="roles-depth roles-depth--none" title="Role absent or environment unreadable">
        ?
      </span>
    )
  return (
    <span
      className={
        depth === 0
          ? 'roles-depth roles-depth--none'
          : `roles-depth roles-depth--${depth === 8 ? 'org' : depth === 4 ? 'parent' : depth === 2 ? 'bu' : 'user'}`
      }
      title={depthLabel(depth)}
    >
      {depth === 0 ? '·' : depthShort(depth)}
    </span>
  )
}

export function RolePrivilegeDiffModal({
  row,
  diff,
  envKeys,
  envLabel,
  onClose,
}: Props) {
  const [onlyDiff, setOnlyDiff] = useState(true)

  const privileges = useMemo(
    () => (onlyDiff ? diff.privileges.filter((p) => p.drift) : diff.privileges),
    [diff.privileges, onlyDiff],
  )
  const misc = useMemo(
    () => (onlyDiff ? diff.misc.filter((m) => m.drift) : diff.misc),
    [diff.misc, onlyDiff],
  )
  const driftCount = diff.privileges.filter((p) => p.drift).length
  const miscDriftCount = diff.misc.filter((m) => m.drift).length

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card modal--wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="card-title">{row.name}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="rcmp-diff-meta">
          <span className="muted">
            {driftCount === 0 && miscDriftCount === 0
              ? 'Same privileges everywhere the role exists.'
              : `${driftCount} table grant(s) and ${miscDriftCount} misc privilege(s) differ.`}
          </span>
          <label className="rcmp-diff-toggle">
            <input
              type="checkbox"
              checked={onlyDiff}
              onChange={(e) => setOnlyDiff(e.target.checked)}
            />
            Only differences
          </label>
        </div>

        <div className="rcmp-diff-scroll">
          <table className="ops-table rcmp-diff-table">
            <thead>
              <tr>
                <th>Table</th>
                <th>Action</th>
                {envKeys.map((key) => (
                  <th key={key}>{envLabel(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {privileges.length === 0 && (
                <tr>
                  <td colSpan={2 + envKeys.length} className="muted">
                    {onlyDiff
                      ? 'No differing table privileges.'
                      : 'No table privileges.'}
                  </td>
                </tr>
              )}
              {privileges.map((p) => (
                <tr
                  key={`${p.entity}.${p.action}`}
                  className={p.drift ? 'rcmp-diff-row--drift' : undefined}
                >
                  <td>
                    <code>{p.entity}</code>
                  </td>
                  <td>{p.action}</td>
                  {envKeys.map((key) => (
                    <td key={key}>
                      <DepthCell depth={p.byEnv[key] ?? null} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {misc.length > 0 && (
            <>
              <h4 className="rcmp-diff-subhead">Misc privileges</h4>
              <table className="ops-table rcmp-diff-table">
                <thead>
                  <tr>
                    <th>Privilege</th>
                    {envKeys.map((key) => (
                      <th key={key}>{envLabel(key)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {misc.map((m) => (
                    <tr
                      key={m.name}
                      className={m.drift ? 'rcmp-diff-row--drift' : undefined}
                    >
                      <td>
                        <code>{m.name}</code>
                      </td>
                      {envKeys.map((key) => (
                        <td key={key}>
                          {m.byEnv[key] === null ? (
                            <span className="muted">?</span>
                          ) : m.byEnv[key] ? (
                            '✓'
                          ) : (
                            <span className="muted">·</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
