import type {
  FieldSecurityProfile,
  SecuredColumn,
} from '../types/fieldSecurity'

/**
 * Pivot the profile-centric field permissions into a column-centric view:
 * one entry per secured column, listing every profile that grants it and the
 * principals each of those profiles reaches. Pure — unit-tested.
 */
export function pivotSecuredColumns(
  profiles: FieldSecurityProfile[],
): SecuredColumn[] {
  const map = new Map<string, SecuredColumn>()
  for (const profile of profiles) {
    for (const col of profile.columns) {
      const key = `${col.entity}|${col.attribute}`
      const entry =
        map.get(key) ??
        ({ entity: col.entity, attribute: col.attribute, grants: [] } as SecuredColumn)
      entry.grants.push({
        profileId: profile.id,
        profileName: profile.name,
        canRead: col.canRead,
        canCreate: col.canCreate,
        canUpdate: col.canUpdate,
        canReadUnmasked: col.canReadUnmasked,
        userCount: profile.userNames.length,
        teamCount: profile.teamNames.length,
      })
      map.set(key, entry)
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      a.entity.localeCompare(b.entity) || a.attribute.localeCompare(b.attribute),
  )
}

/** Distinct principal reach (users + teams) that can READ a secured column. */
export function readReach(column: SecuredColumn): number {
  return column.grants
    .filter((g) => g.canRead)
    .reduce((sum, g) => sum + g.userCount + g.teamCount, 0)
}
