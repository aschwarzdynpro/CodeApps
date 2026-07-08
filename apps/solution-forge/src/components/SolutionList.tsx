import { Fragment, useState, type ReactNode } from 'react'
import type {
  ComponentCollision,
  SolutionComponentInfo,
  SolutionKind,
  WorkingSolution,
} from '../types/solution'
import { isOpenStatus } from '../types/solution'
import { formatRelative } from '../utils/format'
import { devOpsWorkItemUrl, makerSolutionUrl } from '../config'
import { deriveStateVisual, type StateOrders } from '../utils/workItemProgress'

interface Props {
  solutions: WorkingSolution[]
  activeId: string | null
  onOpen: (id: string) => void
  /** Maker-portal links need the host environment id. */
  environmentId: string | null
  /** Live Azure DevOps work-item type + state per devOpsId (from a loaded work
   *  item); overrides the last synced status on the row badge once it arrives,
   *  and the type drives the real per-type progress. */
  liveWorkItems?: Map<string, { type: string; state: string }>
  /** Ordered states per work-item type — the progress bar's real workflow order
   *  (empty until fetched; rows then fall back to the numeric-name heuristic). */
  stateOrders?: StateOrders
  /** Components that matched the active search, keyed by solution id. */
  componentMatches?: Map<string, SolutionComponentInfo[]>
  /** Collision-radar result, keyed by solution id (null = not scanned). */
  collisions?: Map<string, ComponentCollision[]> | null
  /** Group entries sharing the same Azure DevOps work item number. */
  groupByWorkItem?: boolean
  /** Detail pane for the active row, rendered inline beneath it. */
  detail?: ReactNode
  /** True while the inline detail plays its fade-out before unmounting. */
  detailClosing?: boolean
  /** Fired when the fade-out animation ends so the parent can drop selection. */
  onDetailClosed?: () => void
  /** Deployment-manager role — gates Edit/Delete on Release solutions. */
  canManageReleases: boolean
  /** Peek the DevOps work item in a drawer (only wired when DevOps is on).
   *  When set, the row's #id opens the drawer instead of linking out. */
  onOpenWorkItem?: (solution: WorkingSolution) => void
  /** Row quick-actions (also available without opening the detail). */
  onEdit: (solution: WorkingSolution) => void
  onComplete: (solution: WorkingSolution) => void
  onDelete: (solution: WorkingSolution) => void
  onRequestAssign: (solution: WorkingSolution) => void
  /** Jump to Merge with this solution pre-selected as a source. */
  onMerge: (solution: WorkingSolution) => void
}

const MAX_SHOWN_MATCHES = 2

/** Key for entries without a work item number when grouping. */
const NO_WORK_ITEM = ''

/** Accent colour + label per kind (drives the row's left border + type icon). */
const TYPE_META: Record<SolutionKind, { label: string; color: string }> = {
  feature: { label: 'Feature', color: '#7c4ca7' },
  bug: { label: 'Bug', color: '#cf4b63' },
  deployment: { label: 'Release', color: '#c2620e' },
  other: { label: 'Other', color: '#475569' },
}

/** A distinct line icon per kind (inherits the accent colour via currentColor). */
const TYPE_ICON: Record<SolutionKind, ReactNode> = {
  feature: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  ),
  bug: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="13" rx="7.5" ry="8" />
      <path d="M12 5.5V21" />
      <path d="M9.5 3.5 11 5.5M14.5 3.5 13 5.5" />
      <circle cx="12" cy="6.5" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="8" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="16" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  deployment: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 11.5 11.5 3H20a1 1 0 0 1 1 1v8.5L12.5 21a1.4 1.4 0 0 1-2 0L3 13.5a1.4 1.4 0 0 1 0-2Z" />
      <circle cx="16.4" cy="7.6" r="1.3" />
    </svg>
  ),
  other: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M9 9h6M9 13h6" />
    </svg>
  ),
}

type StateKey = 'both' | 'record-only' | 'solution-only'

/** Sync/link status chip per "what exists" state. */
const STATUS_STYLE: Record<
  StateKey,
  { label: string; bg: string; fg: string; dot: string; title: string }
