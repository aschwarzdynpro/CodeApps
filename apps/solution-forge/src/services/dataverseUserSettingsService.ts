import type { UserSettingsResult, UserSettingsRow } from '../types/userSettings'
import type { UserSettingsService } from './userSettingsService'
import { mockUserSettingsService } from './mockUserSettingsService'
import { powerModeReady } from '../PowerProvider'
import {
  fetchXmlAllPages,
  formattedValue,
  rowNum,
  rowStr,
  type Row,
} from './currentEnvQuery'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'
import { orgUrlForEnvKey } from '../config'
import { lcidName } from '../utils/lcid'

/**
 * Real {@link UserSettingsService}. Reads `usersettings` (1:1 with
 * `systemuser`) of the chosen environment via the connector (FetchXML
 * passthrough, SP identity): joins `systemuser` for the identity + the stable
 * `azureactivedirectoryobjectid`, and `timezonedefinition` for the time-zone
 * name. Option-set columns come back as formatted values; language LCIDs are
 * resolved with {@link lcidName}. Read-only.
 */
class DataverseUserSettingsService implements UserSettingsService {
  async list(envKey: string): Promise<UserSettingsResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockUserSettingsService.list(envKey)

    const orgUrl = orgUrlForEnvKey(envKey)
    const entitySet = await this.resolveEntitySet(orgUrl, 'usersettings')
    const fetchXml =
      `<fetch>` +
      `<entity name="usersettings">` +
      `<attribute name="systemuserid" />` +
      `<attribute name="timezonecode" />` +
      `<attribute name="localeid" />` +
      `<attribute name="uilanguageid" />` +
      `<attribute name="dateformatstring" />` +
      `<attribute name="timeformatstring" />` +
      `<attribute name="paginglimit" />` +
      `<attribute name="currencysymbol" />` +
      `<attribute name="decimalsymbol" />` +
      `<attribute name="numberseparator" />` +
      `<attribute name="defaultcalendarview" />` +
      `<attribute name="advancedfindstartupmode" />` +
      `<link-entity name="systemuser" from="systemuserid" to="systemuserid" alias="u" link-type="inner">` +
      `<attribute name="fullname" />` +
      `<attribute name="domainname" />` +
      `<attribute name="azureactivedirectoryobjectid" />` +
      `<attribute name="applicationid" />` +
      `<filter><condition attribute="isdisabled" operator="eq" value="false" /></filter>` +
      `</link-entity>` +
      `<link-entity name="timezonedefinition" from="timezonecode" to="timezonecode" alias="tz" link-type="outer">` +
      `<attribute name="userinterfacename" />` +
      `</link-entity>` +
      `</entity></fetch>`

    try {
      const rows = await fetchXmlAllPages(entitySet, fetchXml, orgUrl)
      const mapped = rows
        .map((r) => this.toRow(r))
        .filter((r) => !!r.userId)
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
      return { rows: mapped }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.warn('[user-settings] read failed:', err)
      return { rows: [], error: detail }
    }
  }

  private toRow(r: Row): UserSettingsRow {
    const appId = rowStr(r['u.applicationid'])
    const aad = rowStr(r['u.azureactivedirectoryobjectid'])
    return {
      userId: rowStr(r.systemuserid),
      fullName: rowStr(r['u.fullname']) || rowStr(r['u.domainname']),
      email: rowStr(r['u.domainname']),
      aadObjectId: aad,
      isApp: !!appId,
      timeZone:
        rowStr(r['tz.userinterfacename']) ||
        (r.timezonecode != null ? `#${rowNum(r.timezonecode)}` : '—'),
      uiLanguage: lcidName(rowNum(r.uilanguageid)),
      locale: lcidName(rowNum(r.localeid)),
      dateFormat: rowStr(r.dateformatstring) || '—',
      timeFormat: rowStr(r.timeformatstring) || '—',
      currencySymbol: rowStr(r.currencysymbol) || '—',
      decimalSymbol: rowStr(r.decimalsymbol) || '—',
      numberSeparator: rowStr(r.numberseparator) || '—',
      pagingLimit: rowNum(r.paginglimit),
      calendarView:
        formattedValue(r, 'defaultcalendarview') ??
        (r.defaultcalendarview != null
          ? String(rowNum(r.defaultcalendarview))
          : '—'),
      advancedFind:
        formattedValue(r, 'advancedfindstartupmode') ??
        (r.advancedfindstartupmode != null
          ? String(rowNum(r.advancedfindstartupmode))
          : '—'),
    }
  }

  /**
   * Resolve the real `EntitySetName` the connector addresses for a table from
   * metadata (Dataverse's auto-plural isn't always the naive "+s"; `usersettings`
   * is served as `usersettingscollection`). Falls back to "+s".
   */
  private async resolveEntitySet(
    orgUrl: string,
    table: string,
  ): Promise<string> {
    const fallback = `${table}s`
    try {
      const res = await MicrosoftDataverseService.ListRecordsWithOrganization(
        orgUrl,
        'EntityDefinitions',
        undefined,
        undefined,
        undefined,
        undefined,
        'LogicalName,EntitySetName',
        `LogicalName eq '${table.replace(/'/g, "''")}'`,
      )
      if (res && res.success === false) return fallback
      const rows =
        (res.data as { value?: Array<Record<string, unknown>> } | undefined)
          ?.value ?? []
      return rowStr(rows[0]?.EntitySetName) || fallback
    } catch (err) {
      console.warn('[user-settings] EntitySetName resolve failed:', err)
      return fallback
    }
  }
}

export const dataverseUserSettingsService: UserSettingsService =
  new DataverseUserSettingsService()
