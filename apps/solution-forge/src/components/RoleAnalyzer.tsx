import { useEffect, useMemo, useState } from 'react'
import type {
  CoreRoleApplyResult,
  CoreRoleCluster,
  EffectiveEntry,
  PrincipalRef,
  PrivilegeAction,
  PrivilegeDepthMask,
  ReverseLookupHit,
  RoleAssignmentPath,
  RoleDiffEntry,
  RoleHygieneReport,
  SecurityModel,
} from '../types/roles'
import { PRIVILEGE_ACTIONS } from '../types/roles'
import type { WorkingSolution } from '../types/solution'
import { depthLabel, depthShort } from '../utils/privileges'
import { analyzeCoreRoles } from '../utils/coreRoles'
import { roleAnalyzerService } from '../services/roleAnalyzerService'
import { isCurrentEnvKey } from '../config'
import { OperateEnvPicker } from './OperateEnvPicker'
import { SolutionSelect } from './SolutionSelect'

/**
 * Security Role Analyzer — the views the maker portal doesn't offer:
 *
 * - Matrix: role × table × privilege with depth badges (classic role-editor
 *   semantics, aggregated on the role's root copy).
 * - Diff: two roles side-by-side, deltas only, exportable as Markdown/CSV.
 * - User rights: effective table privileges of one user, aggregated from
 *   direct + team roles, with the provenance path per grant.
 * - Reverse lookup: "who can <action> on <table>?" — users/teams with path.
 * - Hygiene: unassigned roles and users with too many roles.
 *
 * Strictly read-only (v1) — analysis, not editing. Reads the whole security
 * model of the selected target environment (cached per env in the service).
 */

interface Props {
  /** Selected target environment (shared across the Operate features). */
  envKey: string
  onEnvChange: (envKey: string) => void
  /** Working solutions (host env) offered as the target for a new core role. */
  solutions: WorkingSolution[]
  /** Deployment managers may run the Core Role consolidation automatism. */
  canManage: boolean
}

type SubTab = 'matrix' | 'diff' | 'user' | 'reverse' | 'hygiene' | 'core'

function depthClass(depth: PrivilegeDepthMask): string {
  switch (depth) {
    case 8:
      return 'roles-depth roles-depth--org'
    case 4:
      return 'roles-depth roles-depth--parent'
    case 2:
      return 'roles-depth roles-depth--bu'
    case 1:
      return 'roles-depth roles-depth--user'
    default:
      return 'roles-depth roles-depth--none'
  }
}

function DepthBadge({ depth }: { depth: PrivilegeDepthMask }) {
  return (
    <span className={depthClass(depth)} title={depthLabel(depth)}>
      {depth === 0 ? '·' : depthShort(depth)}
    </span>
  )
}

function pathText(path: RoleAssignmentPath): string {
  return path.via === 'direct'
    ? `role “${path.roleName}” (direct)`
    : `role “${path.roleName}” ← team “${path.teamName ?? '?'}”`
}

