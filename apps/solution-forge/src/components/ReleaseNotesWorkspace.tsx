import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MergeRun, ReleaseNote, WorkingSolution } from '../types/solution'
import { solutionService } from '../services/solutionService'
import {
  buildReleaseNotes,
  type ReleaseNotesContent,
} from '../services/releaseNotes'
import { formatDateTime } from '../utils/format'
import { DEPLOYMENT_MANAGER_ROLE } from '../config'
import { SolutionSelect } from './SolutionSelect'

interface Props {
  solutions: WorkingSolution[]
  /** Publishing (writing snapshots) is restricted to deployment managers. */
  canPublish: boolean
}

type SubTab = 'draft' | 'history'

/**
 * Render the inline span syntax we emit — `code`, [label](url), **bold** — to
 * React nodes. Underscores are NOT treated as italic (component schema names
 * contain them); whole-line italics are handled at the block level.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)/g
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('`')) {
      nodes.push(<code key={`${keyPrefix}-${i}`}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('[')) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      const label = lm ? lm[1] : token
      const href = lm && /^https?:\/\//i.test(lm[2]) ? lm[2] : null
      nodes.push(
        href ? (
          <a key={`${keyPrefix}-${i}`} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          label
        ),
      )
    } else {
      nodes.push(<strong key={`${keyPrefix}-${i}`}>{token.slice(2, -2)}</strong>)
    }
    last = m.index + token.length
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/**
 * Minimal Markdown renderer for the subset we generate (headings, bullet
 * lists, whole-line italics, and the inline spans above). Returns React nodes
 * — no dangerouslySetInnerHTML, link hrefs restricted to http(s).
 */
function renderMarkdown(md: string): ReactNode {
  const blocks: ReactNode[] = []
  let list: ReactNode[] | null = null
  let listKey = 0
  const flushList = () => {
    if (list) {
      blocks.push(<ul key={`ul-${listKey++}`}>{list}</ul>)
      list = null
    }
  }
  md.split('\n').forEach((raw, idx) => {
    const line = raw.trimEnd()
    if (line === '') {
      flushList()
      return
    }
    if (line.startsWith('- ')) {
      list ??= []
      list.push(<li key={`li-${idx}`}>{renderInline(line.slice(2), `li-${idx}`)}</li>)
      return
    }
    flushList()
    if (line.startsWith('### '))
      blocks.push(<h4 key={`h-${idx}`}>{renderInline(line.slice(4), `h-${idx}`)}</h4>)
    else if (line.startsWith('## '))
      blocks.push(<h3 key={`h-${idx}`}>{renderInline(line.slice(3), `h-${idx}`)}</h3>)
    else if (line.startsWith('# '))
      blocks.push(<h2 key={`h-${idx}`}>{renderInline(line.slice(2), `h-${idx}`)}</h2>)
    else {
      const italic = /^_(.+)_$/.exec(line)
      blocks.push(
        <p key={`p-${idx}`}>
          {italic ? (
            <em>{renderInline(italic[1], `p-${idx}`)}</em>
          ) : (
            renderInline(line, `p-${idx}`)
          )}
        </p>,
      )
    }
  })
  flushList()
  return blocks
}

/** Markdown (rendered) | Raw (plain text) toggle + copy. */
function NotesView({ markdown, text }: { markdown: string; text: string }) {
  const [format, setFormat] = useState<'markdown' | 'raw'>('markdown')
  const [copied, setCopied] = useState(false)
  const content = format === 'markdown' ? markdown : text
  const copy = () => {
    void navigator.clipboard
      ?.writeText(content)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {})
  }
  return (
    <div className="notes-view">
      <div className="notes-view-toolbar">
        <div className="chips">
          <button
            className={`chip ${format === 'markdown' ? 'chip--active' : ''}`}
            onClick={() => setFormat('markdown')}
          >
            Markdown
          </button>
          <button
            className={`chip ${format === 'raw' ? 'chip--active' : ''}`}
            onClick={() => setFormat('raw')}
          >
            Raw
          </button>
        </div>
        <button
          className="btn btn--small"
          onClick={copy}
          title={
            format === 'markdown'
              ? 'Copy the Markdown source'
              : 'Copy the plain text'
          }
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      {format === 'markdown' ? (
        <div className="notes-rendered">{renderMarkdown(markdown)}</div>
      ) : (
        <pre className="notes-pre">{text}</pre>
      )}
    </div>
  )
}

/**
 * Loads and renders the release notes for one chosen release. Keyed by the
 * release id in the parent, so it mounts fresh per release and the data load
 * needs no in-effect state reset (lint-safe — setState only in callbacks).
 */
