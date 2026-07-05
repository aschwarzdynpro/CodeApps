import { useEffect, useMemo, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import type { TimelineEvent, TimelineEventKind } from '../types/timeline'
import { solutionService } from '../services/solutionService'
import { importHistoryService } from '../services/importHistoryService'
import {
  buildReleaseTimeline,
  type EnvImport,
} from '../utils/releaseTimeline'
import { ENVIRONMENTS } from '../config'
import { SolutionSelect } from './SolutionSelect'

/**
 * Release Timeline — "what went where, when" for one release: its merge runs
 * (`pro_mergerun`), published release notes (`pro_releasenote`) and its
 * imports (`importjob`, matched by unique name) across every configured
 * environment, on a single newest-first time axis. Pure visualization of
 * existing data; per-environment read failures degrade to a notice.
 */
interface Props {
  solutions: WorkingSolution[]
}

const KIND_META: Record<
  TimelineEventKind,
  { icon: string; label: string; cls: string }
> = {
  merge: { icon: '⇉', label: 'Merges', cls: 'rtl-dot--merge' },
  note: { icon: '📝', label: 'Release notes', cls: 'rtl-dot--note' },
  import: { icon: '📦', label: 'Imports', cls: 'rtl-dot--import' },
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

export function ReleaseTimelineWorkspace({ solutions }: Props) {
  const releases = solutions.filter(
    (s, index) =>
      s.kind === 'deployment' &&
      !s.solutionMissing &&
      !!s.recordId &&
      solutions.findIndex((o) => o.id === s.id) === index,
  )
  const [solutionId, setSolutionId] = useState('')
  const release = releases.find((s) => s.id === solutionId) ?? null

  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [envErrors, setEnvErrors] = useState<string[]>([])
  const [kinds, setKinds] = useState<Set<TimelineEventKind>>(
    () => new Set(['merge', 'note', 'import']),
  )

  useEffect(() => {
    if (!release?.recordId) {
      setEvents(null)
      return
    }
    const recordId = release.recordId
    const uniqueName = release.uniqueName.toLowerCase()
    let cancelled = false
    const t = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      setEnvErrors([])
      void (async () => {
        try {
          const envs = ENVIRONMENTS
          const [merges, notes, ...importsPerEnv] = await Promise.all([
            solutionService.listMergeRuns(recordId),
            solutionService.listReleaseNotes(recordId),
            ...envs.map(async (env) => {
              try {
                const jobs = await importHistoryService.listImportJobs(env.key)
                return jobs
                  .filter(
                    (j) => j.solutionName.toLowerCase() === uniqueName,
                  )
                  .map<EnvImport>((job) => ({
                    job,
                    envKey: env.key,
                    envLabel: env.label,
                  }))
              } catch (err) {
                if (!cancelled)
                  setEnvErrors((prev) => [
                    ...prev,
                    `${env.label}: ${err instanceof Error ? err.message : String(err)}`,
                  ])
                return [] as EnvImport[]
              }
            }),
          ])
          if (!cancelled)
            setEvents(buildReleaseTimeline(merges, notes, importsPerEnv.flat()))
        } catch (err) {
          if (!cancelled)
            setError(err instanceof Error ? err.message : String(err))
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, 20)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [release?.recordId, release?.uniqueName])

  const toggleKind = (kind: TimelineEventKind) =>
    setKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })

  const visible = useMemo(
    () => (events ?? []).filter((e) => kinds.has(e.kind)),
    [events, kinds],
  )

  const counts = useMemo(() => {
    const c: Record<TimelineEventKind, number> = { merge: 0, note: 0, import: 0 }
    for (const e of events ?? []) c[e.kind]++
    return c
  }, [events])

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
        {events && (
          <div className="chips rtl-filter">
            {(Object.keys(KIND_META) as TimelineEventKind[]).map((kind) => (
              <button
                key={kind}
                className={`chip ${kinds.has(kind) ? 'chip--active' : ''}`}
                onClick={() => toggleKind(kind)}
              >
                {KIND_META[kind].icon} {KIND_META[kind].label} ({counts[kind]})
              </button>
            ))}
          </div>
        )}
      </div>

      {!release && (
        <div className="state">
          Select a release solution above — the timeline then collects its
          merges, published release notes and imports across the configured
          environments.
        </div>
      )}

      {error && <div className="state state--error">{error}</div>}
      {envErrors.length > 0 && (
        <div className="state">
          Some environments could not be read (their imports are missing from
          the timeline):
          <ul className="merge-errors">
            {envErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {release && loading && !events && (
        <div className="state">Collecting the release history…</div>
      )}

      {release && events && events.length === 0 && (
        <div className="state">
          Nothing recorded yet for <strong>{release.title}</strong> — no merge
          runs, release notes or imports found.
        </div>
      )}

      {release && events && events.length > 0 && visible.length === 0 && (
        <div className="state">Every event kind is filtered out.</div>
      )}

      {visible.length > 0 && (
        <div className="rtl card">
          {visible.map((e) => (
            <div key={e.id} className="rtl-row">
              <div className="rtl-when">
                <span className="rtl-time" title={new Date(e.at).toLocaleString()}>
                  {fmtDateTime(e.at)}
                </span>
              </div>
              <div className="rtl-axis">
                <span
                  className={`rtl-dot ${KIND_META[e.kind].cls} ${e.status === 'failed' ? 'rtl-dot--failed' : ''}`}
                >
                  {KIND_META[e.kind].icon}
                </span>
              </div>
              <div
                className={`rtl-card ${e.status === 'failed' ? 'rtl-card--failed' : ''}`}
              >
                <div className="rtl-title">
                  {e.title}
                  {e.envLabel && (
                    <span
                      className={`jobs-status ${
                        e.status === 'failed'
                          ? 'jobs-status--failed'
                          : e.status === 'running'
                            ? 'jobs-status--running'
                            : 'jobs-status--ok'
                      }`}
                    >
                      {e.envLabel}
                    </span>
                  )}
                  {e.kind === 'merge' && (
                    <span className="rtl-counts muted">
                      +{e.added ?? 0}
                      {e.skipped ? ` · ${e.skipped} skipped` : ''}
                      {e.errors ? ` · ${e.errors} failed` : ''}
                    </span>
                  )}
                </div>
                {e.subtitle && <div className="rtl-sub muted">{e.subtitle}</div>}
                {e.by && <div className="rtl-by muted">by {e.by}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
