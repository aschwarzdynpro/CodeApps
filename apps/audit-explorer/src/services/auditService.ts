import type {
  AttributeChange,
  AuditEvent,
  AuditQuery,
  AuditedTable,
  UserRef,
} from '../types/audit'
import { dataverseAuditService } from './dataverseAuditService'

/**
 * Service contract for reading audit data.
 *
 * Two entry points, deliberately different in shape:
 *
 * - `search()` answers a concrete question (which record / who / which column).
 *   Each query kind becomes one bounded server-side filter, so the result is
 *   limited by the question itself. This is what the three explorer modes use.
 * - `list()` loads a whole time window for the activity dashboard. It is the
 *   only unbounded read left and therefore the only one where the row cap can
 *   realistically bite.
 *
 * The exported singleton is the Dataverse-backed implementation, which falls
 * back to mock data automatically when no environment/data source is wired up.
 */
export interface AuditListOptions {
  /**
   * Only return events created within the last N days. Applied server-side
   * (OData `createdon ge <cutoff>`) so the date range survives the page cap.
   * Omit (or pass Infinity) for the full log.
   */
  sinceDays?: number
}

export interface AuditListResult {
  /** Audit events in the requested window, newest first. */
  events: AuditEvent[]
  /**
   * Tables to offer in the slicer. Returned together with the events rather
   * than by a second query: the Dataverse implementation can only source them
   * from the log itself, so a separate call would page exactly the same rows
   * a second time — and could disagree with `events` under truncation.
   * Implementations backed by real metadata may return a superset.
   */
  tables: AuditedTable[]
  /**
   * True when the row cap cut the result short: the oldest events in the
   * selected range are missing. Every count derived from `events` is then a
   * lower bound, not a total — the UI has to say so, because a truncated
   * audit aggregate is indistinguishable from a complete one.
   */
  truncated: boolean
}

export interface AuditService {
  /** Answers one bounded question. Used by the record/person/field modes. */
  search(query: AuditQuery): Promise<AuditListResult>
  /** Loads a whole time window for the activity dashboard. */
  list(options?: AuditListOptions): Promise<AuditListResult>
  /** Returns the attribute-level changes for a single audit record. */
  getChanges(auditId: string): Promise<AttributeChange[]>
  /** Type-ahead over users, for the person mode's picker. */
  findUsers(term: string): Promise<UserRef[]>
  /** Tables seen in the recent log, for the field mode's table picker. */
  listTables(sinceDays: number): Promise<AuditedTable[]>
  /**
   * Column logical names seen changing on a table recently, for the field
   * mode's attribute picker. Empty when the runtime cannot deliver the inline
   * change payload — callers then fall back to free-text entry.
   */
  listAttributes(table: string, sinceDays: number): Promise<string[]>
}

export const auditService: AuditService = dataverseAuditService
