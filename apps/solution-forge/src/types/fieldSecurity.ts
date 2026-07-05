/**
 * Field-Level Security Analyzer — the column-level analog of the role matrix.
 * Dataverse secures individual columns via Field Security Profiles
 * (`fieldsecurityprofile`) that carry Field Permissions (`fieldpermission`,
 * one per secured column: Read / Create / Update / ReadUnmasked). Profiles
 * are assigned to users (`systemuserprofiles`) and teams (`teamprofiles`).
 * System Administrators bypass field security entirely.
 */

/** One secured column's access inside a profile. */
export interface FieldPermission {
  /** Owning table logical name. */
  entity: string
  /** Secured column logical name. */
  attribute: string
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  /** Read the real (unmasked) value where masking applies. */
  canReadUnmasked: boolean
}

export interface FieldSecurityProfile {
  id: string
  name: string
  isManaged: boolean
  columns: FieldPermission[]
  userNames: string[]
  teamNames: string[]
}

/** How one profile grants access to a secured column (column-centric view). */
export interface SecuredColumnGrant {
  profileId: string
  profileName: string
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canReadUnmasked: boolean
  /** Principals the granting profile reaches. */
  userCount: number
  teamCount: number
}

/** One secured column across all profiles that grant it. */
export interface SecuredColumn {
  entity: string
  attribute: string
  grants: SecuredColumnGrant[]
}

export interface FieldSecurityResult {
  profiles: FieldSecurityProfile[]
  columns: SecuredColumn[]
}
