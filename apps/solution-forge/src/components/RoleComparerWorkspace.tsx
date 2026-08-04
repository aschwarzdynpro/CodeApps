/**
 * Role Comparer — the same security role across every configured environment.
 *
 * Read-only ON PURPOSE. Repairing a role directly in UAT/PROD is exactly what
 * produces the unmanaged active layer the Layer Inspector then reports; the
 * fix for a drifting role is solution transport, not a write from here. The
 * workspace therefore reports and explains, and the one action it offers is to
 * take the role into a working solution — which is a host-environment,
 * deployment-manager operation that already lives in the Role Analyzer's Core
 * Role tab.
 *
 * State is component-local: a compare re-run after a tab switch hits the
 * analyzer's ~15-minute per-environment snapshot cache and returns almost
 * immediately, so the Flow Comparer's module-singleton persistence would buy
 * little here.
 */
import { useCallback, useMemo, useState } from 'react'
import { envByKey } from '../config'
import { roleComparerService } from '../services/roleComparerService'
import type {
  RoleComparerFilter,
  RoleComparerResult,
  RoleComparerRow,
  RolePrivilegeDiff,
} from '../types/roleComparer'
import type { WorkingSolution } from '../types/solution'
import {
  applyRoleScope,
  buildPrivilegeDiff,
  filterRoleRows,
  roleComparerCounts,
  solutionRoleKeysFrom,
} from '../utils/roleCompare'
import { RolePrivilegeDiffModal } from './RolePrivilegeDiffModal'
import { SolutionSelect } from './SolutionSelect'

interface Props {
  /** Release solutions offered as the scope, as in the Process Comparer. */
  solutions: WorkingSolution[]
}

function envLabel(envKey: string): string {
  return envByKey(envKey)?.label ?? envKey
}

function formatRelative(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  return date.toLocaleTimeString()
}

/** Badges summarising a row's findings, so the table reads without the modal. */
function RowBadges({ row }: { row: RoleComparerRow }) {
  return (
    <>
      {row.drift && (
        <span className="rcmp-badge rcmp-badge--drift" title="The privilege set differs between environments">
          privilege drift
        </span>
      )}
      {row.missingSomewhere && (
        <span className="rcmp-badge rcmp-badge--missing" title="Present in the host, absent in at least one target">
          missing
        </span>
      )}
      {row.extraSomewhere && (
        <span className="rcmp-badge rcmp-badge--missing" title="Exists in a target but not in the host — created locally">
          target-only
        </span>
      )}
      {row.identityDrift && (
        <span className="rcmp-badge rcmp-badge--identity" title="Same name, different role id — rebuilt by hand instead of transported">
          rebuilt
        </span>
      )}
      {row.managedDrift && (
        <span className="rcmp-badge rcmp-badge--managed" title="managed / unmanaged differs between environments">
          managed state
        </span>
      )}
    </>
  )
}

