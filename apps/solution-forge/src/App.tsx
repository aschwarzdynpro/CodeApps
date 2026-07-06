import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './App.css'
import { usePower } from './PowerProvider'
import { useSolutions } from './hooks/useSolutions'
import { useAnalysisRun } from './hooks/useAnalysisRun'
import { useReadinessRun } from './hooks/useReadinessRun'
import { PHASE_LABELS, type DetectivePhaseKey } from './types/detective'
import { solutionService } from './services/solutionService'
import { SolutionFilterBar, type KindFilter } from './components/SolutionFilterBar'
import { SolutionList } from './components/SolutionList'
import { SolutionDetail } from './components/SolutionDetail'
import { CreateSolutionDialog } from './components/CreateSolutionDialog'
import { MergeWorkbench } from './components/MergeWorkbench'
import { MergeRules } from './components/MergeRules'
import { ReadinessWorkspace } from './components/ReadinessWorkspace'
import { AnalyzeWorkspace } from './components/AnalyzeWorkspace'
import { ReleaseNotesWorkspace } from './components/ReleaseNotesWorkspace'
import { ReleaseTimelineWorkspace } from './components/ReleaseTimelineWorkspace'
import { ActivityBar } from './components/ActivityBar'
import { EnvConfigWorkspace } from './components/EnvConfigWorkspace'
import { DualWriteWorkspace } from './components/DualWriteWorkspace'
import { AuditConfigWorkspace } from './components/AuditConfigWorkspace'
import { ImportHistoryWorkspace } from './components/ImportHistoryWorkspace'
import { TraceExplorer } from './components/TraceExplorer'
import { JobMonitor } from './components/JobMonitor'
import { RoleAnalyzer } from './components/RoleAnalyzer'
// ALM Detective is temporarily hidden from the UI — component + service
// (AlmDetective.tsx / detectiveService.ts) stay in place for re-enabling.
import { HelpPanel } from './components/HelpPanel'
import { HowToPanel } from './components/HowToPanel'
import { ConfirmDeleteDialog } from './components/ConfirmDeleteDialog'
import { CompleteSolutionDialog } from './components/CompleteSolutionDialog'
import { AssignDialog } from './components/AssignDialog'
import { EditSolutionDialog } from './components/EditSolutionDialog'
import {
  applyRuntimeConfig,
  currentEnvKey,
  DEPLOYMENT_MANAGER_ROLE,
  DEVOPS_PANEL_ENABLED,
  makerSolutionUrl,
} from './config'
import {
  DEPLOYMENT_COMPLETED_CODE,
  isOpenStatus,
  type ComponentCollision,
  type MergeResult,
  type SolutionComponentInfo,
  type TrackSolutionInput,
  type WorkItemInfo,
  type WorkingSolution,
} from './types/solution'

type Tab =
  | 'workbench'
  | 'merge'
  | 'mergeRules'
  | 'releaseNotes'
  | 'timeline'
  | 'readiness'
  | 'analyze'
  | 'envConfig'
  | 'auditConfig'
  | 'dualWrite'
  | 'importHistory'
  | 'traces'
  | 'jobs'
  | 'roles'

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
      { key: 'merge', label: 'Merge', icon: '⇉', gated: false },
      { key: 'mergeRules', label: 'Merge Rules', icon: '⚙', gated: true },
      { key: 'releaseNotes', label: 'Release Notes', icon: '📝', gated: false },
      { key: 'timeline', label: 'Timeline', icon: '🕘', gated: false },
    ],
  },
  {
    label: 'Validate',
    items: [
      {
        key: 'readiness',
        label: 'Deployment Readiness',
        icon: '🚦',
        gated: true,
      },
      { key: 'analyze', label: 'Analyze', icon: '📊', gated: true },
      { key: 'envConfig', label: 'Env Config', icon: '🔧', gated: true },
      { key: 'auditConfig', label: 'Audit Config', icon: '🔍', gated: true },
      { key: 'dualWrite', label: 'Dual-Write Maps', icon: '🔀', gated: true },
      {
        key: 'importHistory',
        label: 'Import History',
        icon: '📦',
        gated: true,
      },
    ],
  },
  {
    // Operations views over the current environment (traces, async jobs,
    // security roles). Trace Explorer and Job Monitor are open to everyone
    // (their destructive actions are additionally deployment-manager-gated
    // inside the workspace); the Role Analyzer exposes the whole security
    // model and is gated as a whole.
    label: 'Operate',
    items: [
      { key: 'traces', label: 'Plugin Traces', icon: '🧵', gated: false },
      { key: 'jobs', label: '[PREVIEW] Job Monitor', icon: '📡', gated: false },
      { key: 'roles', label: '[PREVIEW] Role Analyzer', icon: '🛡', gated: true },
    ],
  },
]

