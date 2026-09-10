import type {
  AttributeChange,
  AuditEvent,
  AuditQuery,
  AuditSettings,
  AuditedTable,
  RecordHit,
  TableAudit,
  UserRef,
} from '../types/audit'
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
 * The sample log is small enough that no cap can bite, so results always report
 * `truncated: false`. Unlike the Dataverse implementation it can serve a
 * genuine superset of audited tables — including ones with no events.
 */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The sample log has no user ids, so derive a stable one from the name. */
function mockUserId(name: string): string {
  return `mock-user-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function cutoffOf(sinceDays: number | undefined): number | undefined {
  return sinceDays !== undefined && Number.isFinite(sinceDays)
    ? Date.now() - sinceDays * 86_400_000
    : undefined
}

function within(event: AuditEvent, cutoff: number | undefined): boolean {
  return cutoff === undefined || new Date(event.createdOn).getTime() >= cutoff
}

export class MockAuditService {
  async search(query: AuditQuery): Promise<AuditListResult> {
    await delay(250)
    let events: AuditEvent[]
    switch (query.kind) {
      case 'record':
        events = mockAuditEvents.filter((e) => e.recordId === query.recordId)
        break
      case 'user': {
        const cutoff = cutoffOf(query.sinceDays)
        events = mockAuditEvents.filter(
          (e) => mockUserId(e.user.name) === query.userId && within(e, cutoff),
        )
        break
      }
      case 'field': {
        const cutoff = cutoffOf(query.sinceDays)
        events = mockAuditEvents.filter(
          (e) =>
            e.tableLogicalName === query.table &&
            within(e, cutoff) &&
            (!query.attribute ||
              e.changes.some((c) => c.attribute === query.attribute)),
        )
        break
      }
    }
    return {
      events: events.map((e) => ({ ...e })),
      tables: MOCK_AUDITED_TABLES.map((t) => ({ ...t })),
      truncated: false,
    }
  }

  async list(options?: AuditListOptions): Promise<AuditListResult> {
    await delay(400)
    const cutoff = cutoffOf(options?.sinceDays)
    const events = mockAuditEvents
      .filter((e) => within(e, cutoff))
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

  async findUsers(term: string): Promise<UserRef[]> {
    await delay(150)
    const needle = term.trim().toLowerCase()
    if (needle.length < 2) return []
    const seen = new Map<string, UserRef>()
    for (const e of mockAuditEvents) {
      if (!e.user.name.toLowerCase().includes(needle)) continue
      const id = mockUserId(e.user.name)
      if (!seen.has(id)) {
        seen.set(id, { id, name: e.user.name, initials: e.user.initials })
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  /** The sample list is static — no time window to apply. */
  async listTables(): Promise<AuditedTable[]> {
    await delay(200)
    return MOCK_AUDITED_TABLES.map((t) => ({ ...t }))
  }

  async findRecords(table: string, term: string): Promise<RecordHit[]> {
    await delay(200)
    const needle = term.trim().toLowerCase()
    const hits = new Map<string, RecordHit>()
    for (const e of mockAuditEvents) {
      if (e.tableLogicalName !== table) continue
      const existing = hits.get(e.recordId)
      if (existing) {
        existing.count += 1
        if (e.createdOn > existing.lastChange) existing.lastChange = e.createdOn
        continue
      }
      hits.set(e.recordId, {
        recordId: e.recordId,
        recordName: e.recordName,
        table: e.tableLogicalName,
        tableName: e.tableName,
        count: 1,
        lastChange: e.createdOn,
      })
    }
    return [...hits.values()]
      .filter((hit) => !needle || hit.recordName.toLowerCase().includes(needle))
      .sort((a, b) => b.lastChange.localeCompare(a.lastChange))
  }

  /** Sample org: auditing on, 90-day retention — enough to exercise the banner. */
  async getAuditSettings(): Promise<AuditSettings> {
    await delay(100)
    return { orgAuditEnabled: true, retentionDays: 90 }
  }

  /**
   * Derives a plausible audit configuration from the sample log: every column
   * ever seen changing counts as audited, which is true by construction.
   */
  async getTableAudit(table: string): Promise<TableAudit | null> {
    await delay(150)
    const known = MOCK_AUDITED_TABLES.find((t) => t.logicalName === table)
    if (!known) return null
    const seen = new Set<string>()
    for (const e of mockAuditEvents) {
      if (e.tableLogicalName !== table) continue
      for (const c of e.changes) seen.add(c.attribute)
    }
    return {
      logicalName: known.logicalName,
      displayName: known.displayName,
      auditEnabled: true,
      columns: [...seen].sort().map((logicalName) => ({
        logicalName,
        displayName: logicalName,
        auditEnabled: true,
      })),
    }
  }

  /** The sample log has no real principals, so hand back a readable stand-in. */
  async resolvePrincipals(refs: string[]): Promise<Record<string, string>> {
    await delay(80)
    const resolved: Record<string, string> = {}
    for (const key of refs) {
      const [entity] = key.split(',')
      resolved[key] = entity === 'team' ? 'Sample Team' : 'Sample User'
    }
    return resolved
  }

  async listAttributes(table: string): Promise<string[]> {
    await delay(150)
    const seen = new Set<string>()
    for (const e of mockAuditEvents) {
      if (e.tableLogicalName !== table) continue
      for (const c of e.changes) seen.add(c.attribute)
    }
    return [...seen].sort((a, b) => a.localeCompare(b))
  }
}

export const mockAuditService = new MockAuditService()
