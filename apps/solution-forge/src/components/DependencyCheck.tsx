import { useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import type { DependencyItem } from '../types/dependency'
import type { ReadinessRun } from '../hooks/useReadinessRun'
import { ENVIRONMENTS } from '../config'
import { solutionService } from '../services/solutionService'
import { shortGuid } from '../utils/format'

interface Props {
  /** Release solution + target env from the shared Validate selector. */
  solution: WorkingSolution
  envKey: 'uat' | 'prod'
  onEnvChange: (envKey: 'uat' | 'prod') => void
  /** The lifted check for this solution+env (null until first run). */
  run: ReadinessRun | null
  /** Start (or re-run) the lifted check — survives tab navigation. */
  onCheck: () => void
}

/**
 * Dependency check for a release solution: RetrieveMissingDependencies
 * lists every required component the solution doesn't contain; each one is
 * checked for presence in the selected target environment. Missing ones
 * can be pulled into the solution directly. The long-running check itself is
 * lifted to App (see {@link ReadinessRun}) so it keeps going while navigating
 * away; only the add-to-solution interaction stays local here.
 */
export function DependencyCheck({
  solution,
  envKey,
  onEnvChange,
  run,
  onCheck,
}: Props) {
  const [addBusyId, setAddBusyId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [addError, setAddError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  // Computed per render (not module-level) so it reflects the runtime config
  // loaded from Dataverse via applyRuntimeConfig (ENVIRONMENTS is a live binding).
  const targetEnvs = ENVIRONMENTS.filter(
    (e) => e.key === 'uat' || e.key === 'prod',
  )
  // The check needs a TARGET env to test presence against; with only the current
  // environment configured there is nothing to check, so it is disabled.
  const noTarget = targetEnvs.length === 0

  const running = run?.running ?? false
  const progress = run?.progress ?? ''
  const result = run?.result ?? null
  const error = run?.error ?? null

  const startCheck = () => {
    if (noTarget) return
    setAddedIds(new Set())
    setAddError(null)
    onCheck()
  }

  const addToSolution = async (item: DependencyItem) => {
    setAddBusyId(item.requiredObjectId)
    setAddError(null)
    try {
      await solutionService.addDependencyToSolution(
        solution.uniqueName,
        item.requiredObjectId,
        item.requiredType,
      )
      setAddedIds((prev) => new Set(prev).add(item.requiredObjectId))
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err))
    } finally {
      setAddBusyId(null)
    }
  }

  const envLabel =
    ENVIRONMENTS.find((e) => e.key === envKey)?.label ?? envKey.toUpperCase()
  const missing = result?.items.filter((i) => i.targetStatus === 'missing') ?? []
  // "unknown" = presence in the target could NOT be verified (metadata types,
  // unmapped component types). These are NOT safe: real imports fail on exactly
  // these (columns, custom controls, connection references). They must never be
  // folded into a green verdict — see the WaldmannCore false-green incident.
  const unknown = result?.items.filter((i) => i.targetStatus === 'unknown') ?? []
  const present = result?.items.filter((i) => i.targetStatus === 'present') ?? []

  // Required components grouped by type — collapsible sections, used for both
  // the "missing" and the "could not verify" lists. (Plain compute: cheap, and
  // the React Compiler memoizes it.)
  const groupByStatus = (status: DependencyItem['targetStatus']) => {
    const groups = new Map<string, DependencyItem[]>()
    for (const item of result?.items ?? []) {
      if (item.targetStatus !== status) continue
      const list = groups.get(item.requiredTypeName)
      if (list) list.push(item)
      else groups.set(item.requiredTypeName, [item])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }
  const missingByType = groupByStatus('missing')
  const unknownByType = groupByStatus('unknown')
  // Collapse keys are section-qualified — a type can appear in both lists.
  const isOpen = (key: string) => !collapsed[key]
  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: isOpen(key) }))

  const renderGroup = (
    groupKey: string,
    title: string,
    items: DependencyItem[],
  ) => {
    const open = isOpen(groupKey)
    return (
      <div key={groupKey} className="component-group">
        <button
          className="component-group-toggle"
          onClick={() => toggle(groupKey)}
          aria-expanded={open}
        >
          <span
            className={`component-group-chevron ${
              open ? 'component-group-chevron--open' : ''
            }`}
          >
            ▸
          </span>
          <span className="component-group-title">{title}</span>
          <span className="muted">({items.length})</span>
        </button>
        {open && <ul className="dep-list">{items.map(renderItem)}</ul>}
      </div>
    )
  }

  const renderItem = (item: DependencyItem) => {
    const added = addedIds.has(item.requiredObjectId)
    return (
      <li
        key={`${item.requiredObjectId}-${item.dependentObjectId}`}
        className="dep-row"
        title={item.requiredObjectId}
      >
        <span className="dep-name">
          {item.requiredName ?? shortGuid(item.requiredObjectId)}
          <span className="dep-required-by muted">
            required by {item.dependentTypeName}{' '}
            {item.dependentName ?? shortGuid(item.dependentObjectId)}
          </span>
        </span>
        {added ? (
          <span className="dep-added">Added ✓</span>
        ) : (
          <button
            className="btn btn--small"
            disabled={addBusyId !== null}
            onClick={() => void addToSolution(item)}
          >
            {addBusyId === item.requiredObjectId
              ? 'Adding…'
              : 'Add to Solution'}
          </button>
        )}
      </li>
    )
  }

  return (
    <div>
      <div className="validate-toolbar">
        <div className="chips" title="Target environment for the check">
          {noTarget ? (
            <span className="muted">No target environment</span>
          ) : (
            targetEnvs.map((env) => (
              <button
                key={env.key}
                className={`chip ${envKey === env.key ? 'chip--active' : ''}`}
                onClick={() => onEnvChange(env.key as 'uat' | 'prod')}
              >
                {env.label}
              </button>
            ))
          )}
        </div>
        <button
          className="btn btn--primary"
          disabled={running || noTarget}
          onClick={startCheck}
        >
          {running ? `Checking… ${progress}` : 'Dependency Check'}
        </button>
      </div>

      {noTarget && (
        <div className="state state--warn">
          The dependency check verifies required components against a{' '}
          <strong>target</strong> environment. Only the current environment is
          configured — add a UAT/PROD target (in the{' '}
          <code>pro_environmentconfig</code> table) to enable it.
        </div>
      )}

      {error && <div className="state state--error">{error}</div>}
      {!!result?.lookupWarnings?.length && (
        <div className="state state--error">
          Some lookups failed — the result may be incomplete (details in
          the browser console):
          <ul className="merge-errors">
            {result.lookupWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {!running && result && (
        <>
          {missing.length === 0 && unknown.length === 0 && (
            <div className="state state--success">
              Nothing is missing in {envLabel} — all required components are
              present; the import should not fail on dependencies.
            </div>
          )}

          {addError && <div className="state state--error">{addError}</div>}

          {missing.length > 0 && (
            <section className="card">
              <h3 className="card-title">
                Missing in {envLabel} ({missing.length}) — import would fail
              </h3>
              {missingByType.map(([typeName, items]) =>
                renderGroup(`missing:${typeName}`, typeName, items),
              )}
            </section>
          )}

          {unknown.length > 0 && (
            <section className="card">
              <h3 className="card-title">
                Could not verify in {envLabel} ({unknown.length}) — the import
                may still fail on these
              </h3>
              <p className="muted dep-hint">
                These required components can&apos;t be checked from here
                (columns, custom controls, connection references,
                relationships, …). If they aren&apos;t already in {envLabel},
                use <strong>Add to Solution</strong> so they ship with it.
              </p>
              {unknownByType.map(([typeName, items]) =>
                renderGroup(`unknown:${typeName}`, typeName, items),
              )}
            </section>
          )}

          {present.length > 0 && (
            <p className="muted dep-hint">
              {present.length} required component
              {present.length === 1 ? '' : 's'} already present in {envLabel} —
              nothing to do for those.
            </p>
          )}

          {addedIds.size > 0 && (
            <div className="state state--success">
              {addedIds.size} component{addedIds.size === 1 ? '' : 's'} added
              to {solution?.title} — re-run the check to refresh the result.
            </div>
          )}
        </>
      )}

      {!running && !result && !error && (
        <div className="state">
          Click <strong>Dependency Check</strong> — required components{' '}
          {solution.title} doesn't contain are listed and checked for presence
          in {envLabel}.
        </div>
      )}
    </div>
  )
}
