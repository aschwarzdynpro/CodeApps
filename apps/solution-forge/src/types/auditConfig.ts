/**
 * Audit Configuration Analyzer — the auditing setup of one environment:
 * the org-wide switch + retention, and per-table / per-column `IsAuditEnabled`
 * from the metadata (`EntityDefinitions`). A column is only *effectively*
 * audited when org auditing is on AND its table is audited AND the column is.
 */

export interface OrgAuditSettings {
  /** organization.isauditenabled — the master switch. */
  auditingEnabled: boolean
  /** auditretentionperiodv2 in days; -1 = forever. */
  retentionDays: number
}

export interface AuditTableInfo {
  logicalName: string
  displayName: string
  /** EntityMetadata.IsAuditEnabled.Value. */
  auditEnabled: boolean
}

export interface AuditColumnInfo {
  logicalName: string
  displayName: string
  /** AttributeMetadata.IsAuditEnabled.Value. */
  auditEnabled: boolean
}

export interface AuditConfigResult {
  org: OrgAuditSettings
  tables: AuditTableInfo[]
}