export function RoleComparerWorkspace({ solutions }: Props) {
  const envKeys = useMemo(() => roleComparerService.listEnvKeys(), [])
  const [result, setResult] = useState<RoleComparerResult | null>(null)
  const [comparing, setComparing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<RoleComparerFilter>('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<{
    row: RoleComparerRow
    diff: RolePrivilegeDiff
  } | null>(null)

  // --- Scope: custom-only (default) and an optional release solution --------
  const releases = useMemo(
    () =>
      solutions.filter(
        (s) => s.kind === 'deployment' && !!s.recordId && !s.solutionMissing,
      ),
    [solutions],
  )
  const [scopeSolutionId, setScopeSolutionId] = useState('')
  const [includeSystem, setIncludeSystem] = useState(false)
  const [solutionRoleIds, setSolutionRoleIds] = useState<string[] | null>(null)
  const [scopeError, setScopeError] = useState<string | null>(null)

  const pickSolution = useCallback(async (id: string) => {
    setScopeSolutionId(id)
    setScopeError(null)
    if (!id) {
      setSolutionRoleIds(null)
      return
    }
    try {
      setSolutionRoleIds(await roleComparerService.listSolutionRoleIds(id))
    } catch (err) {
      setSolutionRoleIds([])
      setScopeError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const runCompare = useCallback(
    async (force: boolean) => {
      setComparing(true)
      setError(null)
      setProgress('Starting…')
      try {
        const next = await roleComparerService.compare(
          envKeys,
          setProgress,
          force,
        )
        setResult(next)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setComparing(false)
        setProgress('')
      }
    },
    [envKeys],
  )

  /**
   * Solution membership is expressed as role ids, so it can only be turned
   * into match keys once the host model is loaded — hence the dependency on
   * `result` rather than on the picker alone.
   */
  const solutionScope = useMemo(() => {
    if (!solutionRoleIds || !result) return null
    return solutionRoleKeysFrom(
      solutionRoleIds,
      roleComparerService.lastModels()[result.hostKey] ?? null,
    )
  }, [solutionRoleIds, result])

  // Scope narrows first; the chips and their counts describe what is scoped in.
  const scoped = useMemo(
    () =>
      result
        ? applyRoleScope(result.rows, {
            customOnly: !includeSystem,
            solutionRoleKeys: solutionScope?.keys ?? null,
          })
        : [],
    [result, includeSystem, solutionScope],
  )
  const counts = useMemo(() => roleComparerCounts(scoped), [scoped])
  const shown = useMemo(
    () => filterRoleRows(scoped, filter, search),
    [scoped, filter, search],
  )

  const openRow = useCallback(
    (row: RoleComparerRow) => {
      setOpen({
        row,
        diff: buildPrivilegeDiff(
          row.key,
          roleComparerService.lastModels(),
          envKeys,
        ),
      })
    },
    [envKeys],
  )

  const filters: { key: RoleComparerFilter; label: string; count: number }[] = [
    { key: 'all', label: 'In scope', count: counts.all },
    { key: 'drift', label: 'Privilege drift', count: counts.drift },
    { key: 'missing', label: 'Missing / target-only', count: counts.missing },
    { key: 'identity', label: 'Rebuilt', count: counts.identity },
    { key: 'managed', label: 'Managed state', count: counts.managed },
  ]

  const hiddenBySystemFilter =
    result && !includeSystem
      ? result.rows.length -
        applyRoleScope(result.rows, {
          customOnly: true,
          solutionRoleKeys: null,
        }).length
      : 0

  return (
    <div className="rcmp">
      <div className="state rcmp-intro">
        Compares security roles across the configured environments, matched{' '}
        <strong>by name</strong> — a role id only survives clean solution
        transport, so a role that was rebuilt by hand carries a different one
        (reported as <em>rebuilt</em>). By default only{' '}
        <strong>custom roles</strong> are shown; pick a release solution to
        narrow it to the roles that solution contains. Reads run as the
        connector service principal. <strong>Read-only:</strong> a drifting
        role is fixed by transporting it, not by editing the target.
      </div>

      <div className="validate-toolbar rcmp-scope">
        <SolutionSelect
          options={releases}
          value={scopeSolutionId}
          onChange={(id) => void pickSolution(id)}
          placeholder="All custom roles (no solution scope)"
        />
        {scopeSolutionId && (
          <button
            type="button"
            className="btn btn--small"
            onClick={() => void pickSolution('')}
          >
            Clear scope
          </button>
        )}
        <label className="rcmp-scope-toggle">
          <input
            type="checkbox"
            checked={includeSystem}
            onChange={(e) => setIncludeSystem(e.target.checked)}
          />
          Include system (managed) roles
        </label>
      </div>

      <div className="compare-controls rcmp-toolbar">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => runCompare(false)}
          disabled={comparing}
        >
          {comparing ? 'Comparing…' : 'Compare roles'}
        </button>
        <span className="muted rcmp-envs">
          {envKeys.map((key) => envLabel(key)).join(' · ')}
        </span>
        {result && !comparing && (
          <span className="cmp-sync">
            <span className="cmp-sync-time">
              Last sync {formatRelative(result.loadedAt)}
            </span>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => runCompare(true)}
            >
              ⟲ Refresh
            </button>
          </span>
        )}
      </div>

      {comparing && <div className="state">{progress || 'Comparing…'}</div>}
      {error && <div className="state state--error">{error}</div>}
      {scopeError && (
        <div className="state state--error">
          Could not read the solution’s components: {scopeError}
        </div>
      )}

      {result && (
        <div className="muted rcmp-scope-note">
          {solutionScope
            ? `Scoped to ${solutionScope.keys.size} role(s) in the selected solution.`
            : 'Showing all roles that are unmanaged in at least one environment.'}
          {hiddenBySystemFilter > 0 &&
            ` ${hiddenBySystemFilter} managed (system) role(s) hidden.`}
          {solutionScope && solutionScope.unresolved > 0 && (
            <>
              {' '}
              <strong>
                {solutionScope.unresolved} solution component(s) could not be
                matched to a role
              </strong>{' '}
              — they usually point at a business-unit copy rather than the root
              role, so those roles are missing from this scope.
            </>
          )}
        </div>
      )}

      {result && Object.keys(result.envErrors).length > 0 && (
        <div className="state state--error">
          <strong>Some environments could not be read.</strong> Their columns
          show “?” and are excluded from every finding — an unreadable
          environment is never reported as identical.
          <ul>
            {Object.entries(result.envErrors).map(([key, message]) => (
              <li key={key}>
                <strong>{envLabel(key)}:</strong> {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <>
          <div className="validate-toolbar rcmp-filters">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`chip ${filter === f.key ? 'chip--active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                {f.count !== undefined && (
                  <span className="chip-count">{f.count}</span>
                )}
              </button>
            ))}
            <input
              type="search"
              className="rcmp-search"
              placeholder="Find a role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <table className="ops-table rcmp-table">
            <thead>
              <tr>
                <th>Role</th>
                {result.envKeys.map((key) => (
                  <th key={key}>
                    {envLabel(key)}
                    {key === result.hostKey ? ' (host)' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={1 + result.envKeys.length} className="muted">
                    No role matches this filter.
                  </td>
                </tr>
              )}
              {shown.map((row) => (
                <tr
                  key={row.key}
                  className="rcmp-row"
                  onClick={() => openRow(row)}
                  title="Show the privilege differences"
                >
                  <td>
                    <div className="rcmp-name">{row.name}</div>
                    <div className="rcmp-badges">
                      <RowBadges row={row} />
                    </div>
                  </td>
                  {result.envKeys.map((key) => {
                    const cell = row.byEnv[key]
                    if (!cell)
                      return (
                        <td key={key} className="cmp-cell cmp-cell--unknown">
                          <span className="cmp-cell-body">?</span>
                          <span className="cmp-cell-info">not readable</span>
                        </td>
                      )
                    if (!cell.present)
                      return (
                        <td key={key} className="cmp-cell cmp-cell--missing">
                          <span className="cmp-cell-body">—</span>
                          <span className="cmp-cell-info">absent</span>
                        </td>
                      )
                    return (
                      <td
                        key={key}
                        className={`cmp-cell ${row.drift ? 'cmp-cell--drift' : ''}`}
                      >
                        <span className="cmp-cell-body">
                          {cell.privilegeCount} priv
                          {cell.miscCount > 0 ? ` + ${cell.miscCount} misc` : ''}
                        </span>
                        <span className="cmp-cell-info">
                          <code title="Fingerprint of the privilege set — equal means identical rights">
                            {cell.fingerprint}
                          </code>
                          {cell.isManaged ? ' · managed' : ' · unmanaged'}
                          {cell.copyCount > 1 ? ` · ${cell.copyCount} BU copies` : ''}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {open && (
        <RolePrivilegeDiffModal
          row={open.row}
          diff={open.diff}
          envKeys={result?.envKeys ?? envKeys}
          envLabel={envLabel}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