/** Heading shown in the content header per section. */
const TAB_TITLES: Record<Tab, string> = {
  workbench: 'Workbench',
  merge: 'Merge',
  mergeRules: 'Merge Rules',
  releaseNotes: 'Release Notes',
  timeline: 'Release Timeline',
  readiness: 'Deployment Readiness',
  analyze: 'Analyze',
  envConfig: 'Environment Config',
  auditConfig: 'Audit Configuration',
  dualWrite: 'Dual-Write Table Maps',
  importHistory: 'Solution Import History',
  traces: 'Plugin Trace Explorer',
  jobs: '[PREVIEW] Async Job / Flow Monitor',
  roles: '[PREVIEW] Security Role Analyzer',
}

/**
 * Pull a readable message out of an unknown error. Handles the OData error
 * shape ({ error: { message } }) and messages that embed the batch/OData JSON
 * (e.g. a failed DELETE returns the whole multipart body) by extracting the
 * inner "message" — so the user sees "Cannot start the requested operation
 * [Uninstall] …" rather than a raw batch dump.
 */
function describeError(err: unknown): string {
  const odata = (err as { error?: { message?: string } } | undefined)?.error
    ?.message
  if (odata) return odata
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (raw) {
    const match = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (match) {
      try {
        return JSON.parse(`"${match[1]}"`) as string
      } catch {
        return match[1]
      }
    }
    return raw
  }
  return String(err)
}

