import { useEffect, useRef, useState } from 'react'
import {
  MERGEABLE_COMPONENT_TYPES,
  COLLAPSED_COMPONENT_TYPE_LABELS,
  canonicalCollapsedLabel,
  type ComponentCollision,
  type MergeRun,
  type SolutionComponentInfo,
  type TrackSolutionInput,
  type UserRef,
  type WorkingSolution,
} from '../types/solution'
import { solutionService } from '../services/solutionService'
import { formatDateTime, groupBy } from '../utils/format'

interface Props {
  solution: WorkingSolution
  components: SolutionComponentInfo[]
  loadingComponents: boolean
  onRefreshComponents: () => void
  /** Collision-radar findings for this solution (null = not scanned). */
  collisions?: ComponentCollision[] | null
  /** Creates the working-solution record for an untracked solution. */
  onTrack: (input: TrackSolutionInput) => Promise<void>
  /** Unmanaged solutions without a record — candidates for re-linking. */
  linkCandidates: WorkingSolution[]
  /** Re-links an orphaned record to the chosen solution. */
  onLink: (record: WorkingSolution, target: WorkingSolution) => Promise<void>
}

/** Groups with at most this many components start expanded. */
const AUTO_EXPAND_LIMIT = 8

const TRACK_KIND_OPTIONS: { value: TrackSolutionInput['kind']; label: string }[] = [
  { value: 'feature', label: 'Feature' },
  { value: 'bug', label: 'Bug' },
  { value: 'deployment', label: 'Release' },
]

/** Top-N cap for the re-link search results. */
const LINK_RESULT_LIMIT = 10

/**
 * Search-and-pick panel for orphaned records: finds unmanaged solutions
 * that aren't linked to any record yet (by unique or display name) and
 * re-links the record to the chosen one.
 */
