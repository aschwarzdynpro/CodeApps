import type { AttributeChange, AuditEvent } from '../types/audit'
import { mockAuditEvents } from './mockData'

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
}

export const mockAuditService = new MockAuditService()
