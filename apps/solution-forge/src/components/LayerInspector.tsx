import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import type { AlmComponentRef, EnvKey } from '../types/comparison'
import type {
  ComponentLayerStack,
  LayerSection,
  LayerVerdict,
} from '../types/layers'
import {
  ENVIRONMENTS,
  makerComponentLayersUrl,
  makerEnvSolutionsUrl,
  makerSolutionUrl,
} from '../config'
import { solutionService } from '../services/solutionService'
import { ContentDiffModal } from './ContentDiffModal'

interface Props {
  /** Release solution + target env from the shared Validate selector. */
  solution: WorkingSolution
  envKey: 'uat' | 'prod'
  onEnvChange: (envKey: 'uat' | 'prod') => void
  /** Run automatically once on mount (used inside the Analyze tabs). */
  autoRun?: boolean
}

const TARGET_ENVS = ENVIRONMENTS.filter(
  (e) => e.key === 'uat' || e.key === 'prod',
)

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
export function LayerInspector({
  solution,
  envKey,
  onEnvChange,
  autoRun,
}: Props) {
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
  // The picked solution's id in the target env (ids diverge per env) — used
  // for the precise solution-layers deep links; resolved per run.
  const [targetSolutionId, setTargetSolutionId] = useState<string | null>(null)

  const targetEnv = ENVIRONMENTS.find((e) => e.key === envKey)
  const envLabel = targetEnv?.label ?? envKey.toUpperCase()

  const run = async () => {
    setRunning(true)
    setSections([])
    setWarnings([])
    setError(null)
    setProgress(null)
    setGroupOverrides({})
    setLayerFilter(null)
    setTargetSolutionId(null)
    setRan(true)
    // Resolve the solution's id in the target env for the layer deep links
    // (best-effort, non-blocking — the link falls back without it).
    void solutionService
      .resolveSolutionIdInEnv(solution.uniqueName, envKey)
      .then((id) => setTargetSolutionId(id))
      .catch(() => setTargetSolutionId(null))
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

  // Auto-run once when embedded in the Analyze tabs.
  const didAuto = useRef(false)
  useEffect(() => {
    if (!autoRun || didAuto.current) return
    didAuto.current = true
    void Promise.resolve().then(run)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const renderStack = (stack: ComponentLayerStack) => {
    const badge = VERDICT_BADGE[stack.verdict]
    const diffable =
      DIFFABLE_TYPES[stack.component.typeCode] &&
      (stack.verdict === 'clean' ||
        stack.verdict === 'overridden' ||
        stack.verdict === 'unmanagedOnly')
    // Rows carrying an unmanaged Active layer get a jump into the maker
    // portal of the target env, where the layer can be removed (See solution
    // layers → Remove active customizations). The precise layers view needs
    // both the target-env solution id and a known per-type route segment;
    // otherwise we degrade to the solution's objects list, then the env's
    // solutions area.
    const hasUnmanagedLayer = UNMANAGED_VERDICTS.has(stack.verdict)
    const layerLink =
      targetEnv && targetSolutionId && stack.makerLayerPath
        ? {
            href: makerComponentLayersUrl(
              targetEnv.environmentId,
              targetSolutionId,
              stack.makerLayerPath,
            ),
            label: `↗ layers in ${envLabel}`,
            title: `Open this component's solution layers in ${envLabel} (then Remove active customizations)`,
          }
        : targetEnv && targetSolutionId
          ? {
              href: makerSolutionUrl(targetEnv.environmentId, targetSolutionId),
              label: `↗ solution in ${envLabel}`,
              title: `Open the solution in ${envLabel}, select this component, then Advanced → See solution layers → Remove active customizations`,
            }
          : targetEnv
            ? {
                href: makerEnvSolutionsUrl(targetEnv.environmentId),
                label: `↗ solutions in ${envLabel}`,
                title: `Open ${envLabel} solutions to find this component's layers (Advanced → See solution layers → Remove active customizations)`,
              }
            : null
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
        {hasUnmanagedLayer && layerLink && (
          <a
            className="diff-link"
            href={layerLink.href}
            target="_blank"
            rel="noreferrer"
            title={layerLink.title}
          >
            {layerLink.label}
          </a>
        )}
      </li>
    )
  }

  return (
    <div>
      <div className="validate-toolbar">
        <div className="chips" title="Target environment for the inspection">
          {TARGET_ENVS.map((env) => (
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
          onClick={() => void run()}
        >
          {running ? 'Inspecting…' : 'Inspect Layers'}
        </button>
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
          Click <strong>Inspect Layers</strong> — each component of{' '}
          {solution.title} has its solution layers resolved in {envLabel};
          sections appear per component type as they finish. Unmanaged "Active"
          layers over managed components are flagged, and diffable types
          (flows, workflows, business rules, scripts) offer a DEV-vs-target
          diff.
        </div>
      )}

      {diffTarget && (
        <ContentDiffModal
          target={diffTarget}
          onClose={() => setDiffTarget(null)}
        />
      )}
    </div>
  )
}