/** Trigger a client-side download of a text file. */
function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function RoleAnalyzer({
  envKey,
  onEnvChange,
  solutions,
  canManage,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>('matrix')
  const [model, setModel] = useState<SecurityModel | null>(null)
  // Starts in the loading state — the mount effect kicks off the first load.
  const [progress, setProgress] = useState<string | null>(
    'Loading security model…',
  )
  const [error, setError] = useState<string | null>(null)

  const load = (force = false) => {
    setProgress('Loading security model…')
    setError(null)
    roleAnalyzerService
      .loadModel(envKey, (message) => setProgress(message), force)
      .then(setModel)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setProgress(null))
  }

  useEffect(() => {
    let cancelled = false
    roleAnalyzerService
      .loadModel(envKey, (message) => {
        if (!cancelled) setProgress(message)
      })
      .then((m) => {
        if (!cancelled) setModel(m)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setProgress(null)
      })
    return () => {
      cancelled = true
    }
  }, [envKey])

  // --- matrix -------------------------------------------------------------
  const [matrixRoleId, setMatrixRoleId] = useState('')
  const [matrixSearch, setMatrixSearch] = useState('')

  const matrixRole = model?.roles.find((r) => r.rootRoleId === matrixRoleId)
  const matrixRows = useMemo(() => {
    if (!model || !matrixRoleId) return []
    const matrix = model.matrices.get(matrixRoleId)
    if (!matrix) return []
    const q = matrixSearch.trim().toLowerCase()
    return [...matrix.entries()]
      .filter(([entity]) => !q || entity.includes(q))
      .sort(([a], [b]) => a.localeCompare(b))
  }, [model, matrixRoleId, matrixSearch])

  // --- diff ------------------------------------------------------------------
  const [diffLeftId, setDiffLeftId] = useState('')
  const [diffRightId, setDiffRightId] = useState('')

  const diff: RoleDiffEntry[] = useMemo(() => {
    if (!model || !diffLeftId || !diffRightId || diffLeftId === diffRightId)
      return []
    const left = model.matrices.get(diffLeftId)
    const right = model.matrices.get(diffRightId)
    const entities = new Set<string>([
      ...(left?.keys() ?? []),
      ...(right?.keys() ?? []),
    ])
    const out: RoleDiffEntry[] = []
    for (const entity of [...entities].sort()) {
      for (const action of PRIVILEGE_ACTIONS) {
        const l = left?.get(entity)?.get(action) ?? 0
        const r = right?.get(entity)?.get(action) ?? 0
        if (l !== r) out.push({ entity, action, left: l, right: r })
      }
    }
    return out
  }, [model, diffLeftId, diffRightId])

  const diffLeft = model?.roles.find((r) => r.rootRoleId === diffLeftId)
  const diffRight = model?.roles.find((r) => r.rootRoleId === diffRightId)

  const exportDiff = (format: 'markdown' | 'csv') => {
    if (!diffLeft || !diffRight) return
    if (format === 'csv') {
      const lines = [
        'table,privilege,' +
          `"${diffLeft.name}","${diffRight.name}"`,
        ...diff.map(
          (d) =>
            `${d.entity},${d.action},${depthLabel(d.left)},${depthLabel(d.right)}`,
        ),
      ]
      download('role-diff.csv', lines.join('\n'), 'text/csv')
    } else {
      const lines = [
        `# Role diff — ${diffLeft.name} vs. ${diffRight.name}`,
        '',
        `| Table | Privilege | ${diffLeft.name} | ${diffRight.name} |`,
        '| --- | --- | --- | --- |',
        ...diff.map(
          (d) =>
            `| ${d.entity} | ${d.action} | ${depthLabel(d.left)} | ${depthLabel(d.right)} |`,
        ),
      ]
      download('role-diff.md', lines.join('\n'), 'text/markdown')
    }
  }

  // --- user rights ------------------------------------------------------------
  const [userQuery, setUserQuery] = useState('')
  const [userHits, setUserHits] = useState<PrincipalRef[]>([])
  const [selectedUser, setSelectedUser] = useState<PrincipalRef | null>(null)
  const [effective, setEffective] = useState<{
    entries: EffectiveEntry[]
    roles: RoleAssignmentPath[]
  } | null>(null)
  const [effectiveLoading, setEffectiveLoading] = useState(false)

  useEffect(() => {
    if (subTab !== 'user') return
    const t = window.setTimeout(() => {
      roleAnalyzerService
        .searchUsers(userQuery, envKey)
        .then(setUserHits)
        .catch(() => setUserHits([]))
    }, 250)
    return () => window.clearTimeout(t)
  }, [subTab, userQuery, envKey])

  const openUser = (user: PrincipalRef) => {
    setSelectedUser(user)
    setEffective(null)
    setEffectiveLoading(true)
    roleAnalyzerService
      .getEffectiveRights(user.id, envKey)
      .then(setEffective)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setEffectiveLoading(false))
  }

  // --- reverse lookup ----------------------------------------------------------
  const [reverseEntity, setReverseEntity] = useState('')
  const [reverseAction, setReverseAction] = useState<PrivilegeAction>('Delete')
  const [reverseHits, setReverseHits] = useState<ReverseLookupHit[] | null>(null)
  const [reverseLoading, setReverseLoading] = useState(false)

  const runReverse = () => {
    if (!reverseEntity) return
    setReverseLoading(true)
    setReverseHits(null)
    roleAnalyzerService
      .reverseLookup(reverseEntity, reverseAction, envKey)
      .then(setReverseHits)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setReverseLoading(false))
  }

  // --- hygiene -----------------------------------------------------------------
  const [threshold, setThreshold] = useState(5)
  const [hygiene, setHygiene] = useState<RoleHygieneReport | null>(null)
  const [hygieneLoading, setHygieneLoading] = useState(false)

  const runHygiene = () => {
    setHygieneLoading(true)
    roleAnalyzerService
      .getHygieneReport(threshold, envKey)
      .then(setHygiene)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setHygieneLoading(false))
  }

  // --- core roles --------------------------------------------------------------
  const isHost = isCurrentEnvKey(envKey)
  const clusters = useMemo<CoreRoleCluster[]>(
    () => (model ? analyzeCoreRoles(model) : []),
    [model],
  )
  // Per-cluster editable name / remove-flag / result, keyed by cluster id.
  const [coreNames, setCoreNames] = useState<Record<string, string>>({})
  const [coreRemove, setCoreRemove] = useState<Record<string, boolean>>({})
  const [coreResults, setCoreResults] = useState<
    Record<string, CoreRoleApplyResult>
  >({})
  const [coreApplying, setCoreApplying] = useState<string | null>(null)
  const [coreSolutionId, setCoreSolutionId] = useState('')

  // Working solutions that can receive the consolidated roles (host env).
  const coreSolutions = useMemo(
    () =>
      solutions.filter(
        (s, index) =>
          s.recordId &&
          !s.solutionMissing &&
          solutions.findIndex((o) => o.id === s.id) === index,
      ),
    [solutions],
  )
  const coreSolution = coreSolutions.find((s) => s.id === coreSolutionId) ?? null

  const applyCoreRole = async (cluster: CoreRoleCluster) => {
    if (!coreSolution) return
    const roleName = (coreNames[cluster.id] ?? cluster.suggestedName).trim()
    if (!roleName) return
    const removeDuplicates = !!coreRemove[cluster.id]
    if (
      !window.confirm(
        `Create the role “${roleName}” in solution “${coreSolution.title}” with ` +
          `${cluster.privileges.length} privilege(s)` +
          (removeDuplicates
            ? `, and REMOVE those privileges from ${cluster.sources.length} source role(s) ` +
              `(${cluster.sources.map((s) => s.name).join(', ')})?\n\n` +
              `Members holding only a source role will lose that access unless they are also given the new core role.`
            : '?'),
      )
    )
      return
    setCoreApplying(cluster.id)
    try {
      const result = await roleAnalyzerService.applyCoreRole(
        {
          workingSolutionUniqueName: coreSolution.uniqueName,
          roleName,
          privileges: cluster.privileges,
          sourceRoleIds: cluster.sources.map((s) => s.rootRoleId),
          removeDuplicates,
        },
        envKey,
      )
      setCoreResults((prev) => ({ ...prev, [cluster.id]: result }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCoreApplying(null)
    }
  }

  return (
    <div>
      <OperateEnvPicker envKey={envKey} onChange={onEnvChange} />
      <nav className="subtabs">
        {(
          [
            ['matrix', 'Matrix'],
            ['diff', 'Diff'],
            ['user', 'User rights'],
            ['reverse', 'Reverse lookup'],
            ['hygiene', 'Hygiene'],
            ['core', 'Core roles'],
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
        <span className="trace-level-control">
          {model && (
            <span
              className="muted"
              title="The privilege snapshot is cached for ~15 minutes."
            >
              Snapshot {model.loadedAt.toLocaleTimeString()}
            </span>
          )}
          <button
            className="btn btn--small"
            onClick={() => load(true)}
            disabled={!!progress}
          >
            ⟳ Reload model
          </button>
        </span>
      </nav>

      {error && <div className="state state--error">{error}</div>}
      {progress && (
        <div className="sharing-progress" aria-live="polite">
          <span className="sharing-progress-spinner" />
          <span className="sharing-progress-text">{progress}</span>
        </div>
      )}

      {model && (
        <>
          <div className="roles-legend muted">
            Depth: <DepthBadge depth={1} /> User · <DepthBadge depth={2} />{' '}
            Business Unit · <DepthBadge depth={4} /> Parent: Child ·{' '}
            <DepthBadge depth={8} /> Organization — roles aggregated on their
            root copy (BU copies collapse).
          </div>

          {subTab === 'matrix' && (
            <>
              <div className="card trace-toolbar">
                <select
                  value={matrixRoleId}
                  onChange={(e) => setMatrixRoleId(e.target.value)}
                >
                  <option value="">Select a role…</option>
                  {model.roles.map((r) => (
                    <option key={r.rootRoleId} value={r.rootRoleId}>
                      {r.name}
                      {r.isManaged ? ' (managed)' : ''}
                    </option>
                  ))}
                </select>
                <input
                  className="search"
                  type="search"
                  placeholder="Filter tables…"
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                />
              </div>
              {!matrixRoleId && (
                <div className="state">
                  Pick a role to see its table × privilege matrix.
                </div>
              )}
              {matrixRoleId && matrixRows.length === 0 && (
                <div className="state">
                  No table privileges{matrixSearch ? ' match the filter' : ''}.
                </div>
              )}
              {matrixRows.length > 0 && (
                <div className="card trace-list">
                  <table className="ops-table roles-matrix">
                    <thead>
                      <tr>
                        <th>Table</th>
                        {PRIVILEGE_ACTIONS.map((a) => (
                          <th key={a} className="roles-matrix-action">
                            {a}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixRows.map(([entity, actions]) => (
                        <tr key={entity}>
                          <td className="trace-type">{entity}</td>
                          {PRIVILEGE_ACTIONS.map((action) => (
                            <td key={action} className="roles-matrix-cell">
                              <DepthBadge depth={actions.get(action) ?? 0} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {matrixRole && (
                    <div className="muted jobs-sample-note">
                      {matrixRole.copyCount > 1
                        ? `${matrixRole.copyCount} BU copies aggregated. `
                        : ''}
                      Misc privileges (not table-scoped):{' '}
                      {(model.miscPrivileges.get(matrixRoleId) ?? []).join(', ') ||
                        'none'}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {subTab === 'diff' && (
            <>
              <div className="card trace-toolbar">
                <select
                  value={diffLeftId}
                  onChange={(e) => setDiffLeftId(e.target.value)}
                >
                  <option value="">Left role…</option>
                  {model.roles.map((r) => (
                    <option key={r.rootRoleId} value={r.rootRoleId}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <span className="muted">vs.</span>
                <select
                  value={diffRightId}
                  onChange={(e) => setDiffRightId(e.target.value)}
                >
                  <option value="">Right role…</option>
                  {model.roles.map((r) => (
                    <option key={r.rootRoleId} value={r.rootRoleId}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <span className="trace-toolbar-right">
                  <button
                    className="btn btn--small"
                    disabled={diff.length === 0}
                    onClick={() => exportDiff('markdown')}
                  >
                    Export Markdown
                  </button>
                  <button
                    className="btn btn--small"
                    disabled={diff.length === 0}
                    onClick={() => exportDiff('csv')}
                  >
                    Export CSV
                  </button>
                </span>
              </div>
              {diffLeftId && diffRightId && diffLeftId === diffRightId && (
                <div className="state">Pick two different roles.</div>
              )}
              {diffLeft && diffRight && diffLeftId !== diffRightId && (
                <>
                  {diff.length === 0 ? (
                    <div className="state state--success">
                      ✓ No table-privilege deltas between{' '}
                      <strong>{diffLeft.name}</strong> and{' '}
                      <strong>{diffRight.name}</strong>.
                    </div>
                  ) : (
                    <div className="card trace-list">
                      <table className="ops-table">
                        <thead>
                          <tr>
                            <th>Table</th>
                            <th>Privilege</th>
                            <th>{diffLeft.name}</th>
                            <th>{diffRight.name}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diff.map((d) => (
                            <tr key={`${d.entity}|${d.action}`}>
                              <td className="trace-type">{d.entity}</td>
                              <td>{d.action}</td>
                              <td>
                                <DepthBadge depth={d.left} />{' '}
                                <span className="muted">{depthLabel(d.left)}</span>
                              </td>
                              <td>
                                <DepthBadge depth={d.right} />{' '}
                                <span className="muted">{depthLabel(d.right)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {subTab === 'user' && (
            <div className="roles-user">
              <div className="card trace-toolbar">
                <input
                  className="search"
                  type="search"
                  placeholder="Search users…"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                />
                <div className="chips">
                  {userHits.map((u) => (
                    <button
                      key={u.id}
                      className={`chip ${selectedUser?.id === u.id ? 'chip--active' : ''}`}
                      onClick={() => openUser(u)}
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              </div>
              {effectiveLoading && (
                <div className="state">Aggregating effective rights…</div>
              )}
              {selectedUser && effective && (
                <>
                  <div className="card roles-user-roles">
                    <strong>{selectedUser.name}</strong> —{' '}
                    {effective.roles.length === 0 ? (
                      <span className="muted">no security roles.</span>
                    ) : (
                      <ul>
                        {effective.roles.map((p, i) => (
                          <li key={i}>
                            {p.roleName}{' '}
                            <span className="muted">
                              {p.via === 'direct'
                                ? '(direct)'
                                : `← team “${p.teamName}”`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="muted jobs-sample-note">
                      Aggregated client-side from direct + team roles (deepest
                      depth wins). The platform's RetrieveUserPrivileges
                      function is not connector-reachable — treat this as the
                      explainable view, not a legal audit.
                    </div>
                  </div>
                  {effective.entries.length > 0 && (
                    <div className="card trace-list">
                      <table className="ops-table">
                        <thead>
                          <tr>
                            <th>Table</th>
                            <th>Privilege</th>
                            <th>Depth</th>
                            <th>Provenance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {effective.entries.map((entry) => (
                            <tr key={`${entry.entity}|${entry.action}`}>
                              <td className="trace-type">{entry.entity}</td>
                              <td>{entry.action}</td>
                              <td>
                                <DepthBadge depth={entry.depth} />{' '}
                                <span className="muted">
                                  {depthLabel(entry.depth)}
                                </span>
                              </td>
                              <td className="roles-provenance">
                                {entry.sources.map((s, i) => (
                                  <span key={i} className="roles-path">
                                    {pathText(s)}
                                  </span>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {subTab === 'reverse' && (
            <>
              <div className="card trace-toolbar">
                <span className="muted">Who can</span>
                <select
                  value={reverseAction}
                  onChange={(e) =>
                    setReverseAction(e.target.value as PrivilegeAction)
                  }
                >
                  {PRIVILEGE_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <span className="muted">on</span>
                <select
                  value={reverseEntity}
                  onChange={(e) => setReverseEntity(e.target.value)}
                >
                  <option value="">Select a table…</option>
                  {model.entities.map((entity) => (
                    <option key={entity} value={entity}>
                      {entity}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn--small btn--primary"
                  disabled={!reverseEntity || reverseLoading}
                  onClick={runReverse}
                >
                  {reverseLoading ? 'Resolving…' : '? Resolve'}
                </button>
              </div>
              {reverseHits && reverseHits.length === 0 && (
                <div className="state">
                  Nobody holds {reverseAction} on <code>{reverseEntity}</code>.
                </div>
              )}
              {reverseHits && reverseHits.length > 0 && (
                <div className="card trace-list">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Principal</th>
                        <th>Depth</th>
                        <th>Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reverseHits.map((hit) => (
                        <tr key={`${hit.principal.type}:${hit.principal.id}`}>
                          <td>{hit.principal.type === 'team' ? '👥' : '👤'}</td>
                          <td className="trace-type">{hit.principal.name}</td>
                          <td>
                            <DepthBadge depth={hit.depth} />{' '}
                            <span className="muted">{depthLabel(hit.depth)}</span>
                          </td>
                          <td className="roles-provenance">
                            {hit.paths.map((p, i) => (
                              <span key={i} className="roles-path">
                                {pathText(p)}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {subTab === 'hygiene' && (
            <>
              <div className="card trace-toolbar">
                <label>
                  Flag users with more than
                  <input
                    className="roles-threshold"
                    type="number"
                    min={1}
                    max={20}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value) || 5)}
                  />
                  roles
                </label>
                <button
                  className="btn btn--small btn--primary"
                  onClick={runHygiene}
                  disabled={hygieneLoading}
                >
                  {hygieneLoading ? 'Scanning…' : 'Run hygiene report'}
                </button>
              </div>
              {hygiene && (
                <div className="roles-hygiene">
                  <div className="card">
                    <h3>
                      Roles without any assignment (
                      {hygiene.unassignedRoles.length})
                    </h3>
                    {hygiene.unassignedRoles.length === 0 ? (
                      <div className="state state--success">
                        ✓ Every role is assigned to at least one user or team.
                      </div>
                    ) : (
                      <ul>
                        {hygiene.unassignedRoles.map((r) => (
                          <li key={r.rootRoleId}>
                            {r.name}
                            {r.isManaged && (
                              <span className="muted"> (managed)</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="card">
                    <h3>
                      Users with more than {hygiene.threshold} roles (
                      {hygiene.usersWithManyRoles.length})
                    </h3>
                    {hygiene.usersWithManyRoles.length === 0 ? (
                      <div className="state state--success">
                        ✓ No user exceeds the threshold.
                      </div>
                    ) : (
                      <ul>
                        {hygiene.usersWithManyRoles.map((u) => (
                          <li key={u.user.id}>
                            <strong>{u.user.name}</strong> — {u.roleCount}{' '}
                            roles:{' '}
                            <span className="muted">{u.roles.join(', ')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {subTab === 'core' && (
            <>
              {!isHost ? (
                <div className="state">
                  Core Role consolidation works on the <strong>host</strong>{' '}
                  environment — that's where working solutions live and where
                  the new role is captured. Switch the target environment above
                  to the host to use it.
                </div>
              ) : (
                <>
                  <div className="card trace-toolbar">
                    <span className="muted">Target working solution</span>
                    <div style={{ minWidth: 260 }}>
                      <SolutionSelect
                        options={coreSolutions}
                        value={coreSolutionId}
                        onChange={setCoreSolutionId}
                        placeholder="Select a working solution…"
                      />
                    </div>
                    {!canManage && (
                      <span className="operate-env-note">
                        ⚠ consolidation requires the deployment-manager role
                      </span>
                    )}
                  </div>

                  <div className="state trace-hint">
                    ℹ Analyzes <strong>custom (unmanaged)</strong> roles for
                    privileges shared by ≥ 2 of them and proposes one core role
                    per shared role-set. Consolidating removes the duplicates
                    from the source roles only when you opt in — those members
                    then need the new core role to keep their access.
                  </div>

                  {clusters.length === 0 ? (
                    <div className="state state--success">
                      ✓ No privileges are shared across the custom (unmanaged)
                      roles — nothing to consolidate.
                    </div>
                  ) : (
                    <div className="core-clusters">
                      {clusters.map((cluster) => {
                        const name =
                          coreNames[cluster.id] ?? cluster.suggestedName
                        const result = coreResults[cluster.id]
                        const busy = coreApplying === cluster.id
                        return (
                          <div key={cluster.id} className="card core-cluster">
                            <div className="core-cluster-head">
                              <div className="core-cluster-sources">
                                <span className="muted">Shared by:</span>{' '}
                                {cluster.sources.map((s) => (
                                  <span key={s.rootRoleId} className="chip chip--static">
                                    {s.name}
                                  </span>
                                ))}
                              </div>
                              <span className="muted">
                                {cluster.privileges.length} shared privilege
                                {cluster.privileges.length === 1 ? '' : 's'}
                              </span>
                            </div>

                            <div className="core-cluster-grid">
                              <table className="ops-table">
                                <thead>
                                  <tr>
                                    <th>Table</th>
                                    <th>Privilege</th>
                                    <th>Depth (consolidated)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cluster.privileges.map((p) => (
                                    <tr key={`${p.entity}|${p.action}`}>
                                      <td className="trace-type">{p.entity}</td>
                                      <td>{p.action}</td>
                                      <td>
                                        <DepthBadge depth={p.depth} />{' '}
                                        <span className="muted">
                                          {depthLabel(p.depth)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div className="core-cluster-form">
                              <label className="core-name">
                                New core role name
                                <input
                                  className="search"
                                  type="text"
                                  value={name}
                                  onChange={(e) =>
                                    setCoreNames((prev) => ({
                                      ...prev,
                                      [cluster.id]: e.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label
                                className="roles-remove-check"
                                title="Also strip these privileges from the source roles (they are added to the solution too)."
                              >
                                <input
                                  type="checkbox"
                                  checked={!!coreRemove[cluster.id]}
                                  onChange={(e) =>
                                    setCoreRemove((prev) => ({
                                      ...prev,
                                      [cluster.id]: e.target.checked,
                                    }))
                                  }
                                />
                                remove duplicates from source roles
                              </label>
                              <button
                                className="btn btn--small btn--primary"
                                disabled={
                                  busy ||
                                  !canManage ||
                                  !coreSolution ||
                                  !name.trim()
                                }
                                title={
                                  !canManage
                                    ? 'Requires the deployment-manager role.'
                                    : !coreSolution
                                      ? 'Select a target working solution first.'
                                      : 'Create the core role in the selected working solution.'
                                }
                                onClick={() => void applyCoreRole(cluster)}
                              >
                                {busy ? 'Creating…' : 'Create core role'}
                              </button>
                            </div>

                            {result && (
                              <div
                                className={`state ${result.ok ? 'state--success' : 'state--error'}`}
                              >
                                <span>
                                  {result.ok ? '✓ ' : ''}
                                  Role <strong>{result.roleName}</strong> —{' '}
                                  {result.privilegesAdded} added
                                  {result.privilegesRemoved > 0
                                    ? `, ${result.privilegesRemoved} removed from source roles`
                                    : ''}
                                  .
                                </span>
                                <ul className="merge-errors">
                                  {result.steps.map((step, i) => (
                                    <li key={i}>
                                      {step.ok ? '✓' : '✗'} {step.label}
                                      {step.error ? ` — ${step.error}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