function ReleaseNotesForRelease({
  release,
  solutions,
  canPublish,
}: {
  release: WorkingSolution
  solutions: WorkingSolution[]
  canPublish: boolean
}) {
  const recordId = release.recordId as string
  const [runs, setRuns] = useState<MergeRun[] | null>(null)
  const [notes, setNotes] = useState<ReleaseNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<SubTab>('draft')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  // Stable "generated at" for the draft — set once on mount.
  const [generatedAt] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false
    Promise.all([
      solutionService.listMergeRuns(recordId),
      solutionService.listReleaseNotes(recordId),
    ])
      .then(([r, n]) => {
        if (cancelled) return
        setRuns(r)
        setNotes(n)
        if (n.length > 0) setSelectedNoteId(n[0].id)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [recordId])

  const draft = useMemo<ReleaseNotesContent | null>(
    () => (runs ? buildReleaseNotes(release, runs, solutions, generatedAt) : null),
    [runs, release, solutions, generatedAt],
  )

  const latest = notes && notes.length > 0 ? notes[0] : null
  const hasMerges = !!runs && runs.length > 0
  const unchanged =
    !!latest && !!draft && latest.markdown.trim() === draft.markdown.trim()

  const publish = () => {
    if (!draft || publishing || unchanged || !hasMerges || !canPublish) return
    setPublishing(true)
    setPublishError(null)
    const version = release.version || '—'
    const name = `Release Notes — ${release.title} v${version} · ${generatedAt
      .toISOString()
      .slice(0, 10)}`
    solutionService
      .publishReleaseNotes({
        releaseRecordId: recordId,
        name,
        version,
        markdown: draft.markdown,
        text: draft.text,
        summary: draft.summary,
      })
      .then((note) => {
        setNotes((prev) => [note, ...(prev ?? [])])
        setSelectedNoteId(note.id)
        setSubTab('history')
      })
      .catch((e) =>
        setPublishError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setPublishing(false))
  }

  const publishTitle = !canPublish
    ? `Publishing requires the security role “${DEPLOYMENT_MANAGER_ROLE}”.`
    : !hasMerges
      ? 'Nothing merged into this release yet.'
      : unchanged
        ? 'Already up to date — identical to the latest published version.'
        : undefined

  if (error) return <div className="state state--error">{error}</div>
  if (runs === null || notes === null)
    return <div className="state">Loading release notes…</div>

  const selectedNote = notes.find((n) => n.id === selectedNoteId) ?? null

  return (
    <>
      <nav className="subtabs">
        <button
          className={`subtab ${subTab === 'draft' ? 'subtab--active' : ''}`}
          onClick={() => setSubTab('draft')}
        >
          Draft
        </button>
        <button
          className={`subtab ${subTab === 'history' ? 'subtab--active' : ''}`}
          onClick={() => setSubTab('history')}
        >
          History{notes.length > 0 ? ` (${notes.length})` : ''}
        </button>
      </nav>

      {subTab === 'draft' && (
        <>
          {!hasMerges && (
            <div className="state">
              No merges logged for this release yet — nothing to generate.
            </div>
          )}
          {hasMerges && draft && (
            <>
              <div className="card notes-actions">
                <div className="notes-actions-meta">
                  <span className="muted">{draft.summary}</span>
                  {unchanged && (
                    <span className="notes-uptodate">
                      ✓ Up to date with the latest published version
                    </span>
                  )}
                </div>
                <button
                  className="btn btn--primary"
                  disabled={!canPublish || unchanged || publishing}
                  title={publishTitle}
                  onClick={publish}
                >
                  {publishing ? 'Publishing…' : '⬆ Publish'}
                </button>
              </div>
              {publishError && (
                <div className="state state--error">{publishError}</div>
              )}
              <div className="card">
                <NotesView markdown={draft.markdown} text={draft.text} />
              </div>
            </>
          )}
        </>
      )}

      {subTab === 'history' && (
        <>
          {notes.length === 0 ? (
            <div className="state">
              No published release notes yet — generate the draft and{' '}
              <strong>Publish</strong> to save the first version.
            </div>
          ) : (
            <div className="notes-history">
              <ul className="notes-history-list card">
                {notes.map((n) => (
                  <li key={n.id}>
                    <button
                      className={`notes-history-row ${
                        n.id === selectedNoteId ? 'notes-history-row--active' : ''
                      }`}
                      onClick={() => setSelectedNoteId(n.id)}
                    >
                      <span className="notes-history-when">
                        {formatDateTime(n.createdOn)}
                      </span>
                      <span className="notes-history-summary muted">
                        {n.summary}
                        {n.version ? ` · v${n.version}` : ''}
                      </span>
                      {n.createdBy && (
                        <span className="notes-history-by muted">
                          {n.createdBy}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {selectedNote && (
                <div className="card">
                  <NotesView
                    markdown={selectedNote.markdown}
                    text={selectedNote.text}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

/**
 * Release Notes workspace: pick a release solution, see the live draft
 * generated from its merge history (Raw|Markdown + copy), publish a frozen
 * snapshot (deployment managers only) and browse the published history.
 */
export function ReleaseNotesWorkspace({ solutions, canPublish }: Props) {
  const releases = solutions.filter(
    (s, index) =>
      s.kind === 'deployment' &&
      !s.solutionMissing &&
      !!s.recordId &&
      solutions.findIndex((o) => o.id === s.id) === index,
  )
  const [solutionId, setSolutionId] = useState('')
  const release = releases.find((s) => s.id === solutionId) ?? null

  return (
    <div>
      <div className="card compare-controls">
        <div className="compare-picker">
          <span className="form-label">Release solution</span>
          <SolutionSelect
            options={releases}
            value={solutionId}
            onChange={setSolutionId}
            placeholder="Select a release solution"
          />
        </div>
      </div>

      {!release ? (
        <div className="state">
          Select a release solution above — its release notes are generated from
          the merge history and can be published and revisited here.
        </div>
      ) : (
        <ReleaseNotesForRelease
          key={release.id}
          release={release}
          solutions={solutions}
          canPublish={canPublish}
        />
      )}
    </div>
  )
}
