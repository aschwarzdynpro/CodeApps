import type { SecuritySnapshotSummary } from '../types/roleComparer'
import { dataverseSecurityBaselineService } from './dataverseSecurityBaselineService'

export interface SaveBaselineInput {
  name: string
  /** Human description of what was frozen ("Custom roles", "Solution: …"). */
  scope: string
  envKeys: string[]
  roleCount: number
  /** Serialized {@link file://../utils/securityBaseline} payload. */
  payload: string
  notes?: string
}

/**
 * Storage for frozen security baselines (`pro_securitysnapshot`).
 *
 * CRUD runs NATIVELY, i.e. as the signed-in user — unlike the comparison
 * itself, which reads through the connector as the service principal. Freezing
 * a baseline is an act of record: Dataverse should attribute it to the person
 * who did it (createdby is what the workspace shows as "frozen by"), and
 * deleting one should be blocked by that person's own privileges.
 *
 * The payload lives in a single multiline column; `save` refuses anything that
 * would not fit rather than storing it truncated.
 */
export interface SecurityBaselineService {
  list(): Promise<SecuritySnapshotSummary[]>
  /** The serialized payload of one baseline, or null when it cannot be read. */
  getPayload(id: string): Promise<string | null>
  save(input: SaveBaselineInput): Promise<SecuritySnapshotSummary>
  remove(id: string): Promise<void>
}

export const securityBaselineService: SecurityBaselineService =
  dataverseSecurityBaselineService