> = {
  both: {
    label: 'Synced',
    bg: '#e7f6ec',
    fg: '#15803d',
    dot: '#16a34a',
    title: 'Fully synced — working-solution record and solution are linked.',
  },
  'record-only': {
    label: 'WS only',
    bg: '#fdefda',
    fg: '#b45309',
    dot: '#d97706',
    title:
      'Working solution only — no deployed solution. Re-link it in the detail pane.',
  },
  'solution-only': {
    label: 'Sol only',
    bg: '#e7effd',
    fg: '#1d4ed8',
    dot: '#2563eb',
    title:
      'Solution only — no working-solution record yet. Track it in the detail pane.',
  },
}

function stateKey(s: WorkingSolution): StateKey {
  return s.recordId ? (s.solutionMissing ? 'record-only' : 'both') : 'solution-only'
}

function cleanOwner(name: string): string {
  return name.replace(/^#\s*/, '')
}

function initials(name: string): string {
  const clean = name
    .replace(/^#\s*/, '')
    .replace(/^Extern\s+/i, '')
    .trim()
  const parts = clean.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

/**
 * Copy the solution's unique name to the clipboard. Clicks stop propagating so
 * they don't also toggle the row's detail pane.
 */
function CopyUniqueName({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {})
  }
  return (
    <span
      className={`copy-chip ${copied ? 'copy-chip--done' : ''}`}
      role="button"
      tabIndex={0}
      title={copied ? 'Copied!' : `Copy unique name “${value}”`}
      aria-label={`Copy unique name ${value}`}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        copy()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation()
          e.preventDefault()
          copy()
        }
      }}
    >
      {copied ? '✓' : '⧉'}
    </span>
  )
}

/** Column header with the design's colour-coded section dots. */
function TableHead() {
  return (
    <div className="ws-head">
      <div className="ws-hcell">Type</div>
      <div className="ws-hcell ws-hcell--dot">
        <span className="ws-hdot" style={{ background: '#5b54e8' }} />
        Working Solution
      </div>
      <div className="ws-hcell ws-hcell--dot ws-hcell--bl">
        <span className="ws-hdot" style={{ background: '#0e9384' }} />
        Solution
      </div>
      <div className="ws-hcell ws-hcell--dot ws-hcell--bl">
        <span className="ws-hdot" style={{ background: '#2563eb' }} />
        DevOps Item
      </div>
      <div className="ws-hcell ws-hcell--bl ws-hcell--right">Status</div>
      <div className="ws-hcell ws-hcell--bl ws-hcell--right">Actions</div>
    </div>
  )
}

