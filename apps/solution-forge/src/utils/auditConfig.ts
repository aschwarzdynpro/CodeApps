import type { OrgAuditSettings, AuditTableInfo } from '../types/auditConfig'

/**
 * Format `auditretentionperiodv2` (days; -1 = forever) as a readable label.
 * Pure — unit-tested.
 */
export function formatRetention(days: number): string {
  if (days < 0) return 'Forever'
  if (days === 0) return 'Not set'
  if (days === 1) return '1 day'
  if (days % 365 === 0) {
    const years = days / 365
    return `${days} days (${years} year${years === 1 ? '' : 's'})`
  }
  return `${days} days`
}

export type TableAuditState =
  | 'effective' // org on + table on → actually auditing
  | 'configured-but-off' // table on, but org auditing is off → no effect
  | 'not-audited'

/**
 * Effective audit state of a table: a table only actually records audit
 * history when the org master switch is on AND the table is audit-enabled.
 */
export function describeTableAudit(
  org: Pick<OrgAuditSettings, 'auditingEnabled'>,
  table: Pick<AuditTableInfo, 'auditEnabled'>,
): TableAuditState {
  if (!table.auditEnabled) return 'not-audited'
  return org.auditingEnabled ? 'effective' : 'configured-but-off'
}
