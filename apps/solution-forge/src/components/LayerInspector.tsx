import { useMemo, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import type { AlmComponentRef, EnvKey } from '../types/comparison'
import type {
  ComponentLayerStack,
  LayerSection,
  LayerVerdict,
} from '../types/layers'
import { ENVIRONMENTS } from '../config'
import { solutionService } from '../services/solutionService'
import { SolutionSelect } from './SolutionSelect'
import { ContentDiffModal } from './ContentDiffModal'

interface Props {
  solutions: WorkingSolution[]
}

/** Component types whose definition can be diffed (workflow table / scripts). */
const DIFFABLE_TYPES: Record<number, AlmComponentRef['kind']> = {
  29: 'workflow', // cloud flows / workflows / business rules share the table
  61: 'webresource',
}

/** Groups with at most this many components start expanded. */
const AUTO_EXPAND_LIMIT = 12

const VERDICT_BADGE: Record<LayerVerdict, { label: string; cls: string }> = {
  overridden: { label: '⚠ Unmanaged over managed', cls: 'lv-badge--overridden' },
  unmanagedOnly: { label: 'Unmanaged only', cls: 'lv-badge--unmanagedonly' },
  absent: { label: 'Missing', cls: 'lv-badge--absent' },
  clean: { label: 'Clean', cls: 'lv-badge--clean' },
  unsupported: { label: 'No layer data', cls: 'lv-badge--unsupported' },
  error: { label: 'Lookup failed', cls: 'lv-badge--error' },
}

/** Verdicts that count as an actionable issue (drive default-expand). */
const ISSUE_VERDICTS = new Set<LayerVerdict>(['overridden', 'unmanagedOnly', 'absent'])

/** Filter chips above the result list: missing vs. unmanaged layers. */
type LayerFilter = 'missing' | 'unmanaged' | null

/** Verdicts that have an unmanaged "Active" layer (over managed or alone). */
const UNMANAGED_VERDICTS = new Set<LayerVerdict>(['overridden', 'unmanagedOnly'])

const matchesFilter = (verdict: LayerVerdict, filter: LayerFilter) =>
  filter === null ||
  (filter === 'missing' ? verdict === 'absent' : UNMANAGED_VERDICTS.has(verdict))

/**
 * Layer inspector: for every component of a solution, the
 * msdyn_componentlayer stack in the chosen target environment. Flags
 * unmanaged "Active" layers over managed components (deployed changes
 * masked) and components missing in the target. Sections appear per
 * component type as they finish; diffable types offer a DEV-vs-target diff.
 */
export function LayerInspector({ solutions }: Props) {
  // Release solutions only (consistent with the other ALM tabs).
  const candidates = solutions.filter(
    (s, index) =>
      s.kind === 'deployment' &&
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
  const [sections, setSections] = useState<LayerSection[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)
  // Filter the result list to one finding category (chips above the list).
  const [layerFilter, setLayerFilter] = useState<LayerFilter>(null)
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>(
    {},
  )
  const [diffTarget, setDiffTarget] = useState<{
    ref: AlmComponentRef
    envs: EnvKey[]
  } | null>(null)
  // Active-layer removal: the row awaiting confirmation, the set of object
  // ids currently being removed, and a per-component outcome note.
  const [removeTarget, setRemoveTarget] = useState<ComponentLayerStack | null>(
    null,
  )
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const [removeNotes, setRemoveNotes] = useState<
    Record<string, { ok: boolean; message: string }>
  >({})

  const solution = candidates.find((s) => s.id === solutionId) ?? null
  const envLabel =
    targetEnvs.find((e) => e.key === envKey)?.label ?? envKey.toUpperCase()

  const run = async () => {
    if (!solution) return
    setRunning(true)
    setSections([])
    setWarnings([])
    setError(null)
    setProgress(null)
    setGroupOverrides({})
    setLayerFilter(null)
    setRemoveNotes({})
    setRan(true)
    try {
      const res = await solutionService.inspectLayers(
        solution,
        envKey,
        (done, total) => setProgress([done, total]),
        (section) => setSections((prev) => [...prev, section]),
      )
      setWarnings(res.warnings)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const counts = useMemo(() => {
    const c: Record<LayerVerdict, number> = {
      overridden: 0,
      unmanagedOnly: 0,
      absent: 0,
      clean: 0,
      unsupported: 0,
      error: 0,
    }
    for (const s of sections) for (const st of s.stacks) c[st.verdict]++
    return c
  }, [sections])

  const missingCount = counts.absent
  const unmanagedCount = counts.overridden + counts.unmanagedOnly

  // Sections restricted to the active filter; sections with no matching
  // component drop out entirely.
  const visibleSections = useMemo(
    () =>
      sections
        .map((s) => ({
          ...s,
          stacks: s.stacks.filter((st) => matchesFilter(st.verdict, layerFilter)),
        }))
        .filter((s) => s.stacks.length > 0),
    [sections, layerFilter],
  )

  const isExpanded = (typeName: string, stacks: ComponentLayerStack[]) =>
    groupOverrides[typeName] ??
    (layerFilter !== null ||
      stacks.length <= AUTO_EXPAND_LIMIT ||
      stacks.some((s) => ISSUE_VERDICTS.has(s.verdict)))
  const toggleGroup = (typeName: string, stacks: ComponentLayerStack[]) =>
    setGroupOverrides((prev) => ({
      ...prev,
      [typeName]: !isExpanded(typeName, stacks),
    }))

  const openDiff = (stack: ComponentLayerStack) => {
    const kind = DIFFABLE_TYPES[stack.component.typeCode]
    if (!kind) return
    setDiffTarget({
      ref: {
        objectId: stack.component.objectId,
        kind,
        typeCode: stack.component.typeCode,
        typeName: stack.component.typeName,
        name: stack.component.displayName,
      },
      envs: ['dev', envKey],
    })
  }

  /** Replace one component's stack in place after a removal attempt. */
  const applyUpdatedStack = (updated: ComponentLayerStack) =>
    setSections((prev) =>
      prev.map((s) =>
        s.typeCode === updated.component.typeCode
          ? {
              ...s,
              stacks: s.stacks.map((st) =>
                st.component.objectId === updated.component.objectId
                  ? updated
                  : st,
              ),
            }
          : s,
      ),
    )

  const performRemove = async (stack: ComponentLayerStack) => {
    const id = stack.component.objectId
    setRemoveTarget(null)
    setRemoving((prev) => new Set(prev).add(id))
    setRemoveNotes((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    try {
      const result = await solutionService.removeActiveLayer(
        envKey,
        stack.component,
      )
      applyUpdatedStack(result.stack)
      setRemoveNotes((prev) => ({
        ...prev,
        [id]: result.removed
          ? { ok: true, message: `Active layer removed in ${envLabel}.` }
          : {
              ok: false,
              message: `No change in ${envLabel} — the service principal may lack customization rights, or this type can't be reverted here. Use the maker portal.`,
            },
      }))
    } catch (err) {
      setRemoveNotes((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        },
      }))
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const renderStack = (stack: ComponentLayerStack) => {
    const badge = VERDICT_BADGE[stack.verdict]
    const diffable =
      DIFFABLE_TYPES[stack.component.typeCode] &&
      (stack.verdict === 'clean' ||
        stack.verdict === 'overridden' ||
        stack.verdict === 'unmanagedOnly')
    // Removal reverts to the managed layer, so it's only offered where one
    // exists beneath the Active layer (verdict "overridden").
    const removable = stack.verdict === 'overridden'
    const id = stack.component.objectId
    const isRemoving = removing.has(id)
    const note = removeNotes[id]
    return (
      <li
        key={`${stack.component.typeCode}-${stack.component.objectId}`}
        className="dep-row"
        title={stack.component.objectId}
      >
        <span className={`lv-badge ${badge.cls}`}>{badge.label}</span>
        <span className="dep-name">
          {stack.component.displayName}
          {stack.layers.length > 0 && (
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
          )}
          {note && (
            <span
              className={`lv-remove-note ${
                note.ok ? 'lv-remove-note--ok' : 'lv-remove-note--err'
              }`}
            >
              {note.message}
            </span>
          )}
        </span>
        {diffable && (
          <button
            className="diff-link"
            title={`Diff this definition: DEV vs ${envLabel}`}
            onClick={() => openDiff(stack)}
          >
            ⇄ diff
          </button>
        )}
        {removable && (
          <button
            className="btn btn--small btn--danger"
            disabled={isRemoving}
            title={`Remove the unmanaged Active layer in ${envLabel} (reverts to the managed layer)`}
            onClick={() => setRemoveTarget(stack)}
          >
            {isRemoving ? 'Removing…' : 'Remove layer'}
          </button>
        )}
      </li>
    )
  }

  return (
    <div>
      <div className="card compare-controls">
        <div className="compare-picker">
          <span className="form-label">Release solution</span>
          <SolutionSelect
            options={candidates}
            value={solutionId}
            onChange={(id) => {
              setSolutionId(id)
              setSections([])
              setRan(false)
              setError(null)
              setLayerFilter(null)
              setRemoveNotes({})
            }}
            placeholder="Select a release solution"
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
            {running ? 'Inspecting…' : 'Inspect Layers'}
          </button>
        </div>
      </div>

      {running && (
        <div className="sharing-progress" aria-live="polite">
          <span className="sharing-progress-spinner" />
          <span className="sharing-progress-text">
            {progress
              ? `Inspecting ${envLabel}… ${progress[0]}/${progress[1]} components`
              : 'Starting…'}
          </span>
        </div>
      )}

      {error && <div className="state state--error">{error}</div>}
      {!!warnings.length && (
        <div className="state state--error">
          <ul className="merge-errors">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {ran && (counts.overridden > 0 || counts.unmanagedOnly > 0) && (
        <div className="state state--error">
          {counts.overridden > 0 &&
            `${counts.overridden} component${counts.overridden === 1 ? '' : 's'} with an unmanaged layer over managed state in ${envLabel} (deployed changes masked)`}
          {counts.overridden > 0 && counts.unmanagedOnly > 0 && ' · '}
          {counts.unmanagedOnly > 0 &&
            `${counts.unmanagedOnly} unmanaged-only`}
          . Remove active customizations in {envLabel} (maker portal: See
          solution layers → Remove active customizations).
        </div>
      )}
      {ran &&
        !running &&
        counts.overridden === 0 &&
        counts.unmanagedOnly === 0 &&
        sections.length > 0 && (
          <div className="state state--success">
            No unmanaged layers over this solution's components in {envLabel}.
          </div>
        )}

      {sections.length > 0 && (
        <div className="compare-summary">
          <button
            className={`chip chip--deviation-missing ${
              layerFilter === 'missing' ? 'chip--active' : ''
            }`}
            onClick={() =>
              setLayerFilter((prev) => (prev === 'missing' ? null : 'missing'))
            }
          >
            Missing<span className="chip-count">{missingCount}</span>
          </button>
          <button
            className={`chip chip--deviation-unmanaged ${
              layerFilter === 'unmanaged' ? 'chip--active' : ''
            }`}
            onClick={() =>
              setLayerFilter((prev) =>
                prev === 'unmanaged' ? null : 'unmanaged',
              )
            }
          >
            Unmanaged layer<span className="chip-count">{unmanagedCount}</span>
          </button>
          <span className="chip chip--static">
            Clean<span className="chip-count">{counts.clean}</span>
          </span>
        </div>
      )}

      {sections.length > 0 && visibleSections.length === 0 && (
        <div className="state">
          No components match the {layerFilter} filter in {envLabel}.
        </div>
      )}

      {visibleSections.map((section) => {
        const expanded = isExpanded(section.typeName, section.stacks)
        const issues = section.stacks.filter((s) =>
          ISSUE_VERDICTS.has(s.verdict),
        ).length
        return (
          <section key={section.typeCode} className="card compare-group">
            <button
              className="component-group-toggle"
              onClick={() => toggleGroup(section.typeName, section.stacks)}
              aria-expanded={expanded}
            >
              <span
                className={`component-group-chevron ${
                  expanded ? 'component-group-chevron--open' : ''
                }`}
              >
                ▸
              </span>
              <span className="component-group-title">{section.typeName}</span>
              <span className="muted">({section.stacks.length})</span>
              {issues > 0 && (
                <span className="lv-badge lv-badge--overridden lv-section-flag">
                  {issues} issue{issues === 1 ? '' : 's'}
                </span>
              )}
            </button>
            {expanded && (
              <ul className="dep-list">{section.stacks.map(renderStack)}</ul>
            )}
          </section>
        )
      })}

      {ran && !running && sections.length > 0 && (
        <p className="muted dep-hint">
          {Object.values(counts).reduce((a, b) => a + b, 0)} components checked
          in {envLabel}: {counts.clean} clean, {counts.absent} missing
          {counts.unsupported > 0 &&
            `, ${counts.unsupported} without layer data`}
          {counts.error > 0 && `, ${counts.error} failed`}
          .
        </p>
      )}

      {!ran && !error && (
        <div className="state">
          Pick a release solution and a target environment — each component's
          solution layers are resolved there; sections appear per component
          type as they finish. Unmanaged "Active" layers over managed
          components are flagged, and diffable types (flows, workflows,
          business rules, scripts) offer a DEV-vs-target diff.
        </div>
      )}

      {diffTarget && (
        <ContentDiffModal
          target={diffTarget}
          onClose={() => setDiffTarget(null)}
        />
      )}

      {removeTarget && (
        <div className="modal-backdrop" onClick={() => setRemoveTarget(null)}>
          <div
            className="modal card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="diff-title">Remove active layer</h2>
              <button
                className="modal-close"
                onClick={() => setRemoveTarget(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p>
              Remove the unmanaged <strong>Active</strong> layer over{' '}
              <strong>{removeTarget.component.displayName}</strong> in{' '}
              <strong>{envLabel}</strong>?
            </p>
            <p className="muted">
              This reverts the component to its managed layer there — local
              customizations on top are discarded and the next solution import
              is no longer masked. It runs against {envLabel} as the connector
              service principal and can't be undone from here.
            </p>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRemoveTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn--danger"
                onClick={() => void performRemove(removeTarget)}
              >
                Remove from {envLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
