import { useEffect, useRef, useState } from 'react'
import type {
  MergePlanItem,
  MergeResult,
  SolutionComponentInfo,
  WorkingSolution,
} from '../types/solution'
import {
  MERGEABLE_COMPONENT_TYPES,
  COLLAPSED_COMPONENT_TYPE_LABELS,
  canonicalCollapsedLabel,
} from '../types/solution'
import { solutionService } from '../services/solutionService'
import { MultiSolutionSelect } from './MultiSolutionSelect'
import { SolutionSelect } from './SolutionSelect'

interface Props {
  solutions: WorkingSolution[]
  /** Called after a merge with the target id, the result and the target title.
   *  The parent reloads, invalidates the target's component cache and shows the
   *  outcome banner (at App level so it survives the reload). */
  onMerged: (
    targetSolutionId: string,
    result: MergeResult,
    targetTitle: string,
  ) => void
  /** A source solution id to pre-select (from a Workbench row's Merge action). */
  seedSourceId?: string | null
  /** Called once the seed has been applied, so the parent can clear it. */
  onSeedConsumed?: () => void
}

/**
 * Merge staging area: pick a deployment solution as target, tick the feature /
 * bug solutions to merge, review the combined component plan (with conflict
 * markers when several sources carry the same object), then execute.
 */
