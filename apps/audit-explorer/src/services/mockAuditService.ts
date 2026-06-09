import type { AttributeChange, AuditEvent, AuditedTable } from '../types/audit'
import { mockAuditEvents } from './mockData'

/**
 * Tables flagged as audit-enabled in the sample environment. Deliberately a
 * superset of the tables that actually have events — "Quote" and "Product" are
 * audited but quiet, so the list shows full audit coverage, not just activity.
 */
const MOCK_AUDITED_TABLES: AuditedTable[] = [
  { logicalName: 'account', displayName: 'Account' },
  { logicalName: 'contact', displayName: 'Contact' },
  { logicalName: 'opportunity', displayName: 'Opportunity' },
  { logicalName: 'incident', displayName: 'Case' },
  { logicalName: 'lead', displayName: 'Lead' },
  { logicalName: 'quote', displayName: 'Quote' },
  { logicalName: 'product', displayName: 'Product' },
]

/**
 * Mock implementation of {@link AuditService}. Serves the generated sample log
 * and is used automatically whenever the real Dataverse data source isn't
 * available (e.g. plain local `npm run dev` before `pac code add-data-source`).
 */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class MockAuditService {
  async list(): Promise<AuditEvent[]> {
    await delay(400)
    return mockAuditEvents.map((e) => ({ ...e }))
  }

  async getChanges(auditId: string): Promise<AttributeChange[]> {
    await delay(150)
    return mockAuditEvents.find((e) => e.id === auditId)?.changes ?? []
  }

  async listAuditedTables(): Promise<AuditedTable[]> {
    await delay(200)
    return MOCK_AUDITED_TABLES.map((t) => ({ ...t }))
  }
}

export const mockAuditService = new MockAuditService()
