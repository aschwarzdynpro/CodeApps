import { useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import type {
  DependencyCheckResult,
  DependencyItem,
} from '../types/dependency'
import { ENVIRONMENTS } from '../config'
import { solutionService } from '../services/solutionService'
import { SolutionSelect } from './SolutionSelect'
import { shortGuid } from '../utils/format'

interface Props {
  solutions: WorkingSolution[]
}

/**
 * Dependency check for a release solution: RetrieveMissingDependencies
 * lists every required component the solution doesn't contain; each one is
 * checked for presence in the selected target environment. Missing ones
 * can be pulled into the solution directly.
 */
export function DependencyCheck({ solutions }: Props) {
  const releases = solutions.filter(
    (s) => s.kind === 'deployment' && !s.solutionMissing && s.recordId,
  )
  const targetEnvs = ENVIRONMENTS.filter(
    (e) => e.key === 'uat' || e.key === 'prod',
  )

  const [solutionId, setSolutionId] = useState('')
  const [envKey, setEnvKey] = useState<'uat' | 'prod'>('uat')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<DependencyCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addBusyId, setAddBusyId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [addError, setAddError] = useState<string | null>(null)

  const solution = releases.find((s) => s.id === solutionId) ?? null

  const run = async () => {
    if (!solution) return
    setRunning(true)
    setResult(null)
    setError(null)
    setAddedIds(new Set())
    setAddError(null)
    setProgress('Starting…')
    try {
      const res = await solutionService.checkDependencies(
        solution,
        envKey,
        (msg) => setProgress(msg),
      )
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const addToSolution = async (item: DependencyItem) => {
    if (!solution) return
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
    targetEnvs.find((e) => e.key === envKey)?.label ?? envKey.toUpperCase()
  const missing = result?.items.filter((i) => i.targetStatus === 'missing') ?? []
  const others = result?.items.filter((i) => i.targetStatus !== 'missing') ?? []

  const renderItem = (item: DependencyItem, withAdd: boolean) => {
    const added = addedIds.has(item.requiredObjectId)
    return (
      <li
        key={`${item.requiredObjectId}-${item.dependentObjectId}`}
        className="dep-row"
        title={item.requiredObjectId}
      >
        <span className="merge-plan-type">{item.requiredTypeName}</span>
        <span className="dep-name">
          {item.requiredName ?? shortGuid(item.requiredObjectId)}
          <span className="dep-required-by muted">
            required by {item.dependentTypeName}{' '}
            {item.dependentName ?? shortGuid(item.dependentObjectId)}
          </span>
        </span>
        {item.targetStatus === 'present' && (
          <span className="state-pill state-pill--on">in {envLabel}</span>
        )}
        {item.targetStatus === 'unknown' && (
          <span
            className="state-pill state-pill--neutral"
            title="Metadata components (tables, columns, choices, …) can't be verified against the target from here."
          >
            not verifiable
          </span>
        )}
        {item.targetStatus === 'missing' && (
          <span className="state-pill state-pill--missing">
            missing in {envLabel}
          </span>
        )}
        {withAdd &&
          (added ? (
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
          ))}
      </li>
    )
  }

  return (
    <div>
      <div className="card compare-controls">
        <div className="compare-picker">
          <span className="form-label">Release solution</span>
          <SolutionSelect
            options={releases}
            value={solutionId}
            onChange={(id) => {
              setSolutionId(id)
              setResult(null)
              setError(null)
            }}
            placeholder="Select a release solution…"
          />
        </div>
        <div className="dep-controls">
          <div className="chips">
            {targetEnvs.map((env) => (
              <button
                key={env.key}
                className={`chip ${envKey === env.key ? 'chip--active' : ''}`}
                onClick={() => setEnvKey(env.key as 'uat' | 'prod')}
              >
                {env.label}
              </button>
            ))}
          </div>
          <button
            className="btn btn--primary"
            disabled={!solution || running}
            onClick={() => void run()}
          >
            {running ? `Checking… ${progress}` : 'Dependency Check'}
          </button>
        </div>
      </div>

      {error && <div className="state state--error">{error}</div>}
      {result?.targetUnreachable && (
        <div className="state state--error">
          Some target lookups failed — affected components show “not
          verifiable”. See the browser console for details.
        </div>
      )}

      {!running && result && (
        <>
          {result.items.length === 0 && (
            <div className="state state--success">
              No missing dependencies — every required component is part of
              the solution itself.
            </div>
          )}

          {missing.length > 0 && (
            <section className="card">
              <h3 className="card-title">
                Missing in {envLabel} ({missing.length}) — import would fail
              </h3>
              {addError && <div className="state state--error">{addError}</div>}
              <ul className="dep-list">
                {missing.map((item) => renderItem(item, true))}
              </ul>
            </section>
          )}

          {others.length > 0 && (
            <section className="card">
              <h3 className="card-title">
                Required dependencies ({others.length})
              </h3>
              <p className="muted dep-hint">
                Needed by the solution but not contained in it — already
                present in {envLabel} or not verifiable from here.
              </p>
              <ul className="dep-list">
                {others.map((item) => renderItem(item, false))}
              </ul>
            </section>
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
          Pick a release solution and a target environment — the check lists
          required components the solution doesn't contain and whether they
          exist in the target.
        </div>
      )}
    </div>
  )
}
