import { useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import type {
  ComponentLayerStack,
  LayerInspectionResult,
} from '../types/layers'
import { ENVIRONMENTS } from '../config'
import { solutionService } from '../services/solutionService'
import { SolutionSelect } from './SolutionSelect'

interface Props {
  solutions: WorkingSolution[]
}

/**
 * Layer inspector: for every component of a solution, the
 * msdyn_componentlayer stack in UAT/PROD is resolved. An unmanaged
 * "Active" layer on top of managed layers means someone customized the
 * target directly — those changes mask whatever the next import delivers.
 */
export function LayerInspector({ solutions }: Props) {
  // Any real solution qualifies (releases before a deployment, features
  // before a merge); duplicate-link rows must not show up twice.
  const candidates = solutions.filter(
    (s, index) =>
      !s.solutionMissing &&
      solutions.findIndex((o) => o.id === s.id) === index,
  )
  const targetEnvs = ENVIRONMENTS.filter(
    (e) => e.key === 'uat' || e.key === 'prod',
  )

  const [solutionId, setSolutionId] = useState('')
  const [envKey, setEnvKey] = useState<'uat' | 'prod'>('uat')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [result, setResult] = useState<LayerInspectionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const solution = candidates.find((s) => s.id === solutionId) ?? null

  const run = async () => {
    if (!solution) return
    setRunning(true)
    setResult(null)
    setError(null)
    setProgress(null)
    try {
      const res = await solutionService.inspectLayers(
        solution,
        envKey,
        (done, total) => setProgress([done, total]),
      )
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const envLabel =
    targetEnvs.find((e) => e.key === envKey)?.label ?? envKey.toUpperCase()
  const byVerdict = (verdict: ComponentLayerStack['verdict']) =>
    result?.stacks.filter((s) => s.verdict === verdict) ?? []
  const overridden = byVerdict('overridden')
  const unmanagedOnly = byVerdict('unmanagedOnly')
  const cleanCount = byVerdict('clean').length
  const absentCount = byVerdict('absent').length
  const unsupportedCount = byVerdict('unsupported').length
  const errorCount = byVerdict('error').length

  const renderStack = (stack: ComponentLayerStack) => (
    <li
      key={`${stack.component.typeCode}-${stack.component.objectId}`}
      className="dep-row"
      title={stack.component.objectId}
    >
      <span className="merge-plan-type">{stack.component.typeName}</span>
      <span className="dep-name">
        {stack.component.displayName}
        <span className="layer-stack">
          {stack.layers.map((layer) => (
            <span
              key={layer.id}
              className={`layer-chip ${
                layer.solutionName === 'Active' ? 'layer-chip--active' : ''
              }`}
              title={[
                layer.publisherName,
                layer.solutionVersion ? `v${layer.solutionVersion}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              {layer.solutionName === 'Active'
                ? '⚠ Active (unmanaged)'
                : layer.solutionName}
            </span>
          ))}
        </span>
      </span>
    </li>
  )

  return (
    <div>
      <div className="card compare-controls">
        <div className="compare-picker">
          <span className="form-label">Solution</span>
          <SolutionSelect
            options={candidates}
            value={solutionId}
            onChange={(id) => {
              setSolutionId(id)
              setResult(null)
              setError(null)
            }}
            placeholder="Select a solution…"
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
            {running
              ? progress
                ? `Inspecting… ${progress[0]}/${progress[1]}`
                : 'Inspecting…'
              : 'Inspect Layers'}
          </button>
        </div>
      </div>

      {error && <div className="state state--error">{error}</div>}
      {!!result?.warnings.length && (
        <div className="state state--error">
          <ul className="merge-errors">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {!running && result && (
        <>
          {overridden.length === 0 && unmanagedOnly.length === 0 && (
            <div className="state state--success">
              No unmanaged layers over this solution's components in{' '}
              {envLabel} — imports take effect unmasked.
            </div>
          )}

          {overridden.length > 0 && (
            <section className="card">
              <h3 className="card-title">
                Unmanaged layer over managed component in {envLabel} (
                {overridden.length}) — imported changes are masked
              </h3>
              <p className="muted dep-hint">
                Someone customized these components directly in {envLabel}.
                The unmanaged "Active" layer wins over every managed layer —
                remove the active customizations there (maker portal: See
                solution layers → Remove active customizations) before
                relying on a deployment.
              </p>
              <ul className="dep-list">{overridden.map(renderStack)}</ul>
            </section>
          )}

          {unmanagedOnly.length > 0 && (
            <section className="card">
              <h3 className="card-title">
                Unmanaged-only in {envLabel} ({unmanagedOnly.length}) — created
                directly in the target
              </h3>
              <p className="muted dep-hint">
                These components exist in {envLabel} only as unmanaged
                customizations — an import of the same component creates a
                managed layer underneath, but the unmanaged version keeps
                winning.
              </p>
              <ul className="dep-list">{unmanagedOnly.map(renderStack)}</ul>
            </section>
          )}

          <p className="muted dep-hint">
            {result.stacks.length} component
            {result.stacks.length === 1 ? '' : 's'} checked in {envLabel}:{' '}
            {cleanCount} without unmanaged layer, {absentCount} not present in
            the target
            {unsupportedCount > 0 &&
              `, ${unsupportedCount} of a type without layer data`}
            {errorCount > 0 && `, ${errorCount} failed`}
            .
          </p>
        </>
      )}

      {!running && !result && !error && (
        <div className="state">
          Pick a solution and a target environment — the inspector resolves
          each component's solution layers there and flags unmanaged "Active"
          layers masking managed (deployed) state.
        </div>
      )}
    </div>
  )
}
