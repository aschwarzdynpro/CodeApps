import type {
  FieldPermission,
  FieldSecurityProfile,
  FieldSecurityResult,
} from '../types/fieldSecurity'
import type { FieldSecurityService } from './fieldSecurityService'
import { mockFieldSecurityService } from './mockFieldSecurityService'
import { powerModeReady } from '../PowerProvider'
import {
  fetchXmlAllPages,
  odataQuery,
  rowNum,
  rowStr,
  type Row,
} from './currentEnvQuery'
import { orgUrlForEnvKey } from '../config'
import { pivotSecuredColumns } from '../utils/fieldSecurity'

/**
 * Real implementation of {@link FieldSecurityService}. Reads (SP identity via
 * the connector) the Field Security Profiles, their field permissions and the
 * user/team assignment intersects of the chosen environment, then assembles
 * the profile- and column-centric views.
 *
 * `fieldpermission.canread/cancreate/canupdate/canreadunmasked` are the
 * FieldPermissionType option set (0 = Not allowed, 4 = Allowed).
 */

/** FieldPermissionType "Allowed" option value. */
const ALLOWED = 4

/** Read a lookup id that fetchXml may surface either flattened form. */
function lookupId(row: Row, name: string): string {
  return rowStr(row[`_${name}_value`]) || rowStr(row[name])
}

class DataverseFieldSecurityService implements FieldSecurityService {
  async loadFieldSecurity(envKey: string): Promise<FieldSecurityResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockFieldSecurityService.loadFieldSecurity(envKey)
    const orgUrl = orgUrlForEnvKey(envKey)

    // Profiles.
    const profileRows = await odataQuery(
      'fieldsecurityprofiles',
      'fieldsecurityprofileid,name,ismanaged',
      { orgUrl },
    )
    const profiles = new Map<string, FieldSecurityProfile>()
    for (const row of profileRows) {
      const id = rowStr(row.fieldsecurityprofileid)
      if (!id) continue
      profiles.set(id, {
        id,
        name: rowStr(row.name) || '(profile)',
        isManaged: row.ismanaged === true,
        columns: [],
        userNames: [],
        teamNames: [],
      })
    }

    // Field permissions → columns per profile.
    const permRows = await fetchXmlAllPages(
      'fieldpermissions',
      `<fetch><entity name="fieldpermission">` +
        `<attribute name="fieldsecurityprofileid" />` +
        `<attribute name="entityname" />` +
        `<attribute name="attributelogicalname" />` +
        `<attribute name="cancreate" />` +
        `<attribute name="canread" />` +
        `<attribute name="canupdate" />` +
        `<attribute name="canreadunmasked" />` +
        `</entity></fetch>`,
      orgUrl,
    )
    for (const row of permRows) {
      const profileId = lookupId(row, 'fieldsecurityprofileid')
      const profile = profiles.get(profileId)
      if (!profile) continue
      const perm: FieldPermission = {
        entity: rowStr(row.entityname),
        attribute: rowStr(row.attributelogicalname),
        canRead: rowNum(row.canread) === ALLOWED,
        canCreate: rowNum(row.cancreate) === ALLOWED,
        canUpdate: rowNum(row.canupdate) === ALLOWED,
        canReadUnmasked: rowNum(row.canreadunmasked) === ALLOWED,
      }
      if (perm.attribute) profile.columns.push(perm)
    }

    // User assignments (systemuser ⋈ systemuserprofiles intersect).
    try {
      const userRows = await fetchXmlAllPages(
        'systemusers',
        `<fetch><entity name="systemuser">` +
          `<attribute name="fullname" />` +
          `<filter><condition attribute="isdisabled" operator="eq" value="false" /></filter>` +
          `<link-entity name="systemuserprofiles" from="systemuserid" to="systemuserid" intersect="true" alias="sup">` +
          `<attribute name="fieldsecurityprofileid" />` +
          `</link-entity></entity></fetch>`,
        orgUrl,
      )
      for (const row of userRows) {
        const profile = profiles.get(rowStr(row['sup.fieldsecurityprofileid']))
        const name = rowStr(row.fullname)
        if (profile && name) profile.userNames.push(name)
      }
    } catch (err) {
      console.warn('[fls] user assignments failed:', err)
    }

    // Team assignments (team ⋈ teamprofiles intersect).
    try {
      const teamRows = await fetchXmlAllPages(
        'teams',
        `<fetch><entity name="team">` +
          `<attribute name="name" />` +
          `<link-entity name="teamprofiles" from="teamid" to="teamid" intersect="true" alias="tp">` +
          `<attribute name="fieldsecurityprofileid" />` +
          `</link-entity></entity></fetch>`,
        orgUrl,
      )
      for (const row of teamRows) {
        const profile = profiles.get(rowStr(row['tp.fieldsecurityprofileid']))
        const name = rowStr(row.name)
        if (profile && name) profile.teamNames.push(name)
      }
    } catch (err) {
      console.warn('[fls] team assignments failed:', err)
    }

    const list = [...profiles.values()]
    for (const p of list) {
      p.columns.sort(
        (a, b) =>
          a.entity.localeCompare(b.entity) ||
          a.attribute.localeCompare(b.attribute),
      )
      p.userNames.sort((a, b) => a.localeCompare(b))
      p.teamNames.sort((a, b) => a.localeCompare(b))
    }
    list.sort((a, b) => a.name.localeCompare(b.name))

    return { profiles: list, columns: pivotSecuredColumns(list) }
  }
}

export const dataverseFieldSecurityService: FieldSecurityService =
  new DataverseFieldSecurityService()
