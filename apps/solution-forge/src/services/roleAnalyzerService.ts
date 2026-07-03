import type {
  EffectiveEntry,
  PrincipalRef,
  PrivilegeAction,
  ReverseLookupHit,
  RoleAssignmentPath,
  RoleHygieneReport,
  SecurityModel,
} from '../types/roles'
import { dataverseRoleAnalyzerService } from './dataverseRoleAnalyzerService'

/**
 * Service contract for the Security Role Analyzer.
 *
 * The analyzer works on a session-cached SNAPSHOT of the security model
 * (roles aggregated on `parentrootroleid`, the privilege metadata and the
 * role-privilege intersect) plus the assignment graph (user roles, team
 * roles, team membership). Privilege metadata rarely changes, so the
 * snapshot is cached aggressively (~15 min) and every view derives from it
 * client-side — matrix, diff, effective rights, reverse lookup, hygiene.
 *
 * v1 is strictly READ-ONLY: no role editing.
 *
 * Note on effective rights: the platform function `RetrieveUserPrivileges`
 * would be authoritative but is a GET *function*, which the Dataverse
 * connector cannot invoke (no GET-function operation — see CLAUDE.md gotcha
 * #8). The analyzer therefore aggregates client-side from direct roles +
 * team roles, which also yields the provenance path shown in the UI.
 */
export interface RoleAnalyzerService {
  /**
   * Load (or reuse) the security-model snapshot. `force` bypasses the
   * 15-minute cache. Progress messages describe the current phase.
   */
  loadModel(
    onProgress?: (message: string) => void,
    force?: boolean,
  ): Promise<SecurityModel>
  /** Enabled users matching a name fragment (from the snapshot). */
  searchUsers(query: string): Promise<PrincipalRef[]>
  /**
   * Effective table privileges of one user — aggregated from direct and
   * team-inherited roles, deepest depth wins, with the provenance path
   * ("prvDeleteAccount ← role 'Vertrieb Süd' ← team 'Sales DE'").
   */
  getEffectiveRights(userId: string): Promise<{
    entries: EffectiveEntry[]
    roles: RoleAssignmentPath[]
  }>
  /** Who can <action> on <entity>? Users and teams, each with its path. */
  reverseLookup(
    entity: string,
    action: PrivilegeAction,
  ): Promise<ReverseLookupHit[]>
  /** Unassigned roles + users holding more than `threshold` roles. */
  getHygieneReport(threshold: number): Promise<RoleHygieneReport>
}

export const roleAnalyzerService: RoleAnalyzerService =
  dataverseRoleAnalyzerService