export function SolutionList({
  solutions,
  activeId,
  onOpen,
  environmentId,
  liveWorkItems,
  stateOrders,
  componentMatches,
  collisions,
  groupByWorkItem,
  detail,
  detailClosing,
  onDetailClosed,
  canManageReleases,
  onOpenWorkItem,
  onEdit,
  onComplete,
  onDelete,
  onRequestAssign,
  onMerge,
}: Props) {
  // Several working-solution records pointing at the same real solution is
  // a data smell worth surfacing (e.g. duplicate tracking rows).
  const linkCounts = new Map<string, number>()
  for (const s of solutions) {
    if (s.recordId && !s.solutionMissing)
      linkCounts.set(s.id, (linkCounts.get(s.id) ?? 0) + 1)
  }

  if (solutions.length === 0) {
    return (
      <div className="card solution-list--empty">
        No solutions match the current filter.
      </div>
    )
  }

  // The detail pane is rendered inline directly beneath the active row, so the
  // table can use the full page width. A click on the active row collapses it
  // (the parent drives the fade-out via `detailClosing`).
  const renderInlineDetail = (s: WorkingSolution) =>
    s.id === activeId && detail ? (
      <div
        className={`inline-detail ${
          detailClosing ? 'inline-detail--closing' : ''
        }`}
        onAnimationEnd={
          detailClosing
            ? (e) => {
                if (e.target === e.currentTarget) onDetailClosed?.()
              }
            : undefined
        }
      >
        {detail}
      </div>
    ) : null

  // Running index across all rendered rows (groups included) for zebra striping.
  let rowSeq = 0

  const renderRow = (s: WorkingSolution) => {
    const alt = rowSeq++ % 2 === 1
    const hits = componentMatches?.get(s.id) ?? []
    const duplicateLink = (linkCounts.get(s.id) ?? 0) > 1
    const collCount = collisions?.get(s.id)?.length ?? 0
    const type = TYPE_META[s.kind]
    const status = STATUS_STYLE[stateKey(s)]
    // Prefer the live work-item type + state (from a loaded work item) over the
    // last synced status, so opening a row refreshes its badge immediately and
    // the progress reflects the real per-type workflow position.
    const live = s.devOpsId ? liveWorkItems?.get(s.devOpsId) : undefined
    const wiStatus = live?.state || s.workItemStatus
    const dev = wiStatus
      ? deriveStateVisual(wiStatus, live?.type, stateOrders)
      : null
    const devUrl = s.devOpsId ? devOpsWorkItemUrl(s.devOpsId) : null
    // With DevOps on, the #id opens the work-item drawer (peek) instead of
    // linking straight out — the drawer carries the "Open ↗" link itself.
    const canPeek = !!onOpenWorkItem && /^\d+$/.test(s.devOpsId ?? '')
    const makerUrl = s.solutionMissing
      ? null
      : makerSolutionUrl(environmentId, s.id)
    const canComplete = !!s.recordId && isOpenStatus(s)
    const canMerge =
      (s.kind === 'feature' || s.kind === 'bug') &&
      !!s.recordId &&
      !s.solutionMissing
    // Editing / deleting a Release is restricted to deployment managers.
    const releaseLocked = s.kind === 'deployment' && !canManageReleases
    return (
      <Fragment key={s.recordId ?? s.id}>
        <div
          className={`wsrow ${s.id === activeId ? 'wsrow--active' : ''} ${
            alt ? 'wsrow--alt' : ''
          }`}
          style={{ borderLeftColor: type.color }}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(s.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onOpen(s.id)
            }
          }}
        >
          {/* Type */}
          <div className="wscell wscell--type">
            <span
              className="ws-typeicon"
              style={{ color: type.color }}
              title={type.label}
              aria-label={type.label}
            >
              {TYPE_ICON[s.kind]}
            </span>
          </div>

          {/* Working Solution */}
          <div className="wscell wscell--main">
            <div className="ws-title">{s.title}</div>
            <div className="ws-subline">
              {s.owner && (
                <span className="ws-owner" title={cleanOwner(s.owner)}>
                  <span className="ws-avatar">{initials(s.owner)}</span>
                  <span className="ws-owner-name">{cleanOwner(s.owner)}</span>
                </span>
              )}
              {s.toBeCompleted && (
                <span
                  className="tbc-chip"
                  title="The DevOps work item is closed but this solution is still open — ready to mark completed."
                >
                  ✓ to be completed
                </span>
              )}
              {duplicateLink && (
                <span
                  className="dup-chip"
                  title="Multiple working-solution records link to this solution — consider cleaning up."
                >
                  duplicate link
                </span>
              )}
              {collCount > 0 && (
                <span
                  className="coll-chip"
                  title="This solution shares components with other open working solutions — see the detail pane."
                >
                  ⚠ {collCount} shared
                </span>
              )}
            </div>
            {hits.length > 0 && (
              <div className="ws-hits">
                {hits.slice(0, MAX_SHOWN_MATCHES).map((c) => (
                  <span key={c.id} className="hit-chip" title={c.typeName}>
                    {c.displayName}
                  </span>
                ))}
                {hits.length > MAX_SHOWN_MATCHES && (
                  <span className="hit-more">
                    +{hits.length - MAX_SHOWN_MATCHES} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Solution */}
          <div className="wscell wscell--sol">
            {s.solutionMissing ? (
              <span className="ws-notlinked">Not linked</span>
            ) : (
              <>
                <div className="ws-sol-name">
                  {makerUrl ? (
                    <a
                      className="ws-sol-pill"
                      href={makerUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Open this solution in the Maker Portal"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 3 3 8l9 5 9-5-9-5Z" />
                        <path d="m3 13 9 5 9-5" />
                      </svg>
                      <code>{s.uniqueName}</code>
                      <span className="ws-sol-ext" aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  ) : (
                    <span className="ws-sol-pill ws-sol-pill--static">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 3 3 8l9 5 9-5-9-5Z" />
                        <path d="m3 13 9 5 9-5" />
                      </svg>
                      <code>{s.uniqueName}</code>
                    </span>
                  )}
                  <CopyUniqueName value={s.uniqueName} />
                </div>
                {s.version && <span className="ws-version">v{s.version}</span>}
              </>
            )}
          </div>

          {/* DevOps Item */}
          <div className="wscell wscell--dev">
            {s.devOpsId ? (
              <>
                <div className="ws-dev-head">
                  {canPeek ? (
                    <button
                      type="button"
                      className="ws-dev-id ws-dev-id--peek"
                      title="View work item details"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenWorkItem?.(s)
                      }}
                    >
                      #{s.devOpsId}
                    </button>
                  ) : devUrl ? (
                    <a
                      className="ws-dev-id"
                      href={devUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      #{s.devOpsId}
                    </a>
                  ) : (
                    <span className="ws-dev-id">#{s.devOpsId}</span>
                  )}
                  {dev && wiStatus && (
                    <span
                      className="ws-devstate"
                      style={{ background: dev.bg, color: dev.fg }}
                      title={`DevOps work item status: ${wiStatus}`}
                    >
                      {wiStatus}
                    </span>
                  )}
                </div>
                {dev && (
                  <div className="ws-dev-progress">
                    <span className="ws-bar">
                      <span
                        className="ws-bar-fill"
                        style={{ width: dev.pct, background: dev.fg }}
                      />
                    </span>
                    <span className="ws-pct">{dev.pct}</span>
                  </div>
                )}
              </>
            ) : (
              <span className="ws-notlinked">Not linked</span>
            )}
          </div>

          {/* Status */}
          <div className="wscell wscell--status">
            <span
              className="ws-sync"
              style={{ background: status.bg, color: status.fg }}
              title={status.title}
            >
              <span className="ws-sync-dot" style={{ background: status.dot }} />
              {status.label}
            </span>
            <span className="ws-when">{formatRelative(s.modifiedOn)}</span>
          </div>

          {/* Quick actions (revealed on hover / focus / when open) */}
          <div className="wscell wscell--actions">
            <div className="ws-actions">
              {s.recordId && !releaseLocked && (
                <button
                  className="ws-act"
                  title="Edit working solution"
                  aria-label="Edit working solution"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(s)
                  }}
                >
                  ✎
                </button>
              )}
              {canComplete && (
                <button
                  className="ws-act"
                  title="Mark completed"
                  aria-label="Mark completed"
                  onClick={(e) => {
                    e.stopPropagation()
                    onComplete(s)
                  }}
                >
                  ✓
                </button>
              )}
              {canMerge && (
                <button
                  className="ws-act"
                  title="Merge into a release"
                  aria-label="Merge into a release"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMerge(s)
                  }}
                >
                  ⇉
                </button>
              )}
              {s.recordId && (
                <button
                  className="ws-act"
                  title="Reassign owner"
                  aria-label="Reassign owner"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRequestAssign(s)
                  }}
                >
                  👤
                </button>
              )}
              {!releaseLocked && (
                <button
                  className="ws-act ws-act--danger"
                  title="Delete"
                  aria-label="Delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(s)
                  }}
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        </div>
        {renderInlineDetail(s)}
      </Fragment>
    )
  }

  if (!groupByWorkItem) {
    return (
      <div className="card ws-table">
        <TableHead />
        {solutions.map(renderRow)}
      </div>
    )
  }

  // Group by work item number, preserving the incoming sort.
  const groups = new Map<string, WorkingSolution[]>()
  for (const s of solutions) {
    const key = s.devOpsId ?? NO_WORK_ITEM
    const bucket = groups.get(key)
    if (bucket) bucket.push(s)
    else groups.set(key, [s])
  }
  const ordered = [...groups.entries()].sort((a, b) =>
    a[0] === NO_WORK_ITEM ? 1 : b[0] === NO_WORK_ITEM ? -1 : 0,
  )

  return (
    <div className="card ws-table">
      <TableHead />
      {ordered.map(([key, members]) => (
        <Fragment key={key || 'none'}>
          <div className="ws-group-head">
            <span className="ws-group-title">
              {key ? `#${key}` : 'Without work item'}
            </span>
            <span
              className={`ws-group-count ${
                members.length > 1 ? 'ws-group-count--multi' : ''
              }`}
              title={
                members.length > 1
                  ? 'Several solutions share this work item number.'
                  : undefined
              }
            >
              {members.length} solution{members.length === 1 ? '' : 's'}
            </span>
          </div>
          {members.map(renderRow)}
        </Fragment>
      ))}
    </div>
  )
}
