import type { AuditEvent } from '../types/audit'
import { mockAuditEvents } from './mockData'

/**
 * Service contract for reading audit data. The mock implementation serves
 * generated sample events; a real implementation would query the Dataverse
 * `audit` table and call `RetrieveRecordChangeHistory` / `RetrieveAuditDetails`
 * behind the same interface, so the dashboard and hooks stay unchanged.
 */
export interface AuditService {
  /** Returns audit events, newest first. */
  list(): Promise<AuditEvent[]>
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

class MockAuditService implements AuditService {
  async list(): Promise<AuditEvent[]> {
    await delay(400)
    return mockAuditEvents.map((e) => ({ ...e }))
  }
}

export const auditService: AuditService = new MockAuditService()
