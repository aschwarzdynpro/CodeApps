import type { AttributeChange, AuditedTable } from '../types/audit'
import type { AuditListOptions, AuditListResult } from './auditService'
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
 *
 * The sample log is small enough that no cap can bite, so `list()` always
 * reports `truncated: false`. Unlike the Dataverse implementation it can serve
 * a genuine superset of audited tables — including ones with no events.
 */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class MockAuditService {
  async list(options?: AuditListOptions): Promise<AuditListResult> {
    await delay(400)
    const sinceDays = options?.sinceDays
    const cutoff =
      sinceDays !== undefined && Number.isFinite(sinceDays)
        ? Date.now() - sinceDays * 86_400_000
        : undefined
    const events = mockAuditEvents
      .filter((e) => cutoff === undefined || new Date(e.createdOn).getTime() >= cutoff)
      .map((e) => ({ ...e }))
    return {
      events,
      tables: MOCK_AUDITED_TABLES.map((t) => ({ ...t })),
      truncated: false,
    }
  }

  async getChanges(auditId: string): Promise<AttributeChange[]> {
    await delay(150)
    return mockAuditEvents.find((e) => e.id === auditId)?.changes ?? []
  }
}

export const mockAuditService = new MockAuditService()
