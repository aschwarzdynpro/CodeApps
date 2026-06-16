import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { usePower } from './PowerProvider'
import { useSolutions } from './hooks/useSolutions'
import { solutionService } from './services/solutionService'
import { SolutionFilterBar, type KindFilter } from './components/SolutionFilterBar'
import { SolutionList } from './components/SolutionList'
import { SolutionDetail } from './components/SolutionDetail'
import { CreateSolutionDialog } from './components/CreateSolutionDialog'
import { MergeWorkbench } from './components/MergeWorkbench'
import { ValidateWorkspace } from './components/ValidateWorkspace'
// ALM Detective is temporarily hidden from the UI — component + service
// (AlmDetective.tsx / detectiveService.ts) stay in place for re-enabling.
import { HelpPanel } from './components/HelpPanel'
import { ConfirmDeleteDialog } from './components/ConfirmDeleteDialog'
import { CompleteSolutionDialog } from './components/CompleteSolutionDialog'
import {
  DEPLOYMENT_MANAGER_ROLE,
  DEVOPS_PANEL_ENABLED,
  makerSolutionUrl,
} from './config'
import {
  CLOSED_STATUS_CODES,
  DEPLOYMENT_COMPLETED_CODE,
  isOpenStatus,
  type ComponentCollision,
  type SolutionComponentInfo,
  type TrackSolutionInput,
  type WorkItemInfo,
  type WorkingSolution,
} from './types/solution'

type Tab =
  | 'workbench'
  | 'merge'
  | 'compare'
  | 'dependencies'
  | 'layers'
  | 'sharing'

interface NavItem {
  key: Tab
  label: string
  icon: string
  /** Requires the deployment-manager role. */
  gated: boolean
}

/** Sidebar navigation, grouped by purpose. */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Manage',
    items: [
      { key: 'workbench', label: 'Workbench', icon: '🧰', gated: false },
      { key: 'merge', label: 'Merge', icon: '⇉', gated: true },
    ],
  },
  {
    label: 'Validate',
    items: [
      { key: 'compare', label: 'Compare', icon: '⇄', gated: true },
      { key: 'dependencies', label: 'Dependencies', icon: '🔗', gated: true },
      { key: 'layers', label: 'Layers', icon: '🧱', gated: true },
      { key: 'sharing', label: 'App Sharing', icon: '👥', gated: true },
    ],
  },
]

/** Heading shown in the content header per section. */
const TAB_TITLES: Record<Tab, string> = {
  workbench: 'Workbench',
  merge: 'Merge',
  compare: 'Compare',
  dependencies: 'Dependency Check',
  layers: 'Layer Inspector',
  sharing: 'App Sharing',
}

