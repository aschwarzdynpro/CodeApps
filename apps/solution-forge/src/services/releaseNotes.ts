import type { MergeRun, WorkingSolution, WorkItemInfo } from '../types/solution'
import {
  COLLAPSED_COMPONENT_TYPE_LABELS,
  canonicalCollapsedLabel,
} from '../types/solution'
import { devOpsWorkItemUrl } from '../config'

/** The generated release-notes draft, in both render formats plus a summary. */
export interface ReleaseNotesContent {
  markdown: string
  text: string
  /** "N solutions · M components" — also stored for the history list. */
  summary: string
}

interface IncludedSolution {
  title: string
  devOpsId: string | null
  url: string | null
  /** Enriched from Azure DevOps (batch read) when available, for the
   *  type-grouped listing. Undefined ⇒ falls back to the plain title/#id line. */
  wi?: WorkItemInfo
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Build release notes for a release solution from its merge history. Pure and
 * deterministic (pass `generatedAt`) so it's testable and produces a faithful
 * snapshot on publish. Lists the included source solutions (best-effort DevOps
 * links) and every added component grouped by type; collapsed types
 * (App Element) are rolled up to a counter.
 */
export function buildReleaseNotes(
  release: WorkingSolution,
  runs: MergeRun[],
  solutions: WorkingSolution[],
  generatedAt: Date,
  /** ISO date-time of the previous published note — adds an "incremental"
   *  subtitle. The caller is responsible for passing only the runs since then. */
  sincePublishedOn?: string | null,
  /** devOpsId → work item (batch-read by the caller when DevOps is available).
   *  When a source's work item is present, the listing groups by work-item type
   *  and shows title · state · assignee; otherwise it falls back to title/#id. */
  workItems?: Map<string, WorkItemInfo>,
): ReleaseNotesContent {
  // Included solutions — union of merge-run source titles, deduped. A title
  // that resolves to exactly one current working solution with a work item id
  // gets a DevOps link (best-effort; ambiguous/unmatched stay title-only).
  const byTitle = new Map<string, WorkingSolution[]>()
  for (const s of solutions) {
    const key = s.title.trim().toLowerCase()
    const list = byTitle.get(key)
    if (list) list.push(s)
    else byTitle.set(key, [s])
  }
  const seen = new Set<string>()
  const included: IncludedSolution[] = []
  for (const run of runs) {
    for (const title of run.sources) {
      const key = title.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      const matches = byTitle.get(key) ?? []
      const match =
        matches.length === 1 && matches[0].kind !== 'deployment'
          ? matches[0]
          : null
      const devOpsId = match?.devOpsId ?? null
      included.push({
        title,
        devOpsId,
        url: devOpsId ? devOpsWorkItemUrl(devOpsId) : null,
        wi: devOpsId ? workItems?.get(devOpsId) : undefined,
      })
    }
  }
  included.sort((a, b) => a.title.localeCompare(b.title))

  // When any source resolved to a work item, group the listing by work-item type
  // (Feature / Bug / …); sources without a work item drop into an "Other" bucket.
  const enriched = included.some((s) => s.wi)
  const wiGroups = new Map<string, IncludedSolution[]>()
  const otherIncluded: IncludedSolution[] = []
  for (const s of included) {
    if (s.wi) {
      const list = wiGroups.get(s.wi.type) ?? []
      list.push(s)
      wiGroups.set(s.wi.type, list)
    } else otherIncluded.push(s)
  }
  const wiGroupList = [...wiGroups.entries()]
    .map(([type, items]) => ({
      type,
      items: items.sort((a, b) => a.wi!.title.localeCompare(b.wi!.title)),
    }))
    .sort((a, b) => a.type.localeCompare(b.type))

  // Components — union across runs, deduped by canonical type + name. Collapsed
  // types (App Element) are counted, not listed.
  const normal = new Map<string, Set<string>>()
  const collapsed = new Map<string, Set<string>>()
  for (const run of runs) {
    for (const c of run.components) {
      if (COLLAPSED_COMPONENT_TYPE_LABELS.has(c.t)) {
        const label = canonicalCollapsedLabel(c.t)
        const set = collapsed.get(label) ?? new Set<string>()
        set.add(c.n)
        collapsed.set(label, set)
      } else {
        const set = normal.get(c.t) ?? new Set<string>()
        set.add(c.n)
        normal.set(c.t, set)
      }
    }
  }
  const normalGroups = [...normal.entries()]
    .map(([type, names]) => ({
      type,
      names: [...names].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.type.localeCompare(b.type))
  const collapsedGroups = [...collapsed.entries()]
    .map(([type, names]) => ({ type, count: names.size }))
    .sort((a, b) => a.type.localeCompare(b.type))

  const totalComponents =
    normalGroups.reduce((n, g) => n + g.names.length, 0) +
    collapsedGroups.reduce((n, g) => n + g.count, 0)

  const summary = `${plural(included.length, 'solution')} · ${plural(
    totalComponents,
    'component',
  )}`

  const date = generatedAt.toISOString().slice(0, 10)
  const since = sincePublishedOn ? sincePublishedOn.slice(0, 10) : null
  const publisher = release.publisher?.friendlyName
  const version = release.version || '—'

  // --- Markdown ---
  const md: string[] = [
    `# Release Notes — ${release.title} (\`${release.uniqueName}\`) v${version}`,
    '',
    `_Generated ${date}${publisher ? ` · Publisher: ${publisher}` : ''}_`,
  ]
  if (since) md.push(`_Incremental — changes since ${since}_`)
  md.push('', `## Included solutions (${included.length})`, '')
  if (included.length === 0) {
    md.push('_None._', '')
  } else if (enriched) {
    for (const g of wiGroupList) {
      md.push(`### ${g.type} (${g.items.length})`, '')
      for (const s of g.items) {
        const link = s.url ? `[#${s.devOpsId}](${s.url})` : `#${s.devOpsId}`
        const who = s.wi!.assignedTo ? ` · ${s.wi!.assignedTo}` : ''
        md.push(`- **${link}** ${s.wi!.title} — _${s.wi!.state}_${who}`)
      }
      md.push('')
    }
    if (otherIncluded.length > 0) {
      md.push(`### Other (${otherIncluded.length})`, '')
      for (const s of otherIncluded) {
        if (s.devOpsId && s.url)
          md.push(`- ${s.title} ([#${s.devOpsId}](${s.url}))`)
        else if (s.devOpsId) md.push(`- ${s.title} (#${s.devOpsId})`)
        else md.push(`- ${s.title}`)
      }
      md.push('')
    }
  } else {
    for (const s of included) {
      if (s.devOpsId && s.url) md.push(`- ${s.title} ([#${s.devOpsId}](${s.url}))`)
      else if (s.devOpsId) md.push(`- ${s.title} (#${s.devOpsId})`)
      else md.push(`- ${s.title}`)
    }
  }
  md.push('', `## Components (${totalComponents})`, '')
  if (normalGroups.length === 0 && collapsedGroups.length === 0)
    md.push('_None._', '')
  for (const g of normalGroups) {
    md.push(`### ${g.type} (${g.names.length})`, '')
    for (const n of g.names) md.push(`- ${n}`)
    md.push('')
  }
  for (const g of collapsedGroups) {
    md.push(
      `### ${g.type} (${g.count})`,
      '',
      `_${plural(g.count, g.type)} — merged, not listed individually._`,
      '',
    )
  }
  if (runs.length > 0) {
    md.push('## Merge log', '')
    for (const run of runs) {
      const when = run.createdOn ? run.createdOn.slice(0, 10) : '—'
      const by = run.createdBy ? ` · ${run.createdBy}` : ''
      const errs = run.errors > 0 ? ` / errors ${run.errors}` : ''
      const from = run.sources.length ? ` · from ${run.sources.join(', ')}` : ''
      md.push(
        `- ${when}${by} · +${run.added} / skipped ${run.skipped}${errs}${from}`,
      )
    }
    md.push('')
  }
  const markdown = `${md.join('\n').trim()}\n`

  // --- Plain text ---
  const tx: string[] = [
    `RELEASE NOTES — ${release.title} (${release.uniqueName}) v${version}`,
    `Generated ${date}${publisher ? ` · Publisher: ${publisher}` : ''}`,
  ]
  if (since) tx.push(`Incremental — changes since ${since}`)
  tx.push('', `INCLUDED SOLUTIONS (${included.length})`)
  if (included.length === 0) {
    tx.push('  (none)')
  } else if (enriched) {
    for (const g of wiGroupList) {
      tx.push(`  ${g.type} (${g.items.length})`)
      for (const s of g.items) {
        const who = s.wi!.assignedTo ? ` · ${s.wi!.assignedTo}` : ''
        const link = s.url ? `  ${s.url}` : ''
        tx.push(
          `    - #${s.devOpsId}  ${s.wi!.title} — ${s.wi!.state}${who}${link}`,
        )
      }
    }
    if (otherIncluded.length > 0) {
      tx.push(`  Other (${otherIncluded.length})`)
      for (const s of otherIncluded) {
        if (s.devOpsId && s.url)
          tx.push(`    - ${s.title} (#${s.devOpsId}  ${s.url})`)
        else if (s.devOpsId) tx.push(`    - ${s.title} (#${s.devOpsId})`)
        else tx.push(`    - ${s.title}`)
      }
    }
  } else {
    for (const s of included) {
      if (s.devOpsId && s.url) tx.push(`  - ${s.title} (#${s.devOpsId}  ${s.url})`)
      else if (s.devOpsId) tx.push(`  - ${s.title} (#${s.devOpsId})`)
      else tx.push(`  - ${s.title}`)
    }
  }
  tx.push('', `COMPONENTS (${totalComponents})`)
  if (normalGroups.length === 0 && collapsedGroups.length === 0)
    tx.push('  (none)')
  for (const g of normalGroups) {
    tx.push(`  ${g.type} (${g.names.length})`)
    for (const n of g.names) tx.push(`    - ${n}`)
  }
  for (const g of collapsedGroups) {
    tx.push(
      `  ${g.type} (${g.count})`,
      `    ${plural(g.count, g.type)} — merged, not listed individually`,
    )
  }
  if (runs.length > 0) {
    tx.push('', 'MERGE LOG')
    for (const run of runs) {
      const when = run.createdOn ? run.createdOn.slice(0, 10) : '—'
      const by = run.createdBy ? ` · ${run.createdBy}` : ''
      const errs = run.errors > 0 ? ` / errors ${run.errors}` : ''
      const from = run.sources.length ? ` · from ${run.sources.join(', ')}` : ''
      tx.push(
        `  - ${when}${by} · +${run.added} / skipped ${run.skipped}${errs}${from}`,
      )
    }
  }
  const text = `${tx.join('\n').trim()}\n`

  return { markdown, text, summary }
}
