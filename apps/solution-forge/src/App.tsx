import { useMemo, useState } from 'react'
import './App.css'
import { usePower } from './PowerProvider'
import { useSolutions } from './hooks/useSolutions'
import { solutionService } from './services/solutionService'
import { SolutionFilterBar, type KindFilter } from './components/SolutionFilterBar'
import { SolutionList } from './components/SolutionList'
import { SolutionDetail } from './components/SolutionDetail'
import { CreateSolutionDialog } from './components/CreateSolutionDialog'
import { MergeWorkbench } from './components/MergeWorkbench'
import { CompareWorkbench } from './components/CompareWorkbench'
import { makerSolutionUrl } from './config'
import type {
  SolutionComponentInfo,
  WorkItemInfo,
  WorkingSolution,
} from './types/solution'

type Tab = 'workbench' | 'merge' | 'compare'

function App() {
  const { mode, environmentId } = usePower()
  const { solutions, publishers, loading, error, reload } = useSolutions()

  const [tab, setTab] = useState<Tab>('workbench')
  const [kindFilter, setKindFilter] = useState<KindFilter>('All')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [components, setComponents] = useState<SolutionComponentInfo[]>([])
  const [componentsLoading, setComponentsLoading] = useState(false)
  // Components loaded once per solution and reused on re-selection; only the
  // Refresh button (and a merge into a target) forces a reload.
  const [componentCache, setComponentCache] = useState<
    Map<string, SolutionComponentInfo[]>
  >(new Map())

  // Azure DevOps work items, cached per id. An entry of null means "looked
  // up, nothing available" (item missing or connector not wired).
  const [workItems, setWorkItems] = useState<Map<string, WorkItemInfo | null>>(
    new Map(),
  )
  const [workItemLoading, setWorkItemLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [justCreated, setJustCreated] = useState<WorkingSolution | null>(null)
  // Locally created solutions show up immediately, even before reload() lands.
  const [created, setCreated] = useState<WorkingSolution[]>([])

  // Component search: an on-demand index of every solution's components,
  // built once when the "incl. components" toggle is switched on.
  const [searchInComponents, setSearchInComponents] = useState(false)
  const [componentIndex, setComponentIndex] = useState<Map<
    string,
    SolutionComponentInfo[]
  > | null>(null)
  const [indexProgress, setIndexProgress] = useState<[number, number] | null>(
    null,
  )

  const allSolutions = useMemo(() => {
    const known = new Set(solutions.map((s) => s.id))
    return [...created.filter((s) => !known.has(s.id)), ...solutions]
  }, [solutions, created])

  const counts = useMemo(() => {
    const c: Partial<Record<KindFilter, number>> = {}
    for (const s of allSolutions) c[s.kind] = (c[s.kind] ?? 0) + 1
    return c
  }, [allSolutions])

  // Per-solution components matching the search term — only active when the
  // toggle is on and the index has been built.
  const componentMatches = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matches = new Map<string, SolutionComponentInfo[]>()
    if (!q || !searchInComponents || !componentIndex) return matches
    for (const [solutionId, comps] of componentIndex) {
      const hits = comps.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          (c.schemaName ?? '').toLowerCase().includes(q),
      )
      if (hits.length) matches.set(solutionId, hits)
    }
    return matches
  }, [search, searchInComponents, componentIndex])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allSolutions
      .filter((s) => kindFilter === 'All' || s.kind === kindFilter)
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.uniqueName.toLowerCase().includes(q) ||
          (s.devOpsId ?? '').includes(q) ||
          componentMatches.has(s.id),
      )
  }, [allSolutions, kindFilter, search, componentMatches])

  const selected = allSolutions.find((s) => s.id === selectedId) ?? null

  // Loads the component list lazily when a solution is opened — runs in
  // event handlers (not effects), mirroring audit-explorer's drill-down.
  // Cached per solution; `force` (Refresh button) bypasses the cache.
  const loadComponents = (solutionId: string, force = false) => {
    if (!force) {
      const cached = componentCache.get(solutionId)
      if (cached) {
        setComponents(cached)
        setComponentsLoading(false)
        return
      }
    }
    setComponentsLoading(true)
    solutionService
      .listComponents(solutionId)
      .then((c) => {
        setComponents(c)
        setComponentCache((prev) => new Map(prev).set(solutionId, c))
        // Keep the search index in sync when it exists.
        setComponentIndex((prev) =>
          prev ? new Map(prev).set(solutionId, c) : prev,
        )
      })
      .catch(() => setComponents([]))
      .finally(() => setComponentsLoading(false))
  }

  /**
   * Load every solution's components into the search index, a few solutions
   * at a time. Runs once per toggle activation; results are kept until the
   * toggle is switched off (turning it back on re-indexes fresh data).
   */
  const buildComponentIndex = async (targets: WorkingSolution[]) => {
    setIndexProgress([0, targets.length])
    const index = new Map<string, SolutionComponentInfo[]>()
    let done = 0
    const CHUNK = 4
    for (let i = 0; i < targets.length; i += CHUNK) {
      await Promise.all(
        targets.slice(i, i + CHUNK).map(async (s) => {
          try {
            index.set(s.id, await solutionService.listComponents(s.id))
          } catch {
            index.set(s.id, [])
          }
          setIndexProgress([++done, targets.length])
        }),
      )
    }
    setComponentIndex(index)
    // The index just fetched everything fresh — seed the per-solution cache
    // so opening a solution afterwards costs no extra query.
    setComponentCache((prev) => {
      const next = new Map(prev)
      for (const [id, comps] of index) next.set(id, comps)
      return next
    })
    setIndexProgress(null)
  }

  const toggleComponentSearch = (enabled: boolean) => {
    setSearchInComponents(enabled)
    if (enabled) {
      setComponentIndex(null)
      void buildComponentIndex(allSolutions)
    } else {
      setComponentIndex(null)
      setIndexProgress(null)
    }
  }

  const loadWorkItem = (devOpsId: string) => {
    if (workItems.has(devOpsId)) return
    setWorkItemLoading(true)
    solutionService
      .getWorkItem(devOpsId)
      .then((wi) => setWorkItems((prev) => new Map(prev).set(devOpsId, wi)))
      .catch(() =>
        setWorkItems((prev) => new Map(prev).set(devOpsId, null)),
      )
      .finally(() => setWorkItemLoading(false))
  }

  const openSolution = (id: string) => {
    setSelectedId(id)
    setJustCreated(null)
    loadComponents(id)
    const devOpsId = allSolutions.find((s) => s.id === id)?.devOpsId
    if (devOpsId) loadWorkItem(devOpsId)
  }

  const handleCreated = (solution: WorkingSolution) => {
    setShowCreate(false)
    setCreated((prev) => [solution, ...prev])
    setJustCreated(solution)
    setSelectedId(solution.id)
    setComponents([])
    reload()
  }

  // After a merge the target solution gained components — drop its cached
  // list so the next open (or an open detail view) refetches.
  const handleMerged = (targetSolutionId: string) => {
    setComponentCache((prev) => {
      const next = new Map(prev)
      next.delete(targetSolutionId)
      return next
    })
    setComponentIndex((prev) => {
      if (!prev) return prev
      const next = new Map(prev)
      next.delete(targetSolutionId)
      return next
    })
    if (selectedId === targetSolutionId) loadComponents(targetSolutionId, true)
    reload()
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Solution Forge</h1>
          <p className="subtitle">
            Working solutions for feature &amp; bug development — create,
            inspect, merge.
          </p>
        </div>
        <div className="header-right">
          <span className={`mode-badge mode-${mode}`}>
            {mode === 'power-platform' ? 'Power Platform' : 'Local · mock data'}
          </span>
          <button
            className="btn btn--primary"
            onClick={() => setShowCreate(true)}
            disabled={loading}
          >
            + New Working Solution
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === 'workbench' ? 'tab--active' : ''}`}
          onClick={() => setTab('workbench')}
        >
          Workbench
        </button>
        <button
          className={`tab ${tab === 'merge' ? 'tab--active' : ''}`}
          onClick={() => setTab('merge')}
        >
          Merge
        </button>
        <button
          className={`tab ${tab === 'compare' ? 'tab--active' : ''}`}
          onClick={() => setTab('compare')}
        >
          Compare
        </button>
      </nav>

      {loading && <div className="state">Loading solutions…</div>}
      {error && <div className="state state--error">{error}</div>}

      {!loading && !error && tab === 'workbench' && (
        <>
          {justCreated && (
            <div className="state state--success creation-banner">
              <span>
                Solution <strong>{justCreated.title}</strong> (
                <code>{justCreated.uniqueName}</code>) created.
              </span>
              <a
                className="btn btn--small"
                href={makerSolutionUrl(environmentId, justCreated.id)}
                target="_blank"
                rel="noreferrer"
              >
                Open in Maker Portal ↗
              </a>
            </div>
          )}

          <SolutionFilterBar
            kind={kindFilter}
            onKindChange={setKindFilter}
            search={search}
            onSearchChange={setSearch}
            counts={counts}
            searchInComponents={searchInComponents}
            onSearchInComponentsChange={toggleComponentSearch}
            indexProgress={indexProgress}
          />

          <div className="layout">
            <SolutionList
              solutions={filtered}
              activeId={selectedId}
              onOpen={openSolution}
              componentMatches={componentMatches}
            />
            {selected ? (
              <SolutionDetail
                key={selected.id}
                solution={selected}
                environmentId={environmentId}
                components={components}
                loadingComponents={componentsLoading}
                onRefreshComponents={() => loadComponents(selected.id, true)}
                workItem={
                  selected.devOpsId
                    ? (workItems.get(selected.devOpsId) ?? null)
                    : null
                }
                workItemLoading={
                  workItemLoading &&
                  !!selected.devOpsId &&
                  !workItems.has(selected.devOpsId)
                }
              />
            ) : (
              <aside className="card detail detail--empty">
                Select a solution to see its details and components.
              </aside>
            )}
          </div>
        </>
      )}

      {!loading && !error && tab === 'merge' && (
        <MergeWorkbench solutions={allSolutions} onMerged={handleMerged} />
      )}

      {!loading && !error && tab === 'compare' && (
        <CompareWorkbench
          solutions={allSolutions}
          initialSolutionId={selectedId}
        />
      )}

      {showCreate && (
        <CreateSolutionDialog
          publishers={publishers}
          existingUniqueNames={allSolutions.map((s) => s.uniqueName)}
          onCreate={(input) => solutionService.createWorkingSolution(input)}
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}

export default App
