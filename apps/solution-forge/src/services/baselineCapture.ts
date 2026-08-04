/**
 * Captures the non-role material that goes into a security baseline: the
 * business-unit / team structure, the field-security profiles and the audit
 * configuration, per environment.
 *
 * WHY THIS IS SEPARATE FROM THE COMPARISON. The Role Comparer deliberately
 * loads as little as possible (roles and privileges, no assignment graph) so
 * a comparison stays fast. Freezing a baseline is the opposite situation: it
 * happens rarely, on purpose, and the result is meant to be a complete record
 * — so here we pay for the heavy reads, including
 * `roleAnalyzerService.getOrgStructure`, which needs the full snapshot.
 *
 * Every section is best-effort in its own try/catch. A field-security read
 * that fails must not cost you the whole freeze; the section is then simply
 * ABSENT, which the document reports as "not captured" — never as "none".
 */

import { auditConfigService } from './auditConfigService'
import { fieldSecurityService } from './fieldSecurityService'
import { roleAnalyzerService } from './roleAnalyzerService'
import type {
  BaselineAudit,
  BaselineBu,
  BaselineExtras,
  BaselineFlsProfile,
  BaselineOrg,
  BaselineTeam,
} from '../utils/securityBaseline'

export interface CaptureResult {
  extras: Record<string, BaselineExtras>
  /** Per environment, the sections that could not be read, with the reason. */
  errors: { envKey: string; section: string; message: string }[]
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export async function captureBaselineExtras(
  envKeys: string[],
  onProgress?: (text: string) => void,
): Promise<CaptureResult> {
  const extras: Record<string, BaselineExtras> = {}
  const errors: CaptureResult['errors'] = []

  for (const envKey of envKeys) {
    const entry: BaselineExtras = {}

    try {
      onProgress?.(`${envKey}: business units & teams…`)
      const org = await roleAnalyzerService.getOrgStructure(envKey)
      const buNameById = new Map(org.businessUnits.map((bu) => [bu.id, bu.name]))
      const bus: BaselineBu[] = org.businessUnits.map((bu) => ({
        n: bu.name,
        // Parents are frozen by NAME: an id says nothing in a document and
        // nothing across environments.
        p: bu.parentId ? (buNameById.get(bu.parentId) ?? '') : '',
        u: bu.userCount,
      }))
      const teams: BaselineTeam[] = []
      for (const [buId, list] of Object.entries(org.teamsByBu)) {
        for (const team of list) {
          teams.push({
            n: team.name,
            bu: buNameById.get(buId) ?? '',
            t: team.teamType,
            r: [...team.roleNames].sort(),
            m: team.memberIds.length,
          })
        }
      }
      teams.sort((a, b) => a.n.localeCompare(b.n))
      const orgSection: BaselineOrg = { bus, teams }
      entry.org = orgSection
    } catch (error) {
      errors.push({ envKey, section: 'Business units & teams', message: message(error) })
    }

    try {
      onProgress?.(`${envKey}: field security…`)
      const fls = await fieldSecurityService.loadFieldSecurity(envKey)
      entry.fls = fls.profiles.map<BaselineFlsProfile>((profile) => ({
        n: profile.name,
        m: profile.isManaged ? 1 : 0,
        c: profile.columns.map((column) => ({
          e: column.entity,
          a: column.attribute,
          r: column.canRead ? 1 : 0,
          w: column.canCreate ? 1 : 0,
          u: column.canUpdate ? 1 : 0,
          x: column.canReadUnmasked ? 1 : 0,
        })),
        au: profile.userNames.length,
        at: profile.teamNames.length,
      }))
    } catch (error) {
      errors.push({ envKey, section: 'Field security', message: message(error) })
    }

    try {
      onProgress?.(`${envKey}: audit configuration…`)
      const audit = await auditConfigService.loadAuditConfig(envKey)
      const section: BaselineAudit = {
        on: audit.org.auditingEnabled ? 1 : 0,
        ret: audit.org.retentionDays,
        // Only the audited tables are frozen; the rest is the total, which is
        // what makes "12 of 480" possible without storing 480 names.
        tables: audit.tables
          .filter((t) => t.auditEnabled)
          .map((t) => t.logicalName)
          .sort(),
        total: audit.tables.length,
      }
      entry.audit = section
    } catch (error) {
      errors.push({ envKey, section: 'Audit configuration', message: message(error) })
    }

    extras[envKey] = entry
  }

  return { extras, errors }
}
