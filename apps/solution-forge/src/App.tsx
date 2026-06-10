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
import { makerSolutionUrl } from './config'
import type { SolutionComponentInfo, WorkingSolution } from './types/solution'

type Tab = 'workbench' | 'merge'

function App() {
  const { mode, environmentId } = usePower()
  const { solutions, publishers, loading, error, reload } = useSolutions()

  const [tab, setTab] = useState<Tab>('workbench')
  const [kindFilter, setKindFilter] = useState<KindFilter>('All')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [components, setComponents] = useState<SolutionComponentInfo[]>([])
  const [componentsLoading, setComponentsLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [justCreated, setJustCreated] = useState<WorkingSolution | null>(null)
  // Locally created solutions show up immediately, even before reload() lands.
  const [created, setCreated] = useState<WorkingSolution[]>([])

  const allSolutions = useMemo(() => {
    const known = new Set(solutions.map((s) => s.id))
    return [...created.filter((s) => !known.has(s.id)), ...solutions]
  }, [solutions, created])

  const counts = useMemo(() => {
    const c: Partial<Record<KindFilter, number>> = {}
    for (const s of allSolutions) c[s.kind] = (c[s.kind] ?? 0) + 1
    return c
  }, [allSolutions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allSolutions
      .filter((s) => kindFilter === 'All' || s.kind === kindFilter)
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.uniqueName.toLowerCase().includes(q) ||
          (s.devOpsId ?? '').includes(q),
      )
  }, [allSolutions, kindFilter, search])

  const selected = allSolutions.find((s) => s.id === selectedId) ?? null

  // Loads the component list lazily when a solution is opened — runs in
  // event handlers (not effects), mirroring audit-explorer's drill-down.
  const loadComponents = (solutionId: string) => {
    setComponentsLoading(true)
    solutionService
      .listComponents(solutionId)
      .then((c) => setComponents(c))
      .catch(() => setComponents([]))
      .finally(() => setComponentsLoading(false))
  }

  const openSolution = (id: string) => {
    setSelectedId(id)
    setJustCreated(null)
    loadComponents(id)
  }

  const handleCreated = (solution: WorkingSolution) => {
    setShowCreate(false)
    setCreated((prev) => [solution, ...prev])
    setJustCreated(solution)
    setSelectedId(solution.id)
    setComponents([])
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
          />

          <div className="layout">
            <SolutionList
              solutions={filtered}
              activeId={selectedId}
              onOpen={openSolution}
            />
            {selected ? (
              <SolutionDetail
                solution={selected}
                environmentId={environmentId}
                components={components}
                loadingComponents={componentsLoading}
                onRefreshComponents={() => loadComponents(selected.id)}
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
        <MergeWorkbench solutions={allSolutions} onMerged={reload} />
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
