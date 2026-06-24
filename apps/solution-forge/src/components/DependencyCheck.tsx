import { useMemo, useState } from 'react'
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

  const running = run?.running ?? false
  const progress = run?.progress ?? ''
  const result = run?.result ?? null
  const error = run?.error ?? null

  const startCheck = () => {
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
  const others = result?.items.filter((i) => i.targetStatus !== 'missing') ?? []

  // Missing dependencies grouped by required component type — collapsible
  // sections, like the Workbench component overview.
  const missingByType = useMemo(() => {
    const groups = new Map<string, DependencyItem[]>()
    for (const item of result?.items ?? []) {
      if (item.targetStatus !== 'missing') continue
      const list = groups.get(item.requiredTypeName)
      if (list) list.push(item)
      else groups.set(item.requiredTypeName, [item])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [result])
  const isOpen = (typeName: string) => !collapsed[typeName]
  const toggle = (typeName: string) =>
    setCollapsed((prev) => ({ ...prev, [typeName]: isOpen(typeName) }))

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
          {targetEnvs.map((env) => (
            <button
              key={env.key}
              className={`chip ${envKey === env.key ? 'chip--active' : ''}`}
              onClick={() => onEnvChange(env.key as 'uat' | 'prod')}
            >
              {env.label}
            </button>
          ))}
        </div>
        <button
          className="btn btn--primary"
          disabled={running}
          onClick={startCheck}
        >
          {running ? `Checking… ${progress}` : 'Dependency Check'}
        </button>
      </div>

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
          {missing.length === 0 && (
            <div className="state state--success">
              Nothing is missing in {envLabel} — the import should not fail
              on dependencies.
            </div>
          )}

          {missing.length > 0 && (
            <section className="card">
              <h3 className="card-title">
                Missing in {envLabel} ({missing.length}) — import would fail
              </h3>
              {addError && <div className="state state--error">{addError}</div>}
              {missingByType.map(([typeName, items]) => {
                const open = isOpen(typeName)
                return (
                  <div key={typeName} className="component-group">
                    <button
                      className="component-group-toggle"
                      onClick={() => toggle(typeName)}
                      aria-expanded={open}
                    >
                      <span
                        className={`component-group-chevron ${
                          open ? 'component-group-chevron--open' : ''
                        }`}
                      >
                        ▸
                      </span>
                      <span className="component-group-title">{typeName}</span>
                      <span className="muted">({items.length})</span>
                    </button>
                    {open && (
                      <ul className="dep-list">{items.map(renderItem)}</ul>
                    )}
                  </div>
                )
              })}
            </section>
          )}

          {others.length > 0 && (
            <p className="muted dep-hint">
              {others.length} further required component
              {others.length === 1 ? '' : 's'} (not part of the solution) are
              already present in {envLabel} or not verifiable from here —
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
