import type { MergeRun, ReleaseNote } from '../types/solution'
import type { ImportJobSummary } from '../types/importHistory'
import type { TimelineEvent } from '../types/timeline'

/**
 * Merge the three event sources of one release into a single, newest-first
 * timeline (pure, unit-tested). Events without a usable timestamp are
 * dropped — they can't be placed on a time axis.
 */

/** An import job tagged with the environment it was read from. */
export interface EnvImport {
  job: ImportJobSummary
  envKey: string
  envLabel: string
}

function joinSources(sources: string[], max = 3): string {
  if (sources.length === 0) return ''
  if (sources.length <= max) return sources.join(', ')
  return `${sources.slice(0, max).join(', ')} +${sources.length - max} more`
}

export function buildReleaseTimeline(
  merges: MergeRun[],
  notes: ReleaseNote[],
  imports: EnvImport[],
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const m of merges) {
    if (!m.createdOn) continue
    events.push({
      id: `merge:${m.id}`,
      kind: 'merge',
      at: m.createdOn,
      title: `Merged ${m.added} component${m.added === 1 ? '' : 's'}`,
      subtitle: joinSources(m.sources) ? `from ${joinSources(m.sources)}` : '',
      by: m.createdBy ?? '',
      added: m.added,
      skipped: m.skipped,
      errors: m.errors,
    })
  }

  for (const n of notes) {
    if (!n.createdOn) continue
    events.push({
      id: `note:${n.id}`,
      kind: 'note',
      at: n.createdOn,
      title: `Release notes published${n.version ? ` — v${n.version}` : ''}`,
      subtitle: n.summary,
      by: n.createdBy ?? '',
    })
  }

  for (const { job, envKey, envLabel } of imports) {
    const at = job.startedOn || job.completedOn
    if (!at) continue
    events.push({
      id: `import:${envKey}:${job.id}`,
      kind: 'import',
      at,
      title:
        job.status === 'failed'
          ? `Import into ${envLabel} failed`
          : job.status === 'running'
            ? `Import into ${envLabel} running`
            : `Imported into ${envLabel}`,
      subtitle: job.context,
      by: job.createdBy,
      envKey,
      envLabel,
      status: job.status,
    })
  }

  return events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )
}
