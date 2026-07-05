import type {
  AuditColumnInfo,
  AuditConfigResult,
  AuditTableInfo,
  OrgAuditSettings,
} from '../types/auditConfig'
import type { AuditConfigService } from './auditConfigService'
import { mockAuditConfigService } from './mockAuditConfigService'
import { powerModeReady } from '../PowerProvider'
import { odataQuery, rowNum, rowStr, type Row } from './currentEnvQuery'
import { orgUrlForEnvKey } from '../config'

/**
 * Real implementation of {@link AuditConfigService}. Reads the auditing
 * configuration of the chosen environment through the connector: the
 * `organization` row for the master switch + retention, and the
 * `EntityDefinitions` metadata set for per-table / per-column
 * `IsAuditEnabled`. SP identity — needs metadata read access.
 */

/** BooleanManagedProperty → its boolean value. */
function managedBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  const v = value as { Value?: boolean } | undefined
  return v?.Value === true
}

/** Metadata Label → localized display label. */
function label(value: unknown): string {
  const v = value as
    | { UserLocalizedLabel?: { Label?: string } }
    | undefined
  return v?.UserLocalizedLabel?.Label ?? ''
}

class DataverseAuditConfigService implements AuditConfigService {
  async loadAuditConfig(envKey: string): Promise<AuditConfigResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockAuditConfigService.loadAuditConfig(envKey)
    const orgUrl = orgUrlForEnvKey(envKey)

    // Org master switch + retention.
    let org: OrgAuditSettings = { auditingEnabled: false, retentionDays: 0 }
    try {
      const rows = await odataQuery(
        'organizations',
        'organizationid,isauditenabled,auditretentionperiodv2',
        { orgUrl },
      )
      const row = rows[0]
      if (row)
        org = {
          auditingEnabled: row.isauditenabled === true,
          retentionDays: rowNum(row.auditretentionperiodv2),
        }
    } catch (err) {
      console.warn('[audit-config] organization read failed:', err)
    }

    // Per-table IsAuditEnabled from the metadata set.
    const rows = await odataQuery(
      'EntityDefinitions',
      'LogicalName,DisplayName,IsAuditEnabled',
      { orgUrl },
    )
    const tables: AuditTableInfo[] = rows
      .map((row: Row) => ({
        logicalName: rowStr(row.LogicalName),
        displayName: label(row.DisplayName) || rowStr(row.LogicalName),
        auditEnabled: managedBool(row.IsAuditEnabled),
      }))
      .filter((t) => t.logicalName)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))

    return { org, tables }
  }

  async listAuditColumns(
    envKey: string,
    entityLogicalName: string,
  ): Promise<AuditColumnInfo[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockAuditConfigService.listAuditColumns(envKey, entityLogicalName)
    const safe = entityLogicalName.replace(/'/g, "''")
    const rows = await odataQuery(
      'EntityDefinitions',
      'LogicalName',
      {
        orgUrl: orgUrlForEnvKey(envKey),
        filter: `LogicalName eq '${safe}'`,
        expand: 'Attributes($select=LogicalName,DisplayName,IsAuditEnabled)',
      },
    )
    const attrs =
      (rows[0]?.Attributes as Array<Record<string, unknown>> | undefined) ?? []
    return attrs
      .map((a) => ({
        logicalName: rowStr(a.LogicalName),
        displayName: label(a.DisplayName) || rowStr(a.LogicalName),
        auditEnabled: managedBool(a.IsAuditEnabled),
      }))
      .filter((c) => c.logicalName)
      .sort(
        (a, b) =>
          Number(b.auditEnabled) - Number(a.auditEnabled) ||
          a.displayName.localeCompare(b.displayName),
      )
  }
}

export const dataverseAuditConfigService: AuditConfigService =
  new DataverseAuditConfigService()
