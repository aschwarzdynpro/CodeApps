import type { ImportJobStatus } from './importHistory'

/**
 * Release Timeline — merges, published release notes and imports of one
 * release on a single time axis ("what went where, when"). Pure
 * visualization of existing data: `pro_mergerun`, `pro_releasenote` and
 * `importjob` (per configured environment).
 */

export type TimelineEventKind = 'merge' | 'note' | 'import'

export interface TimelineEvent {
  /** Unique per event (source id, prefixed by kind/env). */
  id: string
  kind: TimelineEventKind
  /** ISO timestamp the event happened. */
  at: string
  title: string
  /** Secondary line (sources, summary, error text …). */
  subtitle: string
  /** Acting user, when resolvable. */
  by: string
  /** Imports: which environment. */
  envKey?: string
  envLabel?: string
  /** Imports: outcome. */
  status?: ImportJobStatus
  /** Merges: counts for the badge row. */
  added?: number
  skipped?: number
  errors?: number
}
