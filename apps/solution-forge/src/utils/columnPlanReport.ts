/**
 * Reading the executor's write recipe back out — the "why did my column not
 * arrive in the target?" answer.
 *
 * {@link buildColumnPlan} already classifies every column of an entry into
 * written / written-as-reference / skipped-with-reason, but that verdict was
 * only ever stored as JSON for the flow. This module turns it into something
 * an author can act on: grouped columns, reason codes spelled out, and a small
 * set of NOTICES derived from the plan plus the entry's package context.
 *
 * The notices are the point. A dropped polymorphic lookup or a lookup pointing
 * at a table no entry transfers means rows land in the target without their
 * reference — today that happens silently, and the entry looks like it ran
 * fine.
 */

import type { ColumnPlan } from './transferConfig'

/** Parse a stored ColumnPlan JSON. Never throws — null on anything unexpected. */
export function parseColumnPlan(json: string): ColumnPlan | null {
  if (!json.trim()) return null
  try {
    const data: unknown = JSON.parse(json)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const raw = data as Record<string, unknown>
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((e): e is string => typeof e === 'string') : []
    const pairs = <K extends string>(v: unknown, key: K): ({ c: string } & Record<K, string>)[] =>
      Array.isArray(v)
        ? v
            .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
            .filter((e) => typeof e.c === 'string' && typeof e[key] === 'string')
            .map((e) => ({ c: e.c as string, [key]: e[key] as string }) as { c: string } & Record<K, string>)
        : []
    return { s: strings(raw.s), l: pairs(raw.l, 's'), x: pairs(raw.x, 'r') }
  } catch {
    return null
  }
}

/**
 * Human sentence for a reason code produced by {@link buildColumnPlan}.
 * Unknown codes pass through verbatim — a new code in the builder must still
 * render something, just without the polish.
 */
export function describeSkipReason(reason: string): string {
  switch (reason) {
    case 'not in metadata':
      return 'Not present in the source table — a typo, or a column that was deleted since the query was written.'
    case 'primary id (written on create)':
      return 'Primary key — written when the row is created, never updated.'
    case 'virtual':
      return "Companion column (a lookup's name, for example) — the real column carries the value."
    case 'platform':
      return 'Platform-managed — timestamps, state and version are never transported.'
    case 'read-only':
      return 'Read-only in the source table — Dataverse would reject the write.'
    case 'owner':
      return 'Owner — ownership is not transported; rows keep the target environment’s own owner.'
    case 'polymorphic lookup':
      return 'Lookup with more than one possible target table — the executor cannot tell which one to bind.'
    case 'lookup target unknown':
      return 'Lookup whose target table could not be resolved from the metadata.'
    case 'lookup target set unknown':
      return 'Lookup whose target table has no resolvable entity set.'
    case 'unsupported type':
      return 'Column type the executor cannot write (party list, file, image, managed property).'
    default:
      return reason
  }
}

/** Reason codes that mean a REFERENCE was dropped, not just a value. */
const DROPPED_REFERENCE_REASONS = new Set([
  'polymorphic lookup',
  'lookup target unknown',
  'lookup target set unknown',
])

export type PlanNoticeLevel = 'blocker' | 'warning' | 'info'

export interface PlanNotice {
  /** Stable identity — React keys and tests never depend on the wording. */
  id: string
  level: PlanNoticeLevel
  text: string
}

/** Another entry of the same package, as far as the report cares. */
export interface SiblingEntry {
  name: string
  entitySet: string
  order: number
  active: boolean
}

export interface ColumnPlanReportInput {
  plan: ColumnPlan
  /** Entity set of THIS entry's table — a lookup onto it is a self reference. */
  ownEntitySet: string
  ownOrder: number
  /** The package's other entries (this one excluded). */
  siblings: SiblingEntry[]
  /** True when the query uses <all-attributes/>. */
  allAttributes: boolean
}

export interface SkipGroup {
  reason: string
  /** {@link describeSkipReason} of `reason`. */
  label: string
  columns: string[]
}

export interface ColumnPlanReport {
  /** Columns copied 1:1. */
  scalars: string[]
  /** Columns bound as `@odata.bind` — column → target entity set. */
  lookups: { c: string; s: string }[]
  /** Skipped columns grouped by reason, most-skipped group first. */
  skipped: SkipGroup[]
  skippedCount: number
  /** Blockers first, then warnings, then info. */
  notices: PlanNotice[]
}

const list = (columns: string[]): string => columns.join(', ')

