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
import type { SecuritySnapshotSummary } from '../types/roleComparer'
import type { WorkingSolution } from '../types/solution'
import {
  applyRoleScope,
  buildPrivilegeDiff,
  filterRoleRows,
  roleComparerCounts,
  solutionRoleKeysFrom,
} from '../utils/roleCompare'
import {
  applyBaselineVerdict,
  baselineCounts,
  encodeBaseline,
  parseBaseline,
  serializeBaseline,
} from '../utils/securityBaseline'
import { securityBaselineService } from '../services/securityBaselineService'
import { captureBaselineExtras } from '../services/baselineCapture'
import { RolePrivilegeDiffModal } from './RolePrivilegeDiffModal'
import { SecurityConceptPanel } from './SecurityConceptPanel'
import { SolutionSelect } from './SolutionSelect'
import { useProvideHeaderInfo } from '../hooks/useHeaderInfo'

/**
 * Shown behind the ⓘ next to the page title. Declared at MODULE scope so its
 * identity is stable — inline JSX would re-register on every render (see
 * hooks/useHeaderInfo).
 */
const HEADER_INFO = (
  <>
    Compares security roles across the configured environments, matched{' '}
    <strong>by name</strong> — a role id only survives clean solution
    transport, so a role that was rebuilt by hand carries a different one
    (reported as <em>rebuilt</em>). By default only{' '}
    <strong>custom roles</strong> are loaded; pick a release solution to narrow
    it to the roles that solution contains. Reads run as the connector service
    principal. <strong>Read-only:</strong> a drifting role is fixed by
    transporting it, not by editing the target.
  </>
)