function App() {
  const { environmentId, mode } = usePower()
  const { solutions, publishers, defaultPublisher, loading, error, loadedAt, reload } =
    useSolutions()

  // Resolve the configured default publisher (pro_publisher_str) to a
  // publisher id — matched defensively by unique name, prefix or friendly
  // name; falls back to the first publisher in the dialog when unset.
  const defaultPublisherId = useMemo(() => {
    if (!defaultPublisher) return ''
    const needle = defaultPublisher.trim().toLowerCase()
    const match = publishers.find(
      (p) =>
        p.uniqueName.toLowerCase() === needle ||
        p.prefix.toLowerCase() === needle ||
        p.friendlyName.toLowerCase() === needle,
    )
    return match?.id ?? ''
  }, [defaultPublisher, publishers])

  const [tab, setTab] = useState<Tab>('workbench')
  // Shared target environment for the Operate features (Traces / Jobs /
  // Roles) — lifted here so switching tabs keeps the selection. Defaults to
  // the host env; resolved once startup config has hydrated ENVIRONMENTS.
  const [operateEnvKey, setOperateEnvKey] = useState<string>(() =>
    currentEnvKey(),
  )
  // Audit Config has its own target-environment selection (Validate group).
  const [auditEnvKey, setAuditEnvKey] = useState<string>(() => currentEnvKey())
  // Import History too — deployments usually get checked in UAT/PROD.
  const [importEnvKey, setImportEnvKey] = useState<string>(() =>
    currentEnvKey(),
  )
  // Sidebar collapse (icon-only) — remembered across sessions.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sac.sidebarCollapsed') === '1'
    } catch {
      return false
    }
  })
  const toggleSidebar = () =>
    setSidebarCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem('sac.sidebarCollapsed', next ? '1' : '0')
      } catch {
        /* storage unavailable — keep the in-memory state only */
      }
      return next
    })
  // Merge and Compare are restricted to deployment managers; tabs stay
  // visible but disabled until the role check confirms access.
  const [isDeploymentManager, setIsDeploymentManager] = useState(false)
  // Bumped once startup config is applied, so children re-read the (live-bound)
  // ENVIRONMENTS / role / ADO values from config.ts.
  const [, setConfigVersion] = useState(0)

  useEffect(() => {
    // Load runtime config (Compare targets, ADO, role) from Dataverse and apply
    // it over the build-time defaults BEFORE the role probe, so gating uses the
    // configured role name. Then bump configVersion to re-render dependents.
    let cancelled = false
    void (async () => {
      try {
        const cfg = await solutionService.getRuntimeConfig()
        if (!cancelled) applyRuntimeConfig(cfg)
      } catch {
        /* keep build-time defaults */
      }
      try {
        const granted = await solutionService.hasRole(DEPLOYMENT_MANAGER_ROLE)
        if (!cancelled) setIsDeploymentManager(granted)
      } catch {
        if (!cancelled) setIsDeploymentManager(false)
      }
      if (!cancelled) setConfigVersion((v) => v + 1)
    })()
    return () => {
      cancelled = true
    }
  }, [])
  // Analyze sweep + Validate selection are lifted here so the run keeps
  // going (and the selection stays put) while navigating between tabs.
  const { run: analysisRun, start: startAnalysis } = useAnalysisRun()
  const [validateSolutionId, setValidateSolutionId] = useState('')
  const [validateEnvKey, setValidateEnvKey] = useState<'uat' | 'prod'>('uat')
  const [analysisBarHidden, setAnalysisBarHidden] = useState(false)
  const handleAnalyze = (
    solution: WorkingSolution,
    env: 'uat' | 'prod',
    phases: DetectivePhaseKey[],
  ) => {
    setAnalysisBarHidden(false)
    startAnalysis(solution, env, phases)
  }

  // Deployment-Readiness check — lifted the same way so it keeps running
  // (and the selection stays put) while navigating between tabs.
  const { run: readinessRun, start: startReadiness } = useReadinessRun()
  const [readinessSolutionId, setReadinessSolutionId] = useState('')
  const [readinessEnvKey, setReadinessEnvKey] = useState<'uat' | 'prod'>('uat')
  const [readinessBarHidden, setReadinessBarHidden] = useState(false)
  const handleReadinessCheck = (
    solution: WorkingSolution,
    env: 'uat' | 'prod',
  ) => {
    setReadinessBarHidden(false)
    startReadiness(solution, env)
  }

  const [kindFilter, setKindFilter] = useState<KindFilter>('All')
  const [search, setSearch] = useState('')
  const [groupByWorkItem, setGroupByWorkItem] = useState(false)
  // Default filters for "the relevant stuff": open (deployment status not
  // completed/merged) and tracked (has a working-solution record). Both
  // can be unticked to reach finished or untracked entries.
  const [openOnly, setOpenOnly] = useState(true)
  const [trackedOnly, setTrackedOnly] = useState(true)
  // Owner filter — '' = all owners.
  const [ownerFilter, setOwnerFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // While the inline detail plays its fade-out, the row stays selected so the
  // pane keeps rendering in place; cleared once the animation ends.
  const [detailClosing, setDetailClosing] = useState(false)
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
  const [showHowTo, setShowHowTo] = useState(false)
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
  // wait in pendingDeletes for the 3-second undo window; only then the hard
  // action runs server-side. Undo just cancels the timer and re-shows the
  // entry (nothing happened server-side yet, so completing reverts to open
  // simply by not committing). `mode` selects the finalize action.
  const [confirmDelete, setConfirmDelete] = useState<WorkingSolution | null>(
    null,
  )
  const [completeTarget, setCompleteTarget] = useState<WorkingSolution | null>(
    null,
  )
  // Owner-reassignment dialog target (opened from a row's quick actions).
  const [assignTarget, setAssignTarget] = useState<WorkingSolution | null>(null)
  // Edit-working-solution dialog target (type / title / description).
  const [editTarget, setEditTarget] = useState<WorkingSolution | null>(null)
  // When a row's "Merge" action fires, the Merge tab opens with this id
  // pre-selected as a source; cleared once the Merge workspace consumes it.
  const [mergeSeedId, setMergeSeedId] = useState<string | null>(null)
  const handleMergeFromList = (s: WorkingSolution) => {
    setMergeSeedId(s.id)
    setTab('merge')
  }
  const [pendingDeletes, setPendingDeletes] = useState<
    { key: string; solution: WorkingSolution; mode: 'delete' | 'complete' }[]
  >([])
  // Entries already deleted server-side this session — kept hidden without a
  // reload (the row left the list on click; a successful delete just makes that
  // permanent). A later reload drops them from the source list anyway.
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set())
  const deleteTimers = useRef(new Map<string, number>())
  const [justCreated, setJustCreated] = useState<WorkingSolution | null>(null)
  // The "solution created" bar fades out and clears itself after 5s.
  const [creationFading, setCreationFading] = useState(false)
  useEffect(() => {
    if (!justCreated) return
    const fade = window.setTimeout(() => setCreationFading(true), 4400)
    const clear = window.setTimeout(() => setJustCreated(null), 5000)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(clear)
    }
  }, [justCreated])
  // Transient error from a background action (e.g. a delete/complete that
  // failed server-side after the undo window) — shown as a banner that fades
  // out and clears itself after 5s.
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionErrorFading, setActionErrorFading] = useState(false)
  useEffect(() => {
    if (!actionError) return
    const fade = window.setTimeout(() => setActionErrorFading(true), 4400)
    const clear = window.setTimeout(() => setActionError(null), 5000)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(clear)
    }
  }, [actionError])
  // Merge outcome banner — lives at App level so it survives the reload() the
  // merge triggers (which briefly unmounts the Merge tab). Clean merges fade
  // after 5s; merges with item-level errors stay so they can be read.
  const [mergeBanner, setMergeBanner] = useState<{
    result: MergeResult
    title: string
  } | null>(null)
  const [mergeBannerFading, setMergeBannerFading] = useState(false)
  useEffect(() => {
    if (!mergeBanner || mergeBanner.result.errors.length > 0) return
    const fade = window.setTimeout(() => setMergeBannerFading(true), 4400)
    const clear = window.setTimeout(() => setMergeBanner(null), 5000)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(clear)
    }
  }, [mergeBanner])
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
    if (pendingDeletes.length === 0 && removedKeys.size === 0) return merged
    // Entries awaiting their undo window — and entries already deleted
    // server-side this session — are hidden from every view.
    const hidden = new Set(removedKeys)
    for (const p of pendingDeletes) hidden.add(p.key)
    return merged.filter((s) => !hidden.has(s.recordId ?? s.id))
  }, [solutions, created, pendingDeletes, removedKeys])

  // Structural filters (open / tracked / owner) applied before kind and
  // search — the kind counts reflect this base set.
  const baseFiltered = useMemo(() => {
    return allSolutions
      .filter((s) => !openOnly || isOpenStatus(s))
      .filter((s) => !trackedOnly || !!s.recordId)
      .filter((s) => !ownerFilter || s.owner === ownerFilter)
  }, [allSolutions, openOnly, trackedOnly, ownerFilter])

  // Distinct owners across all solutions, for the workbench owner filter.
  const owners = useMemo(
    () =>
      [
        ...new Set(
          allSolutions.map((s) => s.owner).filter((o): o is string => !!o),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [allSolutions],
  )

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
    // Clicking the open row again collapses the inline detail (fade-out).
    if (id === selectedId) {
      setDetailClosing(true)
      return
    }
    setDetailClosing(false)
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

  // Called when the fade-out finishes — only now do we drop the selection so
  // the pane unmounts after it has visually collapsed.
  const finishCloseDetail = () => {
    setDetailClosing(false)
    setSelectedId(null)
  }

  const handleCreated = (solution: WorkingSolution) => {
    setShowCreate(false)
    setCreated((prev) => [solution, ...prev])
    setCreationFading(false)
    setJustCreated(solution)
    setSelectedId(solution.id)
    setComponents([])
    reload()
  }

  /**
   * Hide the entry and start the 3-second undo window for a deferred action.
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
    }, 3000)
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
    let failed = false
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
      failed = true
      console.warn(`[solutions] ${mode} failed:`, err)
      setActionErrorFading(false)
      setActionError(
        `${mode === 'complete' ? 'Completing' : 'Deleting'} “${solution.title}” failed: ${describeError(err)}`,
      )
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
    if (failed) {
      // The action didn't go through — reload so the entry reappears with the
      // truth from the environment.
      reload()
    } else if (mode === 'delete') {
      // Success: the row already left the list on click; keep it hidden
      // permanently instead of reloading (the reload is what made the screen
      // lag after the undo window).
      setRemovedKeys((prev) => new Set(prev).add(key))
    } else {
      // Completed: the record itself stays (only its status changed and the
      // underlying solution was removed) — reload to show the new state.
      reload()
    }
  }

  // Attach a working-solution record to an untracked solution, then
  // reload so the entry shows up with its WS chip, owner and type.
  const handleTrack = async (input: TrackSolutionInput) => {
    await solutionService.trackSolution(input)
    reload()
  }

  // After a merge the target solution gained components — drop its cached
  // list so the next open (or an open detail view) refetches.
  const handleMerged = (
    targetSolutionId: string,
    result: MergeResult,
    targetTitle: string,
  ) => {
    setMergeBannerFading(false)
    setMergeBanner({ result, title: targetTitle })
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
      <header className="app-topbar">
        <div className="topbar-brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" role="img">
              <defs>
                <linearGradient id="sacGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#3b82f6" />
                  <stop offset="1" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
              <path
                d="M16 1.5 L3.4 8.75 L3.4 23.25 L16 30.5 L28.6 23.25 L28.6 8.75 Z"
                fill="url(#sacGrad)"
              />
              <rect x="9" y="11.4" width="14" height="2.8" rx="1.4" fill="#fff" opacity="0.95" />
              <rect x="10" y="16" width="12" height="2.8" rx="1.4" fill="#fff" opacity="0.8" />
              <rect x="11" y="20.6" width="10" height="2.8" rx="1.4" fill="#fff" opacity="0.62" />
            </svg>
          </span>
          <span className="topbar-title">Solution Administration Console</span>
          <span className="topbar-divider" aria-hidden="true" />
          <span className="topbar-tag">ALM</span>
        </div>
        <div className="topbar-actions">
          <span
            className={`mode-badge ${
              mode === 'power-platform' ? 'mode-power-platform' : 'mode-local-mock'
            }`}
            title={
              mode === 'power-platform'
                ? 'Connected to the Power Platform environment'
                : 'Running standalone on mock data'
            }
          >
            {mode === 'power-platform' ? '● Connected' : '● Demo data'}
          </span>
          <button
            className="topbar-icon"
            onClick={() => setShowHowTo(true)}
            title="How-To"
            aria-label="How-To"
          >
            📖
          </button>
          <button
            className="topbar-icon"
            onClick={() => setShowHelp(true)}
            title="Help"
            aria-label="Help"
          >
            ?
          </button>
        </div>
      </header>
      <div className="app-body">
        <aside className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`}>
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
            aria-label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
            aria-expanded={!sidebarCollapsed}
          >
            ☰
          </button>
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
                          ? `${item.label} — requires the security role “${DEPLOYMENT_MANAGER_ROLE}”.`
                          : sidebarCollapsed
                            ? item.label
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
        </aside>

        <main className="content">
          <header className="content-header">
            <h1>{TAB_TITLES[tab]}</h1>
            {tab === 'workbench' && !error && (
              <div className="header-actions">
                {loadedAt && (
                  <span
                    className="list-updated muted"
                    title={`Last refreshed ${loadedAt.toLocaleString()}`}
                  >
                    Updated{' '}
                    {loadedAt.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                )}
                <button
                  className="btn btn--small"
                  onClick={() => reload()}
                  disabled={loading}
                  title="Reload the working solutions list"
                >
                  {loading ? 'Refreshing…' : '⟳ Refresh'}
                </button>
              </div>
            )}
          </header>

      {actionError && (
        <div
          className={`state state--error creation-banner ${
            actionErrorFading ? 'creation-banner--fading' : ''
          }`}
        >
          <span>{actionError}</span>
        </div>
      )}

      {mergeBanner && (
        <div
          className={`state ${
            mergeBanner.result.errors.length
              ? 'state--error'
              : 'state--success creation-banner'
          } ${mergeBannerFading ? 'creation-banner--fading' : ''}`}
        >
          <span>
            {mergeBanner.result.errors.length
              ? 'Merge finished with issues — '
              : '✓ Merge finished — '}
            <strong>{mergeBanner.result.added}</strong> component
            {mergeBanner.result.added === 1 ? '' : 's'} added into{' '}
            <strong>{mergeBanner.title}</strong>
            {mergeBanner.result.skipped > 0
              ? `, ${mergeBanner.result.skipped} already in target`
              : ''}
            {mergeBanner.result.excluded > 0
              ? `, ${mergeBanner.result.excluded} excluded by merge rules`
              : ''}
            {mergeBanner.result.errors.length > 0
              ? `, ${mergeBanner.result.errors.length} failed:`
              : '.'}
          </span>
          {mergeBanner.result.errors.length > 0 && (
            <ul className="merge-errors">
              {mergeBanner.result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading && <div className="state">Loading solutions…</div>}
      {error && <div className="state state--error">{error}</div>}

      {!loading && !error && tab === 'workbench' && (
        <>
          {justCreated && (
            <div
              className={`state state--success creation-banner ${
                creationFading ? 'creation-banner--fading' : ''
              }`}
            >
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
            owners={owners}
            ownerFilter={ownerFilter}
            onOwnerChange={setOwnerFilter}
            groupByWorkItem={groupByWorkItem}
            onGroupByChange={setGroupByWorkItem}
          />

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
          </div>

          {collisionStats && !collisionProgress && (
            <div
              className={`state collision-banner ${
                collisionStats.components > 0
                  ? 'collision-banner--warn'
                  : 'state--success'
              }`}
            >
              {collisionStats.components > 0
                ? `⚠ ${collisionStats.components} component${
                    collisionStats.components === 1 ? '' : 's'
                  } contained in more than one working solution (${
                    collisionStats.solutions
                  } solution${
                    collisionStats.solutions === 1 ? '' : 's'
                  } affected)`
                : '✓ No component collisions across the tracked working solutions.'}
            </div>
          )}

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
              environmentId={environmentId}
              componentMatches={componentMatches}
              collisions={collisions}
              groupByWorkItem={groupByWorkItem}
              detailClosing={detailClosing}
              onDetailClosed={finishCloseDetail}
              canManageReleases={isDeploymentManager}
              onEdit={(s) => setEditTarget(s)}
              onComplete={(s) => setCompleteTarget(s)}
              onDelete={(s) => setConfirmDelete(s)}
              onRequestAssign={(s) => setAssignTarget(s)}
              onMerge={handleMergeFromList}
              detail={
                selected ? (
                  <SolutionDetail
                    key={selected.id}
                    solution={selected}
                    components={components}
                    loadingComponents={componentsLoading}
                    onRefreshComponents={() => loadComponents(selected.id, true)}
                    collisions={collisions?.get(selected.id) ?? null}
                    onTrack={handleTrack}
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
                ) : null
              }
            />
          </div>
        </>
      )}

      {!loading && !error && tab === 'merge' && (
        <MergeWorkbench
          solutions={allSolutions}
          onMerged={handleMerged}
          seedSourceId={mergeSeedId}
          onSeedConsumed={() => setMergeSeedId(null)}
        />
      )}

      {!loading && !error && tab === 'mergeRules' && isDeploymentManager && (
        <MergeRules
          solutions={allSolutions}
          onSave={async (recordId, allowed, excluded) => {
            await solutionService.setMergeTypeRules(recordId, allowed, excluded)
            reload()
          }}
        />
      )}

      {!loading && !error && tab === 'releaseNotes' && (
        <ReleaseNotesWorkspace
          solutions={allSolutions}
          canPublish={isDeploymentManager}
        />
      )}

      {!loading && !error && tab === 'timeline' && (
        <ReleaseTimelineWorkspace solutions={allSolutions} />
      )}

      {!loading && !error && tab === 'readiness' && isDeploymentManager && (
        <ReadinessWorkspace
          solutions={allSolutions}
          solutionId={readinessSolutionId}
          onSolutionChange={setReadinessSolutionId}
          envKey={readinessEnvKey}
          onEnvChange={setReadinessEnvKey}
          run={readinessRun}
          onCheck={handleReadinessCheck}
        />
      )}

      {!loading && !error && tab === 'analyze' && isDeploymentManager && (
        <AnalyzeWorkspace
          solutions={allSolutions}
          solutionId={validateSolutionId}
          onSolutionChange={setValidateSolutionId}
          envKey={validateEnvKey}
          onEnvChange={setValidateEnvKey}
          run={analysisRun}
          onAnalyze={handleAnalyze}
        />
      )}

      {!error && tab === 'envConfig' && isDeploymentManager && (
        <EnvConfigWorkspace solutions={allSolutions} />
      )}

      {!error && tab === 'auditConfig' && isDeploymentManager && (
        <AuditConfigWorkspace
          key={auditEnvKey}
          envKey={auditEnvKey}
          onEnvChange={setAuditEnvKey}
        />
      )}

      {!error && tab === 'dualWrite' && isDeploymentManager && (
        <DualWriteWorkspace />
      )}

      {!error && tab === 'importHistory' && isDeploymentManager && (
        <ImportHistoryWorkspace
          key={importEnvKey}
          envKey={importEnvKey}
          onEnvChange={setImportEnvKey}
          solutions={allSolutions}
        />
      )}

      {/* Operate views are independent of the solutions list — they render
          even while it is still loading (only a load error blocks). Each
          takes the shared target-environment selection. */}
      {!error && tab === 'traces' && (
        <TraceExplorer
          canManageTraceLevel={isDeploymentManager}
          envKey={operateEnvKey}
          onEnvChange={setOperateEnvKey}
        />
      )}

      {/* Job Monitor and Role Analyzer remount on env change (key) so their
          internal state resets and refetches cleanly against the new target;
          the Trace Explorer reloads in place to keep its filters. */}
      {!error && tab === 'jobs' && (
        <JobMonitor
          key={operateEnvKey}
          canManageJobs={isDeploymentManager}
          envKey={operateEnvKey}
          onEnvChange={setOperateEnvKey}
          solutions={allSolutions}
        />
      )}

      {!error && tab === 'roles' && isDeploymentManager && (
        <RoleAnalyzer
          key={operateEnvKey}
          envKey={operateEnvKey}
          onEnvChange={setOperateEnvKey}
          solutions={allSolutions}
          canManage={isDeploymentManager}
        />
      )}
        </main>
      </div>

      {showHowTo && <HowToPanel onClose={() => setShowHowTo(false)} />}
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

      {assignTarget && (
        <AssignDialog
          solution={assignTarget}
          onAssignToMe={async (s) => {
            if (!s.recordId) return
            const me = await solutionService.getCurrentUser()
            if (!me.id)
              throw new Error('Could not resolve your user account.')
            await solutionService.assignOwner(s.recordId, me.id)
            reload()
          }}
          onAssign={async (s, userId) => {
            if (!s.recordId) return
            await solutionService.assignOwner(s.recordId, userId)
            reload()
          }}
          onSearchUsers={(q) => solutionService.searchUsers(q)}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {editTarget && (
        <EditSolutionDialog
          solution={editTarget}
          canSetRelease={isDeploymentManager}
          onSave={async (changes) => {
            if (!editTarget.recordId) return
            await solutionService.updateWorkingSolution({
              recordId: editTarget.recordId,
              solutionId: editTarget.id,
              solutionMissing: editTarget.solutionMissing,
              ...changes,
            })
            reload()
          }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {(() => {
        // Background-activity bars: surface long-running jobs (Analyze sweep,
        // Deployment-Readiness check) that keep going while navigating away.
        // Each bar shows only when its run has an outcome and we're not already
        // looking at exactly that result; several stack in one container.
        const bars: ReactNode[] = []

        if (analysisRun && !analysisBarHidden) {
          const hasOutcome =
            analysisRun.running || !!analysisRun.result || !!analysisRun.error
          const viewingThisRun =
            tab === 'analyze' &&
            analysisRun.solutionId === validateSolutionId &&
            analysisRun.envKey === validateEnvKey
          if (hasOutcome && !viewingThisRun) {
            const envLabel = analysisRun.envKey.toUpperCase()
            const runningPhase = analysisRun.running
              ? Object.values(analysisRun.phaseStates).find(
                  (p) => p.status === 'running',
                )
              : null
            bars.push(
              <ActivityBar
                key="analyze"
                state={
                  analysisRun.error
                    ? 'error'
                    : analysisRun.running
                      ? 'running'
                      : 'done'
                }
                onView={() => {
                  setValidateSolutionId(analysisRun.solutionId)
                  setValidateEnvKey(analysisRun.envKey)
                  setTab('analyze')
                }}
                onClose={
                  analysisRun.running
                    ? undefined
                    : () => setAnalysisBarHidden(true)
                }
              >
                {analysisRun.running ? (
                  <>
                    Analyzing <strong>{analysisRun.solutionTitle}</strong> (
                    {envLabel})
                    {runningPhase && (
                      <span className="muted">
                        {' '}
                        —{' '}
                        {PHASE_LABELS[
                          runningPhase.key as keyof typeof PHASE_LABELS
                        ] ?? 'running'}
                        …
                      </span>
                    )}
                  </>
                ) : analysisRun.error ? (
                  <>
                    Analysis of <strong>{analysisRun.solutionTitle}</strong>{' '}
                    failed
                  </>
                ) : (
                  <>
                    Analysis of <strong>{analysisRun.solutionTitle}</strong> (
                    {envLabel}) ready
                  </>
                )}
              </ActivityBar>,
            )
          }
        }

        if (readinessRun && !readinessBarHidden) {
          const hasOutcome =
            readinessRun.running ||
            !!readinessRun.result ||
            !!readinessRun.error
          const viewingThisRun =
            tab === 'readiness' &&
            readinessRun.solutionId === readinessSolutionId &&
            readinessRun.envKey === readinessEnvKey
          if (hasOutcome && !viewingThisRun) {
            const envLabel = readinessRun.envKey.toUpperCase()
            const missing = readinessRun.result
              ? readinessRun.result.items.filter(
                  (i) => i.targetStatus === 'missing',
                ).length
              : 0
            bars.push(
              <ActivityBar
                key="readiness"
                state={
                  readinessRun.error
                    ? 'error'
                    : readinessRun.running
                      ? 'running'
                      : 'done'
                }
                onView={() => {
                  setReadinessSolutionId(readinessRun.solutionId)
                  setReadinessEnvKey(readinessRun.envKey)
                  setTab('readiness')
                }}
                onClose={
                  readinessRun.running
                    ? undefined
                    : () => setReadinessBarHidden(true)
                }
              >
                {readinessRun.running ? (
                  <>
                    Checking dependencies for{' '}
                    <strong>{readinessRun.solutionTitle}</strong> ({envLabel})
                    {readinessRun.progress && (
                      <span className="muted"> — {readinessRun.progress}</span>
                    )}
                  </>
                ) : readinessRun.error ? (
                  <>
                    Dependency check for{' '}
                    <strong>{readinessRun.solutionTitle}</strong> failed
                  </>
                ) : (
                  <>
                    Dependency check for{' '}
                    <strong>{readinessRun.solutionTitle}</strong> ({envLabel})
                    ready
                    <span className="muted">
                      {' '}
                      — {missing} missing in {envLabel}
                    </span>
                  </>
                )}
              </ActivityBar>,
            )
          }
        }

        if (bars.length === 0) return null
        return <div className="activity-bars">{bars}</div>
      })()}

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
          defaultPublisherId={defaultPublisherId}
          existingUniqueNames={allSolutions.map((s) => s.uniqueName)}
          canCreateRelease={isDeploymentManager}
          onCreate={(input) => solutionService.createWorkingSolution(input)}
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}

export default App
