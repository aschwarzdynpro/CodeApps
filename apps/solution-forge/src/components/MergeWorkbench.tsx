import { useRef, useState } from 'react'
import type {
  MergePlanItem,
  MergeResult,
  SolutionComponentInfo,
  WorkingSolution,
} from '../types/solution'
import { solutionService } from '../services/solutionService'
import { KindBadge } from './KindBadge'
import { SolutionSelect } from './SolutionSelect'

interface Props {
  solutions: WorkingSolution[]
  /** Called with the target's id after a successful merge so the workbench
   *  can reload and invalidate the target's cached component list. */
  onMerged: (targetSolutionId: string) => void
}

/**
 * Merge staging area: pick a deployment solution as target, tick the feature /
 * bug solutions to merge, review the combined component plan (with conflict
 * markers when several sources carry the same object), then execute.
 */
export function MergeWorkbench({ solutions, onMerged }: Props) {
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Source filter — the selection is keyed by id and survives any search
  // change; selected entries stay visible as removable chips.
  const [sourceSearch, setSourceSearch] = useState('')
  const [plan, setPlan] = useState<MergePlanItem[] | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [result, setResult] = useState<MergeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Guards against out-of-order plan responses when toggling quickly.
  const planRequest = useRef(0)

  const buildPlan = async (ids: Set<string>) => {
    if (ids.size === 0) {
      setPlan(null)
      return
    }
    const request = ++planRequest.current
    setPlanLoading(true)
    try {
      const perSolution = await Promise.all(
        [...ids].map(async (id) => ({
          solution: solutions.find((s) => s.id === id),
          components: await solutionService.listComponents(id),
        })),
      )
      if (request !== planRequest.current) return
      const byObject = new Map<
        string,
        { component: SolutionComponentInfo; sources: string[] }
      >()
      for (const { solution, components } of perSolution) {
        for (const component of components) {
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
    setResult(null)
    setError(null)
    void buildPlan(next)
  }

  const target = targets.find((s) => s.id === targetId) ?? null
  const canMerge =
    !!target && selected.size > 0 && !planLoading && progress === null

  const merge = async () => {
    if (!target) return
    setProgress([0, plan?.length ?? 0])
    setResult(null)
    setError(null)
    try {
      const res = await solutionService.mergeIntoDeployment(
        target.uniqueName,
        [...selected],
        (done, total) => setProgress([done, total]),
      )
      setResult(res)
      onMerged(target.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
    }
  }

  const query = sourceSearch.trim().toLowerCase()
  const filteredSources = query
    ? sources.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.uniqueName.toLowerCase().includes(query) ||
          (s.devOpsId ?? '').toLowerCase().includes(query),
      )
    : sources
  const selectedSolutions = sources.filter((s) => selected.has(s.id))

  return (
    <div className="merge-layout">
      <div className="card merge-pane merge-sources-pane">
        <h3 className="card-title">
          1 · Working solutions to merge
          {selected.size > 0 && (
            <span className="muted"> — {selected.size} selected</span>
          )}
        </h3>
        <input
          className="search merge-source-search"
          type="search"
          placeholder="Filter by name, unique name, ADO id…"
          value={sourceSearch}
          onChange={(e) => setSourceSearch(e.target.value)}
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
        {sources.length === 0 && (
          <div className="state">
            No tracked feature / bug solutions available — only solutions
            with a working-solution record can be merged (create one in the
            Workbench detail pane).
          </div>
        )}
        {sources.length > 0 && filteredSources.length === 0 && (
          <div className="state">No solution matches “{sourceSearch}”.</div>
        )}
        <ul className="merge-source-list merge-source-list--scroll">
          {filteredSources.map((s) => (
            <li key={s.recordId ?? s.id}>
              <label className="merge-source">
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggleSource(s.id)}
                />
                <KindBadge kind={s.kind} />
                <span className="merge-source-title">{s.title}</span>
                <code>{s.uniqueName}</code>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="merge-right">
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
            </p>
            <ul className="merge-plan">
              {plan.map((item) => (
                <li
                  key={item.component.objectId}
                  className={item.conflict ? 'merge-plan-conflict' : ''}
                >
                  <span className="merge-plan-type">{item.component.typeName}</span>
                  <span className="merge-plan-name">
                    {item.component.displayName}
                  </span>
                  <span className="merge-plan-sources muted">
                    {item.sources.join(', ')}
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

        {result && (
          <div className="state state--success">
            Merge finished — {result.added} added, {result.skipped} already in
            target.
            {result.errors.length > 0 && (
              <ul className="merge-errors">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && <div className="state state--error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