export function MergeWorkbench({
  solutions,
  onMerged,
  seedSourceId,
  onSeedConsumed,
}: Props) {
  // Merge is restricted to tracked solutions (working-solution record
  // present) whose real solution exists.
  const targets = solutions.filter(
    (s) => s.kind === 'deployment' && !s.solutionMissing && s.recordId,
  )
  const sources = solutions.filter(
    (s) =>
      (s.kind === 'feature' || s.kind === 'bug') &&
      !s.solutionMissing &&
      s.recordId,
  )

  const [targetId, setTargetId] = useState<string>('')
  // The selection is keyed by id and survives any filter change inside the
  // picker; selected entries stay visible as removable chips. A seed source
  // (from a Workbench row's Merge action) starts the selection off.
  const [selected, setSelected] = useState<Set<string>>(() =>
    seedSourceId ? new Set([seedSourceId]) : new Set(),
  )
  const [plan, setPlan] = useState<MergePlanItem[] | null>(null)
  // Rolled-up component types (e.g. App Element) shown as one counter row.
  const [planRollup, setPlanRollup] = useState<
    { label: string; count: number }[]
  >([])
  const [planLoading, setPlanLoading] = useState(false)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Guards against out-of-order plan responses when toggling quickly.
  const planRequest = useRef(0)

  const buildPlan = async (ids: Set<string>) => {
    if (ids.size === 0) {
      setPlan(null)
      setPlanRollup([])
      return
    }
    const request = ++planRequest.current
    setPlanLoading(true)
    try {
      const perSolution = await Promise.all(
        [...ids].map(async (id) => ({
          solution: solutions.find((s) => s.id === id),
          components: await solutionService.listMergeComponents(id),
        })),
      )
      if (request !== planRequest.current) return
      const byObject = new Map<
        string,
        { component: SolutionComponentInfo; sources: string[] }
      >()
      // Rolled-up types (e.g. App Element): counted by distinct object id and
      // shown as one summary row instead of dozens of GUID rows. Still merged
      // — the merge recomputes its own set, so this is display-only.
      const rollup = new Map<string, Set<string>>()
      for (const { solution, components } of perSolution) {
        for (const component of components) {
          if (COLLAPSED_COMPONENT_TYPE_LABELS.has(component.typeName)) {
            const label = canonicalCollapsedLabel(component.typeName)
            const set = rollup.get(label) ?? new Set<string>()
            set.add(component.objectId)
            rollup.set(label, set)
            continue
          }
          const entry = byObject.get(component.objectId)
          const sourceTitle = solution?.title ?? '?'
          if (entry) entry.sources.push(sourceTitle)
          else byObject.set(component.objectId, { component, sources: [sourceTitle] })
        }
      }
      setPlan(
        [...byObject.values()]
          .map((e) => ({ ...e, conflict: e.sources.length > 1 }))
          .sort(
            (a, b) =>
              a.component.typeName.localeCompare(b.component.typeName) ||
              a.component.displayName.localeCompare(b.component.displayName),
          ),
      )
      setPlanRollup(
        [...rollup.entries()]
          .map(([label, set]) => ({ label, count: set.size }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      )
    } catch {
      if (request === planRequest.current) setError('Could not load the component plan.')
    } finally {
      if (request === planRequest.current) setPlanLoading(false)
    }
  }

  const toggleSource = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    setError(null)
    void buildPlan(next)
  }

  // Seeded from a Workbench row's Merge action: build the plan for the
  // pre-selected source once, then let the parent clear the seed.
  useEffect(() => {
    if (!seedSourceId) return
    void Promise.resolve().then(() => {
      void buildPlan(new Set([seedSourceId]))
      onSeedConsumed?.()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const target = targets.find((s) => s.id === targetId) ?? null
  // Release merge rules: allow-list (empty = all) + exclude-list on top.
  const allowedTypes = target?.allowedMergeTypes ?? []
  const excludedTypes = target?.excludedMergeTypes ?? []
  const isAllowed = (typeCode: number) =>
    (allowedTypes.length === 0 || allowedTypes.includes(typeCode)) &&
    !excludedTypes.includes(typeCode)
  const labelsOf = (codes: number[]) =>
    codes
      .map(
        (c) =>
          MERGEABLE_COMPONENT_TYPES.find((t) => t.code === c)?.label ??
          `Type ${c}`,
      )
      .sort((a, b) => a.localeCompare(b))
  const allowedLabels = labelsOf(allowedTypes)
  const excludedLabels = labelsOf(excludedTypes)
  const hasRules = allowedTypes.length > 0 || excludedTypes.length > 0
  const excludedCount = plan
    ? plan.filter((p) => !isAllowed(p.component.typeCode)).length
    : 0
  const canMerge =
    !!target && selected.size > 0 && !planLoading && progress === null

  const merge = async () => {
    if (!target) return
    setProgress([0, plan?.length ?? 0])
    setError(null)
    try {
      const res = await solutionService.mergeIntoDeployment(
        target.uniqueName,
        [...selected],
        (done, total) => setProgress([done, total]),
      )
      // The outcome banner lives at App level (survives the reload onMerged
      // triggers, which briefly unmounts this tab).
      onMerged(target.id, res, target.title)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
    }
  }

  const selectedSolutions = sources.filter((s) => selected.has(s.id))

  return (
    <div className="merge-layout merge-layout--single">
      <div className="card merge-pane">
        <h3 className="card-title">
          1 · Working solutions to merge
          {selected.size > 0 && (
            <span className="muted"> — {selected.size} selected</span>
          )}
        </h3>
        {sources.length === 0 ? (
          <div className="state">
            No tracked feature / bug solutions available — only solutions
            with a working-solution record can be merged (create one in the
            Workbench detail pane).
          </div>
        ) : (
          <>
            <MultiSolutionSelect
              options={sources}
              selected={selected}
              onToggle={toggleSource}
              placeholder="Select working solutions to merge…"
            />
            {selectedSolutions.length > 0 && (
              <div className="merge-selected">
                {selectedSolutions.map((s) => (
                  <button
                    key={s.id}
                    className="merge-selected-chip"
                    onClick={() => toggleSource(s.id)}
                    title="Remove from selection"
                  >
                    {s.title} ✕
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="card merge-pane">
        <h3 className="card-title">2 · Target deployment solution</h3>
        {targets.length === 0 ? (
          <div className="state">
            No deployment solution yet — create one via “New Working
            Solution” with type <strong>Release</strong>.
          </div>
        ) : (
          <SolutionSelect
            options={targets}
            value={targetId}
            onChange={setTargetId}
          />
        )}
        {target && hasRules && (
          <p className="muted merge-allowed-note">
            {allowedTypes.length > 0 && (
              <>
                Accepts only: <strong>{allowedLabels.join(', ')}</strong>.{' '}
              </>
            )}
            {excludedTypes.length > 0 && (
              <>
                Excludes: <strong>{excludedLabels.join(', ')}</strong>.
              </>
            )}
          </p>
        )}
      </div>

      <div className="card merge-pane">
        <h3 className="card-title">3 · Component plan</h3>
        {planLoading && <div className="state">Building plan…</div>}
        {!planLoading && !plan && (
          <div className="state">Select working solutions to see the plan.</div>
        )}
        {!planLoading && plan && (
          <>
            <p className="muted merge-plan-summary">
              {plan.length} distinct component{plan.length === 1 ? '' : 's'}
              {plan.some((p) => p.conflict) &&
                ' — conflicts are contributed by several solutions and applied once.'}
              {excludedCount > 0 &&
                ` · ${excludedCount} excluded by this release's merge rules`}
            </p>
            <ul className="merge-plan">
              {plan.map((item) => {
                const allowedItem = isAllowed(item.component.typeCode)
                return (
                  <li
                    key={item.component.objectId}
                    className={`${item.conflict ? 'merge-plan-conflict' : ''} ${
                      allowedItem ? '' : 'merge-plan-excluded'
                    }`}
                  >
                    <span className="merge-plan-type">
                      {item.component.typeName}
                    </span>
                    <span className="merge-plan-name">
                      {item.component.displayName}
                    </span>
                    {!allowedItem && (
                      <span className="merge-plan-blocked" title="Component type not allowed for this release">
                        excluded
                      </span>
                    )}
                    <span className="merge-plan-sources muted">
                      {item.sources.join(', ')}
                    </span>
                  </li>
                )
              })}
              {planRollup.map((r) => (
                <li key={r.label} className="merge-plan-rollup">
                  {r.count} {r.count === 1 ? r.label : `${r.label}s`}
                  <span className="muted">
                    {' '}
                    — merged, not listed individually
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="merge-actions">
          <button
            className="btn btn--primary"
            disabled={!canMerge}
            onClick={() => void merge()}
          >
            {progress
              ? `Merging… ${progress[0]}/${progress[1]}`
              : 'Merge into deployment solution'}
          </button>
        </div>

        {error && <div className="state state--error">{error}</div>}
      </div>
    </div>
  )
}
