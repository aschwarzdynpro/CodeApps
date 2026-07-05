import type { AuditColumnInfo, AuditConfigResult } from '../types/auditConfig'
import { dataverseAuditConfigService } from './dataverseAuditConfigService'

/**
 * Service contract for the Audit Configuration Analyzer. Reads the auditing
 * setup of the selected environment through the connector (org settings +
 * `EntityDefinitions.IsAuditEnabled`). Read-only.
 */
export interface AuditConfigService {
  /** Org audit settings + every table's `IsAuditEnabled` for one env. */
  loadAuditConfig(envKey: string): Promise<AuditConfigResult>
  /**
   * Column-level `IsAuditEnabled` for one table (loaded lazily on drill-down
   * — querying every table's attributes upfront is far too heavy).
   */
  listAuditColumns(
    envKey: string,
    entityLogicalName: string,
  ): Promise<AuditColumnInfo[]>
}

export const auditConfigService: AuditConfigService = dataverseAuditConfigService