interface Props {
  /** Release solutions offered as the scope, as in the Process Comparer. */
  solutions: WorkingSolution[]
  /** Freezing a baseline is a deployment-manager act. */
  canManage: boolean
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
      {row.baseline?.changed && (
        <span className="rcmp-badge rcmp-badge--drift" title="Grants differ from the frozen baseline">
          changed since freeze
        </span>
      )}
      {row.baseline?.isNew && (
        <span className="rcmp-badge rcmp-badge--identity" title="Did not exist when the baseline was frozen">
          new since freeze
        </span>
      )}
      {row.baseline?.isGone && (
        <span className="rcmp-badge rcmp-badge--missing" title="Existed in the baseline, exists in no environment now">
          gone since freeze
        </span>
      )}
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

type SubTab = 'compare' | 'document'

function SubTabs({
  subTab,
  setSubTab,
}: {
  subTab: SubTab
  setSubTab: (next: SubTab) => void
}) {
  return (
    <nav className="subtabs">
      <button
        className={`subtab ${subTab === 'compare' ? 'subtab--active' : ''}`}
        onClick={() => setSubTab('compare')}
      >
        Compare
      </button>
      <button
        className={`subtab ${subTab === 'document' ? 'subtab--active' : ''}`}
        onClick={() => setSubTab('document')}
      >
        Document
      </button>
    </nav>
  )
}

export function RoleComparerWorkspace({ solutions, canManage }: Props) {
  useProvideHeaderInfo('About the Role Comparer', HEADER_INFO)
  const [subTab, setSubTab] = useState<SubTab>('compare')
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
  /** Scope signature the current result was loaded with (see runCompare). */
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [includeSystem, setIncludeSystem] = useState(false)
  const [solutionRoleIds, setSolutionRoleIds] = useState<string[] | null>(null)
  const [scopeError, setScopeError] = useState<string | null>(null)

  // --- Baseline: freeze the current state, compare against a frozen one -----
  const [baselines, setBaselines] = useState<SecuritySnapshotSummary[] | null>(
    null,
  )
  const [baselineId, setBaselineId] = useState('')
  const [baselinePayload, setBaselinePayload] = useState<string | null>(null)
  const [baselineBusy, setBaselineBusy] = useState(false)
  const [baselineError, setBaselineError] = useState<string | null>(null)

  const loadBaselines = useCallback(async () => {
    try {
      setBaselines(await securityBaselineService.list())
    } catch (err) {
      setBaselines([])
      setBaselineError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const pickBaseline = useCallback(
    async (id: string) => {
      setBaselineId(id)
      setBaselineError(null)
      if (!id) {
        setBaselinePayload(null)
        return
      }
      setBaselineBusy(true)
      try {
        const payload = await securityBaselineService.getPayload(id)
        setBaselinePayload(payload)
        if (!payload)
          setBaselineError('That baseline has no readable payload.')
      } catch (err) {
        setBaselinePayload(null)
        setBaselineError(err instanceof Error ? err.message : String(err))
      } finally {
        setBaselineBusy(false)
      }
    },
    [],
  )

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
      // The scope now decides what gets LOADED, so it is captured with the
      // result — changing it afterwards makes the result stale rather than
      // just re-filtering it.
      const scopeSignature = `${includeSystem ? 'sys' : 'custom'}|${scopeSolutionId}`
      try {
        const next = await roleComparerService.compare(
          envKeys,
          {
            includeSystem,
            limitToRoleIds: solutionRoleIds,
          },
          setProgress,
          force,
        )
        setLoadedScope(scopeSignature)
        setResult(next)
        // Loaded here rather than in a mount effect: a baseline is only
        // meaningful once the current models exist, and the react-compiler
        // rules keep state out of effects anyway.
        if (!baselines) void loadBaselines()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setComparing(false)
        setProgress('')
      }
    },
    [envKeys, baselines, loadBaselines, includeSystem, scopeSolutionId, solutionRoleIds],
  )

  const scopeSignature = `${includeSystem ? 'sys' : 'custom'}|${scopeSolutionId}`
  const scopeStale = !!result && loadedScope !== null && loadedScope !== scopeSignature

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

  /**
   * In baseline mode every row gains its verdict, and roles that vanished
   * since the freeze are appended — so this has to happen BEFORE the scope
   * narrows, otherwise those rows would never reach it.
   */
  const withBaseline = useMemo(() => {
    if (!result) return null
    const payload = parseBaseline(baselinePayload)
    if (!payload) return result
    return applyBaselineVerdict(
      result,
      roleComparerService.lastModels(),
      payload,
    )
  }, [result, baselinePayload])

  const baselineMode = !!baselinePayload && !!withBaseline?.rows.some((r) => r.baseline)

  // Scope narrows next; the chips and their counts describe what is scoped in.
  const scoped = useMemo(
    () =>
      withBaseline
        ? applyRoleScope(withBaseline.rows, {
            customOnly: !includeSystem,
            solutionRoleKeys: solutionScope?.keys ?? null,
          })
        : [],
    [withBaseline, includeSystem, solutionScope],
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

  const bCounts = useMemo(() => baselineCounts(scoped), [scoped])

  const filters: { key: RoleComparerFilter; label: string; count: number }[] =
    baselineMode
      ? [
          { key: 'all', label: 'In scope', count: counts.all },
          { key: 'changed', label: 'Changed since freeze', count: bCounts.changed },
          { key: 'new', label: 'New since freeze', count: bCounts.added },
          { key: 'gone', label: 'Gone since freeze', count: bCounts.gone },
          { key: 'drift', label: 'Cross-env drift', count: counts.drift },
        ]
      : [
          { key: 'all', label: 'In scope', count: counts.all },
          { key: 'drift', label: 'Privilege drift', count: counts.drift },
          { key: 'missing', label: 'Missing / target-only', count: counts.missing },
          { key: 'identity', label: 'Rebuilt', count: counts.identity },
          { key: 'managed', label: 'Managed state', count: counts.managed },
        ]

  // --- Freeze ---------------------------------------------------------------
  const [freezing, setFreezing] = useState(false)
  const [freezeName, setFreezeName] = useState('')

  const scopeDescription = solutionScope
    ? `Solution: ${releases.find((s) => s.id === scopeSolutionId)?.uniqueName ?? scopeSolutionId}`
    : includeSystem
      ? 'All roles'
      : 'Custom roles'

  const doFreeze = useCallback(async () => {
    if (!result) return
    setBaselineBusy(true)
    setBaselineError(null)
    try {
      /*
       * A freeze is rare and deliberate, so unlike a comparison it pays for
       * the heavy reads: business units and teams, field security and the
       * audit configuration. Sections that fail are left out and reported —
       * an absent chapter reads as "not captured", never as "none".
       */
      setProgress('Capturing org, field security and audit…')
      const captured = await captureBaselineExtras(result.envKeys, setProgress)
      // Freeze exactly what is scoped in — not all ~286 roles. Smaller, and
      // it matches what the user was actually looking at.
      const payload = serializeBaseline(
        encodeBaseline(
          roleComparerService.lastModels(),
          result.envKeys,
          new Set(scoped.map((r) => r.key)),
          captured.extras,
        ),
      )
      if (captured.errors.length)
        setBaselineError(
          `Frozen, but some sections could not be read: ${captured.errors
            .map((e) => `${e.envKey} — ${e.section}`)
            .join('; ')}. The document reports them as “not captured”.`,
        )
      const saved = await securityBaselineService.save({
        name: freezeName.trim() || `Baseline ${new Date().toLocaleDateString()}`,
        scope: scopeDescription,
        envKeys: result.envKeys,
        roleCount: scoped.length,
        payload,
      })
      setBaselines((list) => [saved, ...(list ?? [])])
      setFreezing(false)
      setFreezeName('')
    } catch (err) {
      setBaselineError(err instanceof Error ? err.message : String(err))
    } finally {
      setBaselineBusy(false)
      setProgress('')
    }
  }, [result, scoped, freezeName, scopeDescription])

  const activeBaseline = baselines?.find((b) => b.id === baselineId) ?? null

  /**
   * The Document tab needs the baseline list even when no comparison has run,
   * so it is fetched on first switch rather than in a mount effect.
   */
  const openSubTab = (next: SubTab) => {
    setSubTab(next)
    if (next === 'document' && !baselines) void loadBaselines()
  }

  const hiddenBySystemFilter =
    result && !includeSystem
      ? result.rows.length -
        applyRoleScope(result.rows, {
          customOnly: true,
          solutionRoleKeys: null,
        }).length
      : 0

  if (subTab === 'document')
    return (
      <div className="rcmp">
        <SubTabs subTab={subTab} setSubTab={openSubTab} />
        <SecurityConceptPanel baselines={baselines ?? []} />
      </div>
    )

  return (
    <div className="rcmp">
      <SubTabs subTab={subTab} setSubTab={openSubTab} />
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
      {scopeStale && !comparing && (
        <div className="state">
          <strong>The scope changed since the last comparison.</strong> The
          scope decides which roles are loaded at all, so the table below still
          shows the previous selection — run <em>Compare roles</em> again.
        </div>
      )}
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
        <div className="validate-toolbar rcmp-baseline">
          <label className="rcmp-baseline-label" htmlFor="rcmp-baseline-pick">
            Compare against
          </label>
          <select
            id="rcmp-baseline-pick"
            value={baselineId}
            disabled={baselineBusy}
            onChange={(e) => void pickBaseline(e.target.value)}
          >
            <option value="">Live state (host as baseline)</option>
            {(baselines ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.frozenOn
                  ? ` — frozen ${new Date(b.frozenOn).toLocaleDateString()}`
                  : ''}
              </option>
            ))}
          </select>
          {activeBaseline && (
            <span className="muted rcmp-baseline-meta">
              {activeBaseline.scope} · {activeBaseline.roleCount} roles
              {activeBaseline.frozenBy ? ` · by ${activeBaseline.frozenBy}` : ''}
            </span>
          )}
          {canManage && !freezing && (
            <button
              type="button"
              className="btn btn--small rcmp-freeze-btn"
              onClick={() => setFreezing(true)}
              disabled={baselineBusy || scoped.length === 0}
              title="Store the roles currently in scope as a frozen baseline"
            >
              ❄ Freeze current state…
            </button>
          )}
          {freezing && (
            <span className="rcmp-freeze-form">
              <input
                type="text"
                value={freezeName}
                placeholder={`Baseline ${new Date().toLocaleDateString()}`}
                onChange={(e) => setFreezeName(e.target.value)}
              />
              <button
                type="button"
                className="btn btn--primary btn--small"
                onClick={() => void doFreeze()}
                disabled={baselineBusy}
              >
                {baselineBusy ? 'Freezing…' : `Freeze ${scoped.length} role(s)`}
              </button>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => setFreezing(false)}
                disabled={baselineBusy}
              >
                Cancel
              </button>
            </span>
          )}
        </div>
      )}

      {baselineError && (
        <div className="state state--error">{baselineError}</div>
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
                          {cell.isManaged ? 'managed' : 'unmanaged'}
                          {/* In baseline mode the number answers "changed
                              since the freeze"; otherwise "differs from the
                              reference environment". Showing both would be
                              two different questions in one line. */}
                          {baselineMode ? (
                            row.baseline?.changedByEnv[key] ? (
                              <strong
                                className="rcmp-cell-drift"
                                title="Privileges granted differently than when the baseline was frozen"
                              >
                                {' · '}
                                {row.baseline.changedByEnv[key]} changed
                              </strong>
                            ) : row.baseline?.changedByEnv[key] === null ? (
                              <span title="The baseline did not capture this environment for this role">
                                {' · not in baseline'}
                              </span>
                            ) : null
                          ) : cell.driftCount ? (
                            <strong
                              className="rcmp-cell-drift"
                              title="Privileges granted differently than in the reference environment"
                            >
                              {' · '}
                              {cell.driftCount} differing
                            </strong>
                          ) : null}
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
