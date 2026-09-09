import type { AttributeChange, AuditEvent, AuditedTable } from '../types/audit'
import { dataverseAuditService } from './dataverseAuditService'

/**
 * Service contract for reading audit data.
 *
 * - `list()` powers the dashboard aggregates and the event list (from the
 *   Dataverse `audit` table).
 * - `getChanges()` resolves the field-level old/new diff for one event
 *   (from `RetrieveAuditDetails`), loaded lazily when an event is opened.
 *
 * The exported singleton is the Dataverse-backed implementation, which falls
 * back to mock data automatically when no environment/data source is wired up.
 * The dashboard and hooks only depend on this interface, so going live never
 * touches the UI.
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
  /**
   * Returns audit events (newest first), the slicer's table list, and whether
   * the row cap truncated the result — in a single round trip.
   */
  list(options?: AuditListOptions): Promise<AuditListResult>
  /** Returns the attribute-level changes for a single audit record. */
  getChanges(auditId: string): Promise<AttributeChange[]>
}

export const auditService: AuditService = dataverseAuditService