function App() {
  const { environmentId } = usePower()
  const { solutions, publishers, loading, error, reload } = useSolutions()

  const [tab, setTab] = useState<Tab>('workbench')
  // Merge and Compare are restricted to deployment managers; tabs stay
  // visible but disabled until the role check confirms access.
  const [isDeploymentManager, setIsDeploymentManager] = useState(false)

  useEffect(() => {
    // One-time role probe — drives the tab gating as it resolves.
    solutionService
      .hasRole(DEPLOYMENT_MANAGER_ROLE)
      .then((granted) => setIsDeploymentManager(granted))
      .catch(() => setIsDeploymentManager(false))
  }, [])
  const [kindFilter, setKindFilter] = useState<KindFilter>('All')
  const [search, setSearch] = useState('')
  const [groupByWorkItem, setGroupByWorkItem] = useState(false)
  // Default filters for "the relevant stuff": open (deployment status not
  // completed/merged) and tracked (has a working-solution record). Both
  // can be unticked to reach finished or untracked entries.
  const [openOnly, setOpenOnly] = useState(true)
  const [trackedOnly, setTrackedOnly] = useState(true)
  // "Mine" filter: resolved lazily on first activation. undefined = not
  // resolved yet, 'loading' = lookup running.
  const [mineOnly, setMineOnly] = useState(false)
  const [currentUser, setCurrentUser] = useState<
    { id: string | null; name: string | null } | 'loading' | undefined
  >(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [components, setComponents] = useState<SolutionComponentInfo[]>([])
  const [componentsLoading, setComponentsLoading] = useState(false)
  // Components loaded once per solution and reused on re-selection; only the
  // Refresh button (and a merge into a target) forces a reload.
  const [componentCache, setComponentCache] = useState<
    Map<string, SolutionComponentInfo[]>
  >(new Map())

  // Collision radar: per solution id, the components it shares with other
  // open working solutions. null = not scanned yet.
  const [collisions, setCollisions] = useState<Map<
    string,
    ComponentCollision[]
  > | null>(null)
  const [collisionProgress, setCollisionProgress] = useState<
    [number, number] | null
  >(null)

  // Azure DevOps work items, cached per id. An entry of null means "looked
  // up, nothing available" (item missing or connector not wired).
  const [workItems, setWorkItems] = useState<Map<string, WorkItemInfo | null>>(
    new Map(),
  )
  const [workItemLoading, setWorkItemLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  // "Sync with DevOps": runs the cloud flow, then reloads so the
  // to-be-completed reconciliation re-runs.
  const [syncingDevOps, setSyncingDevOps] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{
    ok: boolean
    text: string
  } | null>(null)
  // The success bar fades out and clears itself ~10s after a sync.
  const [syncFading, setSyncFading] = useState(false)
  useEffect(() => {
    if (!syncMessage?.ok) return
    const fade = window.setTimeout(() => setSyncFading(true), 9400)
    const clear = window.setTimeout(() => setSyncMessage(null), 10000)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(clear)
    }
  }, [syncMessage])

  // Soft delete / completion: confirmed entries disappear immediately and
  // wait in pendingDeletes for the 5-second undo window; only then the hard
  // action runs server-side. Undo just cancels the timer and re-shows the
  // entry (nothing happened server-side yet, so completing reverts to open
  // simply by not committing). `mode` selects the finalize action.
  const [confirmDelete, setConfirmDelete] = useState<WorkingSolution | null>(
    null,
  )
  const [completeTarget, setCompleteTarget] = useState<WorkingSolution | null>(
    null,
  )
  const [pendingDeletes, setPendingDeletes] = useState<
    { key: string; solution: WorkingSolution; mode: 'delete' | 'complete' }[]
  >([])
  const deleteTimers = useRef(new Map<string, number>())
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
    const merged = [...created.filter((s) => !known.has(s.id)), ...solutions]
    if (pendingDeletes.length === 0) return merged
    // Entries awaiting their undo window are hidden from every view.
    const pendingKeys = new Set(pendingDeletes.map((p) => p.key))
    return merged.filter((s) => !pendingKeys.has(s.recordId ?? s.id))
  }, [solutions, created, pendingDeletes])

  // Structural filters (open / tracked / mine) applied before kind and
  // search — the kind counts reflect this base set.
  const baseFiltered = useMemo(() => {
    const isMine = (s: WorkingSolution): boolean => {
      if (!currentUser || currentUser === 'loading') return true // still resolving
      if (currentUser.id && s.ownerId) return s.ownerId === currentUser.id
      if (currentUser.name && s.owner)
        return s.owner.toLowerCase() === currentUser.name.toLowerCase()
      return false
    }
    return allSolutions
      .filter(
        (s) =>
          !openOnly ||
          s.deploymentStatusCode === undefined ||
          !CLOSED_STATUS_CODES.has(s.deploymentStatusCode),
      )
      .filter((s) => !trackedOnly || !!s.recordId)
      .filter((s) => !mineOnly || isMine(s))
  }, [allSolutions, openOnly, trackedOnly, mineOnly, currentUser])

  const counts = useMemo(() => {
    const c: Partial<Record<KindFilter, number>> = {}
    for (const s of baseFiltered) c[s.kind] = (c[s.kind] ?? 0) + 1
    return c
  }, [baseFiltered])

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
    return baseFiltered
      .filter((s) => kindFilter === 'All' || s.kind === kindFilter)
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.uniqueName.toLowerCase().includes(q) ||
          (s.devOpsId ?? '').includes(q) ||
          componentMatches.has(s.id),
      )
  }, [baseFiltered, kindFilter, search, componentMatches])

  const toggleMineOnly = (enabled: boolean) => {
    setMineOnly(enabled)
    if (enabled && currentUser === undefined) {
      setCurrentUser('loading')
      solutionService
        .getCurrentUser()
        .then((u) => setCurrentUser(u))
        .catch(() => setCurrentUser({ id: null, name: null }))
    }
  }

  const selected = allSolutions.find((s) => s.id === selectedId) ?? null

  // Unmanaged solutions without a record — offered when re-linking
  // orphaned records.
  const linkCandidates = useMemo(
    () => allSolutions.filter((s) => !s.recordId && !s.solutionMissing),
    [allSolutions],
  )

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
   * Load components into the search index, a few solutions at a time. Scoped
   * to open working solutions and their linked solutions (the active set, not
   * every solution in the environment). Runs once per toggle activation;
   * results are kept until the toggle is switched off.
   */
  const buildComponentIndex = async (allTargets: WorkingSolution[]) => {
    const targets = allTargets.filter(
      (s, index) =>
        isOpenStatus(s) &&
        !!s.recordId &&
        !s.solutionMissing &&
        allTargets.findIndex((o) => o.id === s.id) === index,
    )
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

  /**
   * Collision radar: load the components of every open, tracked, non-release
   * working solution (component cache is reused and seeded), then flag
   * every component that appears in more than one of them.
   */
  const scanCollisions = async () => {
    // Open tracked working set only — completed/merged entries are done,
    // releases collect merges by design, and duplicate-link rows must not
    // count as two solutions.
    const targets = allSolutions.filter(
      (s, index) =>
        isOpenStatus(s) &&
        s.recordId &&
        !s.solutionMissing &&
        s.kind !== 'deployment' &&
        allSolutions.findIndex((o) => o.id === s.id) === index,
    )
    setCollisionProgress([0, targets.length])
    const local = new Map<string, SolutionComponentInfo[]>()
    let done = 0
    const CHUNK = 4
    for (let i = 0; i < targets.length; i += CHUNK) {
      await Promise.all(
        targets.slice(i, i + CHUNK).map(async (s) => {
          const cached = componentCache.get(s.id)
          if (cached) {
            local.set(s.id, cached)
          } else {
            try {
              local.set(s.id, await solutionService.listComponents(s.id))
            } catch {
              local.set(s.id, [])
            }
          }
          setCollisionProgress([++done, targets.length])
        }),
      )
    }
    // Seed the shared cache with everything fetched fresh.
    setComponentCache((prev) => {
      const next = new Map(prev)
      for (const [id, comps] of local) if (!next.has(id)) next.set(id, comps)
      return next
    })

    const byObject = new Map<
      string,
      { component: SolutionComponentInfo; members: { id: string; title: string }[] }
    >()
    for (const s of targets) {
      for (const component of local.get(s.id) ?? []) {
        const entry = byObject.get(component.objectId)
        if (entry) entry.members.push({ id: s.id, title: s.title })
        else
          byObject.set(component.objectId, {
            component,
            members: [{ id: s.id, title: s.title }],
          })
      }
    }
    const map = new Map<string, ComponentCollision[]>()
    for (const { component, members } of byObject.values()) {
      if (members.length < 2) continue
      for (const member of members) {
        const list = map.get(member.id) ?? []
        list.push({
          component,
          otherSolutions: members.filter((o) => o.id !== member.id),
        })
        map.set(member.id, list)
      }
    }
    setCollisions(map)
    setCollisionProgress(null)
  }

  const collisionStats = useMemo(() => {
    if (!collisions) return null
    const objectIds = new Set<string>()
    for (const list of collisions.values())
      for (const c of list) objectIds.add(c.component.objectId)
    return { components: objectIds.size, solutions: collisions.size }
  }, [collisions])

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
    const solution = allSolutions.find((s) => s.id === id)
    if (solution?.solutionMissing) {
      // No real solution behind this record — nothing to fetch.
      setComponents([])
      setComponentsLoading(false)
    } else {
      loadComponents(id)
    }
    if (DEVOPS_PANEL_ENABLED && solution?.devOpsId)
      loadWorkItem(solution.devOpsId)
  }

  const handleCreated = (solution: WorkingSolution) => {
    setShowCreate(false)
    setCreated((prev) => [solution, ...prev])
    setJustCreated(solution)
    setSelectedId(solution.id)
    setComponents([])
    reload()
  }

  /**
   * Hide the entry and start the 5-second undo window for a deferred action.
   * mode 'delete' removes the whole entry; 'complete' marks it completed and
   * deletes the underlying solution.
   */
  const startPending = (
    solution: WorkingSolution,
    mode: 'delete' | 'complete',
  ) => {
    const key = solution.recordId ?? solution.id
    if (selectedId === solution.id) {
      setSelectedId(null)
      setComponents([])
      setComponentsLoading(false)
    }
    setPendingDeletes((prev) => [...prev, { key, solution, mode }])
    const timeout = window.setTimeout(() => {
      void finalizeDelete(key, solution, mode)
    }, 5000)
    deleteTimers.current.set(key, timeout)
  }

  /** Confirmed in the delete dialog. */
  const startDelete = (solution: WorkingSolution) => {
    setConfirmDelete(null)
    startPending(solution, 'delete')
  }

  /**
   * Confirmed in the complete dialog. Without deleting the solution it's a
   * plain status update; with deletion it goes through the undo window.
   */
  const handleComplete = async (
    solution: WorkingSolution,
    deleteUnderlying: boolean,
  ) => {
    setCompleteTarget(null)
    if (!solution.recordId) return
    if (deleteUnderlying) {
      startPending(solution, 'complete')
      return
    }
    try {
      await solutionService.setDeploymentStatus(
        solution.recordId,
        DEPLOYMENT_COMPLETED_CODE,
      )
    } catch (err) {
      console.warn('[solutions] complete failed:', err)
    }
    reload()
  }

  const undoDelete = (key: string) => {
    const timeout = deleteTimers.current.get(key)
    if (timeout) window.clearTimeout(timeout)
    deleteTimers.current.delete(key)
    // The entry was never deleted server-side — unhiding it is enough.
    setPendingDeletes((prev) => prev.filter((p) => p.key !== key))
  }

  /**
   * Run the "Sync DevOps Work Item Status" cloud flow, then reload so the
   * to-be-completed reconciliation runs against the refreshed statuses.
   */
  const syncDevOps = async () => {
    setSyncingDevOps(true)
    setSyncMessage(null)
    setSyncFading(false)
    try {
      const count = await solutionService.syncDevOpsWorkItemStatus()
      setSyncMessage({
        ok: true,
        text: `DevOps work item status synced${
          count ? ` — ${count} record${count === 1 ? '' : 's'}` : ''
        }.`,
      })
      reload()
    } catch (err) {
      setSyncMessage({
        ok: false,
        text: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSyncingDevOps(false)
    }
  }

  const finalizeDelete = async (
    key: string,
    solution: WorkingSolution,
    mode: 'delete' | 'complete',
  ) => {
    deleteTimers.current.delete(key)
    try {
      if (mode === 'complete') {
        if (solution.recordId)
          await solutionService.setDeploymentStatus(
            solution.recordId,
            DEPLOYMENT_COMPLETED_CODE,
          )
        await solutionService.deleteUnderlyingSolution(solution.id)
      } else {
        await solutionService.deleteSolution(solution)
      }
    } catch (err) {
      console.warn(`[solutions] ${mode} failed:`, err)
    }
    setPendingDeletes((prev) => prev.filter((p) => p.key !== key))
    setComponentCache((prev) => {
      const next = new Map(prev)
      next.delete(solution.id)
      return next
    })
    setCollisions((prev) => {
      if (!prev?.has(solution.id)) return prev
      const next = new Map(prev)
      next.delete(solution.id)
      return next
    })
    // Reload to reflect the truth — if the delete failed, the entry
    // simply reappears.
    reload()
  }

  // Attach a working-solution record to an untracked solution, then
  // reload so the entry shows up with its WS chip, owner and type.
  const handleTrack = async (input: TrackSolutionInput) => {
    await solutionService.trackSolution(input)
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
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <span className="brand-mark">⬣</span>
            <span className="brand-name">
              Solution
              <br />
              Admin Console
            </span>
          </div>
          <nav className="sidebar-nav">
            {NAV_GROUPS.map((group) => (
              <div className="nav-group" key={group.label}>
                <span className="nav-group-label">{group.label}</span>
                {group.items.map((item) => {
                  const locked = item.gated && !isDeploymentManager
                  return (
                    <button
                      key={item.key}
                      className={`nav-item ${tab === item.key ? 'nav-item--active' : ''} ${locked ? 'nav-item--locked' : ''}`}
                      title={
                        locked
                          ? `Requires the security role “${DEPLOYMENT_MANAGER_ROLE}”.`
                          : undefined
                      }
                      onClick={() => {
                        if (!locked) setTab(item.key)
                      }}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-label">{item.label}</span>
                      {locked && <span className="nav-lock">ⓘ</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button className="nav-item" onClick={() => setShowHelp(true)}>
              <span className="nav-icon">?</span>
              <span className="nav-label">Help</span>
            </button>
          </div>
        </aside>

        <main className="content">
          <header className="content-header">
            <h1>{TAB_TITLES[tab]}</h1>
          </header>

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
            counts={counts}
            openOnly={openOnly}
            onOpenOnlyChange={setOpenOnly}
            trackedOnly={trackedOnly}
            onTrackedOnlyChange={setTrackedOnly}
            mineOnly={mineOnly}
            onMineOnlyChange={toggleMineOnly}
            mineUserName={
              currentUser && currentUser !== 'loading' ? currentUser.name : null
            }
            groupByWorkItem={groupByWorkItem}
            onGroupByChange={setGroupByWorkItem}
          />

          {mineOnly &&
            currentUser &&
            currentUser !== 'loading' &&
            !currentUser.id &&
            !currentUser.name && (
              <div className="state state--error">
                Could not determine the signed-in user — the “Mine” filter
                has nothing to match. Check the browser console for the
                identity lookup details.
              </div>
            )}

          <div className="collision-bar">
            <button
              className="btn btn--small btn--primary"
              onClick={() => setShowCreate(true)}
              disabled={loading}
            >
              + New Working Solution
            </button>
            <button
              className="btn btn--small"
              onClick={() => void scanCollisions()}
              disabled={!!collisionProgress}
            >
              {collisionProgress
                ? `Scanning… ${collisionProgress[0]}/${collisionProgress[1]}`
                : collisions
                  ? '⚠ Re-scan collisions'
                  : '⚠ Scan collisions'}
            </button>
            <button
              className="btn btn--small"
              title="Run the 'Sync DevOps Work Item Status' cloud flow, then refresh the to-be-completed check."
              onClick={() => void syncDevOps()}
              disabled={syncingDevOps}
            >
              {syncingDevOps ? 'Syncing with DevOps…' : '⟳ Sync with DevOps'}
            </button>
            <div className="search-group">
              <input
                className="search"
                type="search"
                placeholder={
                  searchInComponents
                    ? 'Search incl. component names…'
                    : 'Search title, unique name, ADO id…'
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <label
                className="search-scope"
                title="Also match component display names (builds a one-time index across the open working solutions)."
              >
                <input
                  type="checkbox"
                  checked={searchInComponents}
                  onChange={(e) => toggleComponentSearch(e.target.checked)}
                />
                incl. components
                {indexProgress && (
                  <span className="search-scope-progress">
                    indexing {indexProgress[0]}/{indexProgress[1]}…
                  </span>
                )}
              </label>
            </div>
            {collisionStats &&
              !collisionProgress &&
              (collisionStats.components > 0 ? (
                <span className="collision-summary collision-summary--warn">
                  {collisionStats.components} component
                  {collisionStats.components === 1 ? '' : 's'} contained in
                  more than one working solution ({collisionStats.solutions}{' '}
                  solutions affected)
                </span>
              ) : (
                <span className="collision-summary muted">
                  No component collisions across the tracked working
                  solutions.
                </span>
              ))}
          </div>

          {syncingDevOps && (
            <div className="sharing-progress" aria-live="polite">
              <span className="sharing-progress-spinner" />
              <span className="sharing-progress-text">
                Sync with DevOps in progress — the cloud flow is updating each
                working solution's work item status…
              </span>
            </div>
          )}
          {syncMessage && !syncingDevOps && (
            <div
              className={`state ${
                syncMessage.ok ? 'state--success sync-banner' : 'state--error'
              } ${syncFading ? 'sync-banner--fading' : ''}`}
            >
              {syncMessage.text}
            </div>
          )}

          <div className="layout">
            <SolutionList
              solutions={filtered}
              activeId={selectedId}
              onOpen={openSolution}
              componentMatches={componentMatches}
              collisions={collisions}
              groupByWorkItem={groupByWorkItem}
            />
            {selected ? (
              <SolutionDetail
                key={selected.id}
                solution={selected}
                environmentId={environmentId}
                components={components}
                loadingComponents={componentsLoading}
                onRefreshComponents={() => loadComponents(selected.id, true)}
                collisions={collisions?.get(selected.id) ?? null}
                onTrack={handleTrack}
                onDelete={(s) => setConfirmDelete(s)}
                onComplete={(s) => setCompleteTarget(s)}
                onChangeType={async (s, kind) => {
                  if (!s.recordId) return
                  await solutionService.updateSolutionType(s.recordId, kind)
                  reload()
                }}
                linkCandidates={linkCandidates}
                onLink={async (record, target) => {
                  if (!record.recordId) return
                  await solutionService.linkSolution(record.recordId, {
                    id: target.id,
                    uniqueName: target.uniqueName,
                  })
                  // Follow the record to its now-linked solution entry.
                  setSelectedId(target.id)
                  loadComponents(target.id)
                  reload()
                }}
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

      {!loading && !error && tab === 'merge' && isDeploymentManager && (
        <MergeWorkbench solutions={allSolutions} onMerged={handleMerged} />
      )}

      {!loading &&
        !error &&
        (tab === 'compare' ||
          tab === 'dependencies' ||
          tab === 'layers' ||
          tab === 'sharing') &&
        isDeploymentManager && (
          <ValidateWorkspace tab={tab} solutions={allSolutions} />
        )}
        </main>
      </div>

      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}

      {confirmDelete && (
        <ConfirmDeleteDialog
          solution={confirmDelete}
          onConfirm={() => startDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {completeTarget && (
        <CompleteSolutionDialog
          solution={completeTarget}
          onConfirm={(deleteUnderlying) =>
            void handleComplete(completeTarget, deleteUnderlying)
          }
          onCancel={() => setCompleteTarget(null)}
        />
      )}

      {pendingDeletes.length > 0 && (
        <div className="undo-stack">
          {pendingDeletes.map((p) => (
            <div key={p.key} className="undo-card">
              <span className="undo-text">
                {p.mode === 'complete' ? 'Completed' : 'Deleted'}{' '}
                <strong>{p.solution.title}</strong>
                {p.mode === 'complete' && ' — deleting solution'}
              </span>
              <button
                className="undo-button"
                onClick={() => undoDelete(p.key)}
              >
                Undo
              </button>
              <div className="undo-progress" />
            </div>
          ))}
        </div>
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