function LinkSolutionPanel({
  record,
  candidates,
  onLink,
}: {
  record: WorkingSolution
  candidates: WorkingSolution[]
  onLink: (record: WorkingSolution, target: WorkingSolution) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Results only from 2 characters on — the candidate pool is too large
  // for a useful unfiltered list.
  const q = query.trim().toLowerCase()
  const matches =
    q.length < 2
      ? []
      : candidates
          .filter(
            (c) =>
              c.title.toLowerCase().includes(q) ||
              c.uniqueName.toLowerCase().includes(q),
          )
          .slice(0, LINK_RESULT_LIMIT)

  const link = async (target: WorkingSolution) => {
    setBusyId(target.id)
    setError(null)
    try {
      await onLink(record, target)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusyId(null)
    }
  }

  return (
    <section className="track-panel">
      <h3 className="track-panel-title">Link an existing solution</h3>
      <p className="muted track-panel-hint">
        Search the unmanaged solutions that aren't linked to any record yet
        and pick the right one.
      </p>
      <input
        className="search merge-source-search"
        type="search"
        placeholder="Search by unique name or display name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {matches.length === 0 && (
        <div className="state">
          {candidates.length === 0
            ? 'No unlinked solutions available in this environment.'
            : q.length < 2
              ? 'Type at least 2 characters to search.'
              : `No solution matches “${query}”.`}
        </div>
      )}
      <ul className="link-result-list">
        {matches.map((c) => (
          <li key={c.id}>
            <button
              className="link-result"
              disabled={busyId !== null}
              onClick={() => void link(c)}
            >
              <span className="link-result-title">{c.title}</span>
              <code>{c.uniqueName}</code>
              {c.version && <span className="muted">v{c.version}</span>}
              <span className="link-result-action">
                {busyId === c.id ? 'Linking…' : 'Link'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error && <div className="state state--error">{error}</div>}
    </section>
  )
}

/**
 * Inline form to attach a pro_workingsolution record to an untracked
 * solution ("nacherfassen"). Prefilled from what the solution already
 * reveals (title, detected DevOps number, classified kind).
 */
function TrackPanel({
  solution,
  onTrack,
}: {
  solution: WorkingSolution
  onTrack: (input: TrackSolutionInput) => Promise<void>
}) {
  const [kind, setKind] = useState<TrackSolutionInput['kind']>(
    solution.kind === 'bug' || solution.kind === 'deployment'
      ? solution.kind
      : 'feature',
  )
  const [title, setTitle] = useState(solution.title)
  const [devOpsId, setDevOpsId] = useState(solution.devOpsId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Releases carry no work item id — the field is hidden and not required.
  const needsDevOpsId = kind !== 'deployment'
  const canSubmit =
    !busy && title.trim() !== '' && (!needsDevOpsId || devOpsId.trim() !== '')

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onTrack({
        solutionId: solution.id,
        uniqueName: solution.uniqueName,
        title: title.trim(),
        devOpsId: needsDevOpsId ? devOpsId.trim() : '',
        kind,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <section className="track-panel">
      <h3 className="track-panel-title">No working-solution record yet</h3>
      <p className="muted track-panel-hint">
        Create one to track type, owner, deployment status and merges for
        this solution.
      </p>
      <div className="form-row">
        <span className="form-label">Type</span>
        <div className="chips">
          {TRACK_KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`chip ${kind === opt.value ? 'chip--active' : ''}`}
              onClick={() => setKind(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <label className="form-row">
        <span className="form-label">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {needsDevOpsId && (
        <label className="form-row">
          <span className="form-label">Azure DevOps ID</span>
          <input
            value={devOpsId}
            onChange={(e) => setDevOpsId(e.target.value)}
            placeholder="4711"
          />
        </label>
      )}
      {error && <div className="state state--error">{error}</div>}
      <button
        className="btn btn--primary"
        disabled={!canSubmit}
        onClick={() => void submit()}
      >
        {busy ? 'Creating…' : 'Create working-solution record'}
      </button>
    </section>
  )
}

/**
 * Overlay listing the components one merge run added, grouped by component
 * type — roomy enough for large merges, where the inline table cell would be
 * a cramped comma soup. Closes on backdrop click, the ✕, or Escape.
 */
function MergeRunComponentsModal({
  run,
  onClose,
}: {
  run: MergeRun
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const groups = [...groupBy(run.components, (c) => c.t).entries()]
  // Normal types are listed in full; collapsed types (App Element) get a single
  // counter row at the end so large model-driven-app merges stay readable.
  const byType = groups
    .filter(([type]) => !COLLAPSED_COMPONENT_TYPE_LABELS.has(type))
    .sort((a, b) => a[0].localeCompare(b[0]))
  const rollup = new Map<string, number>()
  for (const [type, items] of groups) {
    if (!COLLAPSED_COMPONENT_TYPE_LABELS.has(type)) continue
    const label = canonicalCollapsedLabel(type)
    rollup.set(label, (rollup.get(label) ?? 0) + items.length)
  }
  const rollupRows = [...rollup.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card modal--wide merge-components-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>
              Added components{' '}
              <span className="muted">({run.components.length})</span>
            </h2>
            <p className="muted merge-components-sub">
              {formatDateTime(run.createdOn)}
              {run.createdBy ? ` · ${run.createdBy}` : ''}
              {run.sources.length ? ` · from ${run.sources.join(', ')}` : ''}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="merge-components-body">
          {byType.map(([type, items]) => (
            <section className="merge-components-group" key={type}>
              <h3 className="merge-components-group-title">
                <span className="merge-plan-type">{type}</span>
                <span className="muted">{items.length}</span>
              </h3>
              <ul className="merge-components-names">
                {items.map((c, i) => (
                  <li key={`${c.n}-${i}`} title={c.n}>
                    {c.n}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {rollupRows.map(([label, count]) => (
            <section
              className="merge-components-group merge-components-rollup"
              key={label}
            >
              <h3 className="merge-components-group-title">
                <span className="merge-plan-type">{label}</span>
                <span className="muted">{count}</span>
              </h3>
              <p className="muted merge-components-rollup-note">
                {count} {count === 1 ? label : `${label}s`} — merged, not listed
                individually
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Read-only summary of a release's merge rules (managed in the Merge Rules
 * tab): the allow-list and exclude-list, or "All types allowed".
 */
function MergeRulesSummary({ solution }: { solution: WorkingSolution }) {
  const labelFor = (c: number) =>
    MERGEABLE_COMPONENT_TYPES.find((t) => t.code === c)?.label ?? `Type ${c}`
  const allow = solution.allowedMergeTypes ?? []
  const exclude = solution.excludedMergeTypes ?? []
  return (
    <div className="merge-allowed-summary">
      <span className="merge-allowed-summary-label">Merge rules</span>
      <span className="muted">
        {allow.length === 0
          ? 'All types allowed'
          : `Allow: ${allow.map(labelFor).join(', ')}`}
        {exclude.length > 0 && ` · Exclude: ${exclude.map(labelFor).join(', ')}`}
      </span>
      <span className="merge-allowed-summary-hint muted">
        manage in Merge Rules
      </span>
    </div>
  )
}

/**
 * Merge history of a release solution: the logged pro_mergerun rows, newest
 * first, as a table. Each row expands to the concrete components that merge
 * added (stored compactly on the row, so no extra query). Loads itself on
 * mount — the parent remounts the detail per solution, so a record-id effect
 * stays correct.
 */
function MergeHistoryPanel({ recordId }: { recordId: string }) {
  const [runs, setRuns] = useState<MergeRun[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The run whose added components are shown in the overlay (null = closed).
  const [detailRun, setDetailRun] = useState<MergeRun | null>(null)

  // The parent remounts the detail per solution (key={solution.id}), so this
  // loads once per opened release — no in-effect state reset needed.
  useEffect(() => {
    let cancelled = false
    solutionService
      .listMergeRuns(recordId)
      .then((r) => {
        if (!cancelled) setRuns(r)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [recordId])

  return (
    <section className="merge-history">
      <h3 className="card-title">
        Merge history{runs && runs.length > 0 && ` (${runs.length})`}
      </h3>
      {error && <div className="state state--error">{error}</div>}
      {!error && runs === null && (
        <div className="state">Loading merge history…</div>
      )}
      {!error && runs?.length === 0 && (
        <div className="state">No merges logged for this release yet.</div>
      )}
      {!error && !!runs?.length && (
        <table className="merge-history-table">
          <thead>
            <tr>
              <th>When</th>
              <th>By</th>
              <th className="num">Added</th>
              <th className="num">Skipped</th>
              <th className="num">Errors</th>
              <th>Sources</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const canExpand = run.components.length > 0
              return (
                <tr
                  key={run.id}
                  className={`merge-history-row ${
                    canExpand ? 'merge-history-row--clickable' : ''
                  }`}
                  onClick={canExpand ? () => setDetailRun(run) : undefined}
                  title={canExpand ? 'View the added components' : undefined}
                >
                  <td>{formatDateTime(run.createdOn)}</td>
                  <td>{run.createdBy ?? '—'}</td>
                  <td className="num">
                    {canExpand ? (
                      <span className="merge-history-added">
                        {run.added}
                        <span
                          className="merge-history-expand"
                          aria-hidden="true"
                        >
                          ⤢
                        </span>
                      </span>
                    ) : (
                      run.added
                    )}
                  </td>
                  <td className="num">{run.skipped}</td>
                  <td
                    className={`num ${run.errors ? 'merge-history-errors' : ''}`}
                  >
                    {run.errors}
                  </td>
                  <td>{run.sources.join(', ') || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {detailRun && (
        <MergeRunComponentsModal
          run={detailRun}
          onClose={() => setDetailRun(null)}
        />
      )}
    </section>
  )
}

/**
 * Reassign-owner panel: a quick "Assign to me" plus a name search to assign
 * to any active user. The parent reloads on success (which unmounts this).
 */
export function AssignOwnerPanel({
  solution,
  onAssignToMe,
  onAssign,
  onSearchUsers,
}: {
  solution: WorkingSolution
  onAssignToMe: (solution: WorkingSolution) => Promise<void>
  onAssign: (solution: WorkingSolution, userId: string) => Promise<void>
  onSearchUsers: (query: string) => Promise<UserRef[]>
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserRef[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const runSearch = (v: string) => {
    setQuery(v)
    window.clearTimeout(timer.current)
    const q = v.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    timer.current = window.setTimeout(() => {
      onSearchUsers(q)
        .then((r) => setResults(r))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 300)
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      // Success → parent reloads and unmounts this panel; keep it disabled.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <section className="track-panel">
      <h3 className="track-panel-title">Reassign owner</h3>
      <p className="muted track-panel-hint">
        Current owner: <strong>{solution.owner ?? '—'}</strong>
      </p>
      <button
        className="btn btn--small btn--primary assign-me"
        disabled={busy}
        onClick={() => void run(() => onAssignToMe(solution))}
      >
        👤 Assign to me
      </button>
      <input
        className="search merge-source-search"
        type="search"
        placeholder="Or search a user by name…"
        value={query}
        onChange={(e) => runSearch(e.target.value)}
      />
      {searching && <div className="state">Searching…</div>}
      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <div className="state">No user matches “{query}”.</div>
      )}
      <ul className="link-result-list">
        {results.map((u) => (
          <li key={u.id}>
            <button
              className="link-result"
              disabled={busy}
              onClick={() => void run(() => onAssign(solution, u.id))}
            >
              <span className="link-result-title">{u.name}</span>
              {u.username && <code>{u.username}</code>}
              <span className="link-result-action">Assign</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <div className="state state--error">{error}</div>}
    </section>
  )
}

export function SolutionDetail({
  solution,
  components,
  loadingComponents,
  onRefreshComponents,
  collisions,
  onTrack,
  linkCandidates,
  onLink,
}: Props) {
  const grouped = [...groupBy(components, (c) => c.typeName).entries()].sort(
    (a, b) => a[0].localeCompare(b[0]),
  )

  // User toggles per type group; groups without an override fall back to the
  // size-based default. The parent remounts this component per solution
  // (key={solution.id}), so state resets when another solution is opened.
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>({})
  const isExpanded = (typeName: string, count: number) =>
    groupOverrides[typeName] ?? count <= AUTO_EXPAND_LIMIT
  const toggleGroup = (typeName: string, count: number) =>
    setGroupOverrides((prev) => ({
      ...prev,
      [typeName]: !isExpanded(typeName, count),
    }))

  return (
    <aside className={`card detail detail--${solution.kind}`}>
      {solution.description && (
        <p className="detail-description">{solution.description}</p>
      )}

      {solution.solutionMissing && (
        <>
          <div className="state state--error">
            The linked solution (<code>{solution.uniqueName || '—'}</code>)
            was not found in this environment — it may have been deleted or
            renamed.
          </div>
          <LinkSolutionPanel
            record={solution}
            candidates={linkCandidates}
            onLink={onLink}
          />
        </>
      )}

      {!solution.recordId && !solution.solutionMissing && (
        <TrackPanel solution={solution} onTrack={onTrack} />
      )}

      {!!collisions?.length && (
        <section className="collision-card">
          <h3 className="collision-card-title">
            ⚠ Shared with other working solutions ({collisions.length})
          </h3>
          <ul className="collision-list">
            {collisions.map((c) => (
              <li key={c.component.objectId} title={c.component.objectId}>
                <span className="collision-component">
                  <span className="merge-plan-type">{c.component.typeName}</span>{' '}
                  {c.component.displayName}
                </span>
                <span className="collision-others muted">
                  also in: {c.otherSolutions.map((o) => o.title).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {solution.kind === 'deployment' && solution.recordId && (
        <MergeRulesSummary solution={solution} />
      )}

      {solution.kind === 'deployment' &&
        solution.recordId &&
        !solution.solutionMissing && (
          <MergeHistoryPanel recordId={solution.recordId} />
        )}

      {!solution.solutionMissing && (
        <div className="detail-components-header">
          <h3 className="card-title">
            Components{!loadingComponents && ` (${components.length})`}
          </h3>
          <button className="btn btn--small" onClick={onRefreshComponents}>
            Refresh
          </button>
        </div>
      )}

      {!solution.solutionMissing && loadingComponents && (
        <div className="state">Loading components…</div>
      )}

      {!solution.solutionMissing &&
        !loadingComponents &&
        components.length === 0 && (
          <div className="state">
            No components yet — add tables, forms or flows to this solution in
            the maker portal and refresh.
          </div>
        )}

      {!solution.solutionMissing &&
        !loadingComponents &&
        grouped.map(([typeName, items]) => {
          const expanded = isExpanded(typeName, items.length)
          return (
            <section key={typeName} className="component-group">
              <button
                className="component-group-toggle"
                onClick={() => toggleGroup(typeName, items.length)}
                aria-expanded={expanded}
              >
                <span
                  className={`component-group-chevron ${
                    expanded ? 'component-group-chevron--open' : ''
                  }`}
                >
                  ▸
                </span>
                <span className="component-group-title">{typeName}</span>
                <span className="muted">({items.length})</span>
              </button>
              {expanded && (
                <ul className="component-list">
                  {items.map((c) => (
                    <li key={c.id} title={c.schemaName ?? c.objectId}>
                      <span className="component-name">{c.displayName}</span>
                      {c.parentTable && (
                        <span className="component-parent muted">
                          {c.parentTable}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
    </aside>
  )
}
