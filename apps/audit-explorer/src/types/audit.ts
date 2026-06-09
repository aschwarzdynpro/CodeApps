/** Subset of Dataverse audit operations most relevant to a change dashboard. */
export type AuditOperation = 'Create' | 'Update' | 'Delete' | 'Access'

export interface AuditUser {
  name: string
  initials: string
}

/** Attribute-level change as returned by RetrieveRecordChangeHistory. */
export interface AttributeChange {
  /** Display name of the changed column. */
  attribute: string
  /** Previous value (empty for Create). */
  oldValue: string
  /** New value (empty for Delete). */
  newValue: string
}

/**
 * A single audit record. Mirrors the shape of the Dataverse `audit` table plus
 * the resolved attribute changes from the audit detail.
 */
export interface AuditEvent {
  /** auditid */
  id: string
  /** createdon (ISO date-time) */
  createdOn: string
  /** operation */
  operation: AuditOperation
  /** Friendly table name, e.g. "Account". */
  tableName: string
  /** Logical name, e.g. "account". */
  tableLogicalName: string
  /** objectid */
  recordId: string
  /** Primary name of the affected record. */
  recordName: string
  /** userid (resolved to a person). */
  user: AuditUser
  /** Column-level changes (empty for Delete / Access). */
  changes: AttributeChange[]
}

/** A Dataverse table that has auditing enabled. */
export interface AuditedTable {
  /** Logical name, e.g. "account". */
  logicalName: string
  /** Friendly display name, e.g. "Account". */
  displayName: string
}
