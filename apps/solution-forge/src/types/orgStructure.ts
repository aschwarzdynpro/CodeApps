/**
 * Team & BU Map — the org security structure: the business-unit hierarchy,
 * the teams docked to each BU, and (for role-granting teams) their roles and
 * members. Used to visualize where team-inherited rights come from.
 */

/** team.teamtype option values. */
export const TEAM_TYPE = {
  owner: 0,
  access: 1,
  aadSecurityGroup: 2,
  aadOfficeGroup: 3,
} as const

export const TEAM_TYPE_LABELS: Record<number, string> = {
  0: 'Owner',
  1: 'Access',
  2: 'Microsoft Entra security group',
  3: 'Microsoft Entra Office group',
}

export interface OrgTeam {
  id: string
  name: string
  /** Owning business unit id. */
  buId: string
  teamType: number
  isDefault: boolean
  /** Names of the (root) security roles this team grants. */
  roleNames: string[]
  /** Member user ids (only resolved for role-granting teams). */
  memberIds: string[]
  /** Member display names, parallel to {@link memberIds}. */
  memberNames: string[]
}

export interface OrgBusinessUnit {
  id: string
  name: string
  parentId: string | null
  /** Users whose businessunitid is this BU. */
  userCount: number
}

export interface OrgUserRef {
  id: string
  name: string
  buId: string
}

export interface OrgStructure {
  businessUnits: OrgBusinessUnit[]
  /** buId → teams owned by that BU. */
  teamsByBu: Record<string, OrgTeam[]>
  /** Enabled users, for the trace picker. */
  users: OrgUserRef[]
  loadedAt: Date
}
