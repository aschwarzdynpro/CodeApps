import type { AttributeChange, AuditEvent } from '../types/audit'
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
export interface AuditService {
  /** Returns audit events, newest first. */
  list(): Promise<AuditEvent[]>
  /** Returns the attribute-level changes for a single audit record. */
  getChanges(auditId: string): Promise<AttributeChange[]>
}

export const auditService: AuditService = dataverseAuditService
