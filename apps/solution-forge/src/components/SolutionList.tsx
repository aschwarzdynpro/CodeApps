import { Fragment, useState, type ReactNode } from 'react'
import type {
  ComponentCollision,
  SolutionComponentInfo,
  SolutionKind,
  WorkingSolution,
} from '../types/solution'
import { isClosedWorkItemState } from '../types/solution'
import { formatRelative } from '../utils/format'
import { devOpsWorkItemUrl } from '../config'

interface Props {
  solutions: WorkingSolution[]
  activeId: string | null
  onOpen: (id: string) => void
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
}

const MAX_SHOWN_MATCHES = 2

/** Key for entries without a work item number when grouping. */
const NO_WORK_ITEM = ''

/** Type pill colour + label per kind. */
const TYPE_STYLE: Record<SolutionKind, { label: string; bg: string; fg: string }> = {
  feature: { label: 'FEATURE', bg: '#e9f0ff', fg: '#3551d6' },
  bug: { label: 'BUG', bg: '#fdeef1', fg: '#cf4b63' },
  deployment: { label: 'RELEASE', bg: '#efeafe', fg: '#6d3fd1' },
  other: { label: 'OTHER', bg: '#eef1f6', fg: '#475569' },
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

/** DevOps work-item state category → chip colours. */
type CatKey = 'green' | 'gray' | 'blue' | 'amber' | 'violet' | 'slate'
const CAT: Record<CatKey, { bg: string; fg: string }> = {
  green: { bg: '#e7f6ec', fg: '#15803d' },
  gray: { bg: '#eef0f4', fg: '#5b6172' },
  blue: { bg: '#e7effd', fg: '#1d4ed8' },
  amber: { bg: '#fdefda', fg: '#b45309' },
  violet: { bg: '#efeafe', fg: '#6d3fd1' },
  slate: { bg: '#eef1f6', fg: '#475569' },
}
/** Last (closed) stage — the synced states are numbered "01-…" up to here. */
const MAX_STAGE = 15

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

/** Map a synced work-item state string to a chip colour + progress percent. */
function deriveDev(status: string): { bg: string; fg: string; pct: string } {
  let cat: CatKey = 'blue'
  let num = 8
  if (isClosedWorkItemState(status)) {
    cat = 'gray'
    num = MAX_STAGE
  } else {
    const m = /^(\d+)/.exec(status)
    num = m ? parseInt(m[1], 10) : 8
    if (/Proposed/i.test(status)) cat = 'slate'
    else if (/Deployment/i.test(status)) cat = 'violet'
    else if (/UAT|Pr(ü|ue)fung|Test|Review/i.test(status)) cat = 'amber'
  }
  const pct = isClosedWorkItemState(status)
    ? 100
    : Math.max(8, Math.round((num / MAX_STAGE) * 100))
  return { bg: CAT[cat].bg, fg: CAT[cat].fg, pct: `${pct}%` }
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
    </div>
  )
}

export function SolutionList({
  solutions,
  activeId,
  onOpen,
  componentMatches,
  collisions,
  groupByWorkItem,
  detail,
  detailClosing,
  onDetailClosed,
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

  const renderRow = (s: WorkingSolution) => {
    const hits = componentMatches?.get(s.id) ?? []
    const duplicateLink = (linkCounts.get(s.id) ?? 0) > 1
    const collCount = collisions?.get(s.id)?.length ?? 0
    const type = TYPE_STYLE[s.kind]
    const status = STATUS_STYLE[stateKey(s)]
    const dev = s.workItemStatus ? deriveDev(s.workItemStatus) : null
    const devUrl = s.devOpsId ? devOpsWorkItemUrl(s.devOpsId) : null
    return (
      <Fragment key={s.recordId ?? s.id}>
        <div
          className={`wsrow ${s.id === activeId ? 'wsrow--active' : ''}`}
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
              className="ws-type"
              style={{ background: type.bg, color: type.fg }}
            >
              {type.label}
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
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#0e9384"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
                    <path d="m3 13 9 5 9-5" />
                  </svg>
                  <code>{s.uniqueName}</code>
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
                  {devUrl ? (
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
                  {dev && s.workItemStatus && (
                    <span
                      className="ws-devstate"
                      style={{ background: dev.bg, color: dev.fg }}
                      title={`DevOps work item status: ${s.workItemStatus}`}
                    >
                      {s.workItemStatus}
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
