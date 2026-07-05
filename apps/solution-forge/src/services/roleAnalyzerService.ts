import type {
  CoreRoleApplyInput,
  CoreRoleApplyResult,
  EffectiveEntry,
  PrincipalRef,
  PrivilegeAction,
  ReverseLookupHit,
  RoleAssignmentPath,
  RoleHygieneReport,
  SecurityModel,
} from '../types/roles'
import type { OrgStructure } from '../types/orgStructure'
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
/**
 * Every method takes the target-environment key (from the app's configured
 * ENVIRONMENTS); the whole feature is read-only, so all of it goes cross-env
 * through the connector. The snapshot is cached per environment.
 */
export interface RoleAnalyzerService {
  /**
   * Load (or reuse) the security-model snapshot of the target environment.
   * `force` bypasses the 15-minute cache. Progress messages describe the
   * current phase.
   */
  loadModel(
    envKey: string,
    onProgress?: (message: string) => void,
    force?: boolean,
  ): Promise<SecurityModel>
  /** Enabled users matching a name fragment (from the snapshot). */
  searchUsers(query: string, envKey: string): Promise<PrincipalRef[]>
  /**
   * Effective table privileges of one user — aggregated from direct and
   * team-inherited roles, deepest depth wins, with the provenance path
   * ("prvDeleteAccount ← role 'Vertrieb Süd' ← team 'Sales DE'").
   */
  getEffectiveRights(
    userId: string,
    envKey: string,
  ): Promise<{
    entries: EffectiveEntry[]
    roles: RoleAssignmentPath[]
  }>
  /** Who can <action> on <entity>? Users and teams, each with its path. */
  reverseLookup(
    entity: string,
    action: PrivilegeAction,
    envKey: string,
  ): Promise<ReverseLookupHit[]>
  /** Unassigned roles + users holding more than `threshold` roles. */
  getHygieneReport(
    threshold: number,
    envKey: string,
  ): Promise<RoleHygieneReport>
  /**
   * Core Role Extractor automatism: create a new consolidated role, capture
   * it in the chosen working solution (AddSolutionComponent, role component
   * type 20), grant it the shared privileges, and — when `removeDuplicates`
   * is set — strip those privileges from the source roles (which then also
   * go into the solution). Writes target the HOST environment only (working
   * solutions live there); the impl guards on the env key. Returns a
   * per-step result so partial failures are visible.
   */
  applyCoreRole(
    input: CoreRoleApplyInput,
    envKey: string,
  ): Promise<CoreRoleApplyResult>
  /**
   * Org security structure for the Team & BU map: the business-unit
   * hierarchy, the teams per BU (with the roles they grant and their
   * members) and the users, for one environment. Built on the same cached
   * snapshot as the rest of the analyzer.
   */
  getOrgStructure(envKey: string): Promise<OrgStructure>
}

export const roleAnalyzerService: RoleAnalyzerService =
  dataverseRoleAnalyzerService
