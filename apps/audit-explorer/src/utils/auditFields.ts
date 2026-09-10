import type { AttributeChange, AuditSettings } from '../types/audit'

/**
 * Columns Dataverse rewrites on virtually every update. They are audited like
 * any other column, so they turn up in nearly every diff and bury the change
 * someone actually came to look at.
 *
 * Deliberately narrow: `statecode`, `statuscode` and `ownerid` are NOT in here.
 * A status flip or a reassignment is a business event — often the very thing a
 * forensic question is about — even though they look system-ish.
 */
const TECHNICAL_FIELDS = new Set([
  'createdby',
  'createdon',
  'createdonbehalfby',
  'importsequencenumber',
  'modifiedby',
  'modifiedon',
  'modifiedonbehalfby',
  'overriddencreatedon',
  'owningbusinessunit',
  'owningteam',
  'owninguser',
  'timezoneruleversionnumber',
  'utcconversiontimezonecode',
  'versionnumber',
])

export function isTechnicalField(attribute: string): boolean {
  return TECHNICAL_FIELDS.has(attribute.toLowerCase())
}

/** Split a diff into the part people care about and the bookkeeping. */
export function partitionChanges(changes: AttributeChange[]): {
  business: AttributeChange[]
  technical: AttributeChange[]
} {
  const business: AttributeChange[] = []
  const technical: AttributeChange[] = []
  for (const change of changes) {
    ;(isTechnicalField(change.attribute) ? technical : business).push(change)
  }
  return { business, technical }
}

/** Human form of the retention setting. */
export function formatRetention(days: number | null): string {
  if (days === null) return 'unknown'
  if (days < 0) return 'kept forever'
  return `${days} days`
}

/**
 * Earliest moment the log can still cover, or null when retention is forever
 * or unknown.
 */
export function retentionCutoff(settings: AuditSettings): Date | null {
  const days = settings.retentionDays
  if (days === null || days < 0) return null
  return new Date(Date.now() - days * 86_400_000)
}

/**
 * True when a query reaches past the retention horizon. The answer will then be
 * silently incomplete: older entries were purged, so "nothing found" for that
 * stretch says nothing about whether anything happened.
 */
export function windowExceedsRetention(
  settings: AuditSettings,
  sinceDays: number | undefined,
): boolean {
  const days = settings.retentionDays
  if (days === null || days < 0) return false
  if (sinceDays === undefined || !Number.isFinite(sinceDays)) return true
  return sinceDays > days
}
