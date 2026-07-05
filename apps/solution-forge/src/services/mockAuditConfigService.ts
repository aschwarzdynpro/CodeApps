import type {
  AuditColumnInfo,
  AuditConfigResult,
  AuditTableInfo,
} from '../types/auditConfig'
import type { AuditConfigService } from './auditConfigService'

/**
 * Mock implementation of {@link AuditConfigService} — a seeded auditing setup
 * (org auditing on, 90-day retention) with a mix of audited and non-audited
 * tables and, per table, audited/non-audited columns, so the analyzer is
 * demoable offline.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface TableSeed {
  logical: string
  display: string
  audited: boolean
  columns: { logical: string; display: string; audited: boolean }[]
}

const TABLES: TableSeed[] = [
  {
    logical: 'account',
    display: 'Account',
    audited: true,
    columns: [
      { logical: 'name', display: 'Account Name', audited: true },
      { logical: 'telephone1', display: 'Main Phone', audited: true },
      { logical: 'creditlimit', display: 'Credit Limit', audited: true },
      { logical: 'description', display: 'Description', audited: false },
      { logical: 'websiteurl', display: 'Website', audited: false },
    ],
  },
  {
    logical: 'contact',
    display: 'Contact',
    audited: true,
    columns: [
      { logical: 'emailaddress1', display: 'Email', audited: true },
      { logical: 'jobtitle', display: 'Job Title', audited: false },
      { logical: 'mobilephone', display: 'Mobile Phone', audited: false },
    ],
  },
  {
    logical: 'salesorder',
    display: 'Order',
    audited: true,
    // Audited table, but no column is flagged — audits the record shell only.
    columns: [
      { logical: 'name', display: 'Name', audited: false },
      { logical: 'totalamount', display: 'Total Amount', audited: false },
    ],
  },
  {
    logical: 'incident',
    display: 'Case',
    audited: false,
    columns: [
      { logical: 'title', display: 'Case Title', audited: false },
      { logical: 'prioritycode', display: 'Priority', audited: false },
    ],
  },
  {
    logical: 'systemuser',
    display: 'User',
    audited: true,
    columns: [
      { logical: 'isdisabled', display: 'Status', audited: true },
      { logical: 'businessunitid', display: 'Business Unit', audited: true },
    ],
  },
  {
    logical: 'pro_workingsolution',
    display: 'Working Solution',
    audited: false,
    columns: [
      { logical: 'pro_name', display: 'Name', audited: false },
      { logical: 'pro_deploymentstatus', display: 'Deployment Status', audited: false },
    ],
  },
]

class MockAuditConfigService implements AuditConfigService {
  async loadAuditConfig(_envKey: string): Promise<AuditConfigResult> {
    void _envKey
    await delay(250)
    const tables: AuditTableInfo[] = TABLES.map((t) => ({
      logicalName: t.logical,
      displayName: t.display,
      auditEnabled: t.audited,
    })).sort((a, b) => a.displayName.localeCompare(b.displayName))
    return {
      org: { auditingEnabled: true, retentionDays: 90 },
      tables,
    }
  }

  async listAuditColumns(
    _envKey: string,
    entityLogicalName: string,
  ): Promise<AuditColumnInfo[]> {
    void _envKey
    await delay(200)
    const table = TABLES.find((t) => t.logical === entityLogicalName)
    return (table?.columns ?? [])
      .map((c) => ({
        logicalName: c.logical,
        displayName: c.display,
        auditEnabled: c.audited,
      }))
      .sort(
        (a, b) =>
          Number(b.auditEnabled) - Number(a.auditEnabled) ||
          a.displayName.localeCompare(b.displayName),
      )
  }
}

export const mockAuditConfigService: AuditConfigService =
  new MockAuditConfigService()
