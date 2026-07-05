import type { FieldSecurityResult } from '../types/fieldSecurity'
import { dataverseFieldSecurityService } from './dataverseFieldSecurityService'

/**
 * Service contract for the Field-Level Security Analyzer. Reads the Field
 * Security Profiles, their field permissions and their user/team assignments
 * of one environment through the connector. Read-only.
 */
export interface FieldSecurityService {
  loadFieldSecurity(envKey: string): Promise<FieldSecurityResult>
}

export const fieldSecurityService: FieldSecurityService =
  dataverseFieldSecurityService
