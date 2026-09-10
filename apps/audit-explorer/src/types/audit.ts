/** Subset of Dataverse audit operations most relevant to a change dashboard. */
export type AuditOperation = 'Create' | 'Update' | 'Delete' | 'Access'

export interface AuditUser {
  /**
   * systemuserid, when the source knows it. Optional because the sample log
   * has no real user ids — lateral navigation to the person mode is offered
   * only where this is present.
   */
  id?: string
  name: string
  initials: string
}

/** Attribute-level change as returned by RetrieveRecordChangeHistory. */
export interface AttributeChange {
  /** Logical name of the changed column. */
  attribute: string
  /** Previous value, formatted for display (empty for Create). */
  oldValue: string
  /** New value, formatted for display (empty for Delete). */
  newValue: string
  /**
   * Unformatted values, kept so lookups can still be resolved later. A lookup
   * arrives as `entityname,guid` and often without a label; formatting it away
   * on sight would throw out the only thing a name lookup can work from.
   */
  oldRaw?: string
  newRaw?: string
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

/** A person who can be picked as the subject of a person query. */
export interface UserRef {
  /** systemuserid */
  id: string
  name: string
  initials: string
}

/**
 * What the user is asking. Every shape maps to one bounded server-side filter,
 * which is the whole point of the query-first design: the result set is limited
 * by the question, not by a row cap applied after the fact.
 */
export type AuditQuery =
  | { kind: 'record'; recordId: string; table?: string }
  | { kind: 'user'; userId: string; userName: string; sinceDays: number }
  | {
      kind: 'field'
      table: string
      tableName: string
      /** Logical name of the watched column; undefined means "any column". */
      attribute?: string
      sinceDays: number
    }

/**
 * One row of the field-mode result. Field mode does not show events but the
 * value history of a single column, so old -> new is the row itself rather
 * than something hidden behind an expander.
 */
export interface FieldChangeRow {
  eventId: string
  createdOn: string
  recordId: string
  recordName: string
  user: AuditUser
  oldValue: string
  newValue: string
}

/**
 * A record found through the table quick-search.
 *
 * The search runs over the audit log rather than over the table itself: the
 * code app has data sources for `audit` and `systemuser` only, so arbitrary
 * business tables are simply not queryable from here. That limitation happens
 * to match the purpose — a record with no audit history has nothing to show.
 */
export interface RecordHit {
  recordId: string
  recordName: string
  table: string
  tableName: string
  /** Audit entries seen for this record inside the scanned window. */
  count: number
  /** ISO timestamp of the most recent entry. */
  lastChange: string
}

/** Org-level audit settings — what the log can possibly contain. */
export interface AuditSettings {
  /** `organization.isauditenabled`. When false, nothing is being written. */
  orgAuditEnabled: boolean
  /**
   * `organization.auditretentionperiodv2` in days. `-1` means forever, `null`
   * that the setting could not be read. Anything older than this window has
   * been purged — which is a very different answer from "never changed".
   */
  retentionDays: number | null
}

/** Audit configuration of one column. */
export interface ColumnAudit {
  logicalName: string
  displayName: string
  auditEnabled: boolean
}

/**
 * Audit configuration of one table, read from entity metadata.
 *
 * This is what turns "no changes found" from a guess into a statement: a table
 * with auditing off cannot have changes, and a column with auditing off will
 * never appear in a diff no matter how often it is edited.
 */
export interface TableAudit {
  logicalName: string
  displayName: string
  auditEnabled: boolean
  columns: ColumnAudit[]
}