/**
 * Turn a plan into the dialog's report. Pure — the caller supplies the package
 * context, which is what lets the lookup checks say something useful instead
 * of "make sure parents come first".
 */
export function buildColumnPlanReport({
  plan,
  ownEntitySet,
  ownOrder,
  siblings,
  allAttributes,
}: ColumnPlanReportInput): ColumnPlanReport {
  const byReason = new Map<string, string[]>()
  for (const { c, r } of plan.x) {
    const bucket = byReason.get(r)
    if (bucket) bucket.push(c)
    else byReason.set(r, [c])
  }
  const skipped: SkipGroup[] = [...byReason.entries()]
    .map(([reason, columns]) => ({
      reason,
      label: describeSkipReason(reason),
      columns: [...columns].sort(),
    }))
    .sort((a, b) => b.columns.length - a.columns.length || a.reason.localeCompare(b.reason))

  const notices: PlanNotice[] = []
  const blockers: PlanNotice[] = []
  const warnings: PlanNotice[] = []
  const infos: PlanNotice[] = []

  // 1. Nothing to write. The entry would create rows carrying only their id.
  if (plan.s.length === 0 && plan.l.length === 0) {
    blockers.push({
      id: 'empty-plan',
      level: 'blocker',
      text:
        'The write plan is empty — this entry would create rows with no data in them. ' +
        'Select at least one writable column in the query.',
    })
  }

  // 2. Dropped references. The row lands, its reference does not — the failure
  //    mode that looks like success in the run log.
  const dropped = plan.x.filter((e) => DROPPED_REFERENCE_REASONS.has(e.r))
  if (dropped.length > 0) {
    warnings.push({
      id: 'dropped-references',
      level: 'warning',
      text:
        `${dropped.length} reference column${dropped.length === 1 ? '' : 's'} ` +
        `(${list(dropped.map((e) => e.c).sort())}) ${dropped.length === 1 ? 'is' : 'are'} skipped — ` +
        'those rows arrive in the target without the reference, and the run reports success.',
    })
  }

  // 3. Per lookup: is the referenced table transported, and early enough?
  for (const lookup of [...plan.l].sort((a, b) => a.c.localeCompare(b.c))) {
    if (ownEntitySet && lookup.s === ownEntitySet) {
      infos.push({
        id: `self-reference:${lookup.c}`,
        level: 'info',
        text:
          `${lookup.c} points at this entry's own table — parent rows must be written before ` +
          'their children. The executor writes in query order, so order the query accordingly.',
      })
      continue
    }
    const sibling = siblings.find((s) => s.entitySet === lookup.s)
    if (!sibling) {
      warnings.push({
        id: `lookup-uncovered:${lookup.c}`,
        level: 'warning',
        text:
          `${lookup.c} references ${lookup.s}, which no entry of this package transfers — ` +
          'those rows must already exist in the target, otherwise the reference cannot be bound.',
      })
    } else if (!sibling.active) {
      warnings.push({
        id: `lookup-inactive:${lookup.c}`,
        level: 'warning',
        text:
          `${lookup.c} references ${lookup.s}, transferred by "${sibling.name}" — ` +
          'but that entry is inactive and will be skipped.',
      })
    } else if (sibling.order >= ownOrder) {
      warnings.push({
        id: `lookup-order:${lookup.c}`,
        level: 'warning',
        text:
          `${lookup.c} references ${lookup.s}, transferred by "${sibling.name}" (order ` +
          `${sibling.order}) — which runs after this entry (order ${ownOrder}). ` +
          'Move it before, or the references will not resolve on the first run.',
      })
    }
  }

  // 4. all-attributes with skips: not wrong, just hard to review.
  const skippedCount = plan.x.length
  if (allAttributes && skippedCount > 0) {
    infos.push({
      id: 'all-attributes',
      level: 'info',
      text:
        `The query selects all columns; ${skippedCount} of them cannot be written. ` +
        'Selecting columns explicitly makes the entry easier to review.',
    })
  }

  notices.push(...blockers, ...warnings, ...infos)
  return {
    scalars: [...plan.s].sort(),
    lookups: [...plan.l].sort((a, b) => a.c.localeCompare(b.c)),
    skipped,
    skippedCount,
    notices,
  }
}

/** The report's blockers, for the dialog's save gate. */
export function planBlockers(report: ColumnPlanReport): string[] {
  return report.notices.filter((n) => n.level === 'blocker').map((n) => n.text)
}
