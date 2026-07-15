import type {
  CurrencyRef,
  EditableUserSettings,
  UserSettingsDetail,
  UserSettingsPickers,
  UserSettingsResult,
  UserSettingsRow,
} from '../types/userSettings'
import type { UserSettingsService } from './userSettingsService'
import { mockUserSettingsService } from './mockUserSettingsService'
import { powerModeReady } from '../PowerProvider'
import {
  fetchXmlAllPages,
  fetchXmlEscape,
  fetchXmlQuery,
  odataQuery,
  rowNum,
  rowStr,
  type Row,
} from './currentEnvQuery'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'
import { orgUrlForEnvKey } from '../config'
import { languageChoices, lcidName } from '../utils/lcid'

/** Detail field → `usersettings` attribute logical name (write mapping). */
const ATTR: Record<keyof EditableUserSettings, string> = {
  pagingLimit: 'paginglimit',
  timeZoneCode: 'timezonecode',
  currencyId: 'transactioncurrencyid',
  defaultCountryCode: 'defaultcountrycode',
  decimalSymbol: 'decimalsymbol',
  numberSeparator: 'numberseparator',
  numberGroupFormat: 'numbergroupformat',
  negativeFormatCode: 'negativeformatcode',
  currencySymbol: 'currencysymbol',
  currencyFormatCode: 'currencyformatcode',
  negativeCurrencyFormatCode: 'negativecurrencyformatcode',
  currencyDecimalPrecision: 'currencydecimalprecision',
  timeFormatString: 'timeformatstring',
  timeSeparator: 'timeseparator',
  amDesignator: 'amdesignator',
  pmDesignator: 'pmdesignator',
  showWeekNumber: 'showweeknumber',
  dateFormatString: 'dateformatstring',
  dateSeparator: 'dateseparator',
  longDateFormatCode: 'longdateformatcode',
  isSendAsAllowed: 'issendasallowed',
  incomingEmailFilteringMethod: 'incomingemailfilteringmethod',
  isEmailConversationViewEnabled: 'isemailconversationviewenabled',
  reportScriptErrors: 'reportscripterrors',
  uiLanguageId: 'uilanguageid',
  helpLanguageId: 'helplanguageid',
}

const DETAIL_ATTRS = [
  'systemuserid',
  'paginglimit',
  'timezonecode',
  'transactioncurrencyid',
  'defaultcountrycode',
  'decimalsymbol',
  'numberseparator',
  'numbergroupformat',
  'negativeformatcode',
  'currencysymbol',
  'currencyformatcode',
  'negativecurrencyformatcode',
  'currencydecimalprecision',
  'timeformatstring',
  'timeseparator',
  'amdesignator',
  'pmdesignator',
  'showweeknumber',
  'dateformatstring',
  'dateseparator',
  'longdateformatcode',
  'issendasallowed',
  'incomingemailfilteringmethod',
  'isemailconversationviewenabled',
  'reportscripterrors',
  'uilanguageid',
  'helplanguageid',
]

/**
 * Real {@link UserSettingsService}. Reads/writes `usersettings` (1:1 with
 * `systemuser`, PK = `systemuserid`) of the chosen environment via the
 * connector (SP identity). Entity set resolved from metadata
 * (`usersettingscollection`); writes use `UpdateRecordWithOrganization`.
 */
class DataverseUserSettingsService implements UserSettingsService {
  private entitySetByOrg = new Map<string, string>()
  private pickersByEnv = new Map<string, UserSettingsPickers>()
  private baseLangByOrg = new Map<string, number>()

  async list(envKey: string): Promise<UserSettingsResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockUserSettingsService.list(envKey)

    const orgUrl = orgUrlForEnvKey(envKey)
    const entitySet = await this.entitySet(orgUrl)
    const fetchXml =
      `<fetch>` +
      `<entity name="usersettings">` +
      `<attribute name="systemuserid" />` +
      `<attribute name="timezonecode" />` +
      `<attribute name="uilanguageid" />` +
      `<link-entity name="systemuser" from="systemuserid" to="systemuserid" alias="u" link-type="inner">` +
      `<attribute name="fullname" />` +
      `<attribute name="domainname" />` +
      `<attribute name="azureactivedirectoryobjectid" />` +
      `<attribute name="applicationid" />` +
      `<filter><condition attribute="isdisabled" operator="eq" value="false" /></filter>` +
      `<link-entity name="businessunit" from="businessunitid" to="businessunitid" alias="bu" link-type="outer">` +
      `<attribute name="name" />` +
      `</link-entity>` +
      `</link-entity>` +
      `<link-entity name="timezonedefinition" from="timezonecode" to="timezonecode" alias="tz" link-type="outer">` +
      `<attribute name="userinterfacename" />` +
      `</link-entity>` +
      `</entity></fetch>`
    try {
      const rows = await fetchXmlAllPages(entitySet, fetchXml, orgUrl)
      const mapped: UserSettingsRow[] = rows
        .map((r) => {
          const appId = rowStr(r['u.applicationid'])
          return {
            userId: rowStr(r.systemuserid),
            fullName: rowStr(r['u.fullname']) || rowStr(r['u.domainname']),
            email: rowStr(r['u.domainname']),
            aadObjectId: rowStr(r['u.azureactivedirectoryobjectid']),
            isApp: !!appId,
            timeZone:
              rowStr(r['tz.userinterfacename']) ||
              (r.timezonecode != null ? `#${rowNum(r.timezonecode)}` : '—'),
            businessUnit: rowStr(r['bu.name']) || '—',
            uiLanguage: lcidName(rowNum(r.uilanguageid)),
          }
        })
        .filter((r) => !!r.userId)
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
      return { rows: mapped }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.warn('[user-settings] list failed:', err)
      return { rows: [], error: detail }
    }
  }

  async getDetail(envKey: string, userId: string): Promise<UserSettingsDetail> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockUserSettingsService.getDetail(envKey, userId)

    const orgUrl = orgUrlForEnvKey(envKey)
    const entitySet = await this.entitySet(orgUrl)
    const attrs = DETAIL_ATTRS.map((a) => `<attribute name="${a}" />`).join('')
    const fetchXml =
      `<fetch top="1"><entity name="usersettings">${attrs}` +
      `<link-entity name="systemuser" from="systemuserid" to="systemuserid" alias="u">` +
      `<attribute name="fullname" /><attribute name="domainname" />` +
      `</link-entity>` +
      `<filter><condition attribute="systemuserid" operator="eq" value="${fetchXmlEscape(userId)}" /></filter>` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery(entitySet, fetchXml, orgUrl)
    const r: Row = rows[0] ?? {}
    return {
      userId: rowStr(r.systemuserid) || userId,
      fullName: rowStr(r['u.fullname']) || rowStr(r['u.domainname']),
      email: rowStr(r['u.domainname']),
      baseLanguageLcid: await this.baseLanguage(orgUrl),
      pagingLimit: rowNum(r.paginglimit),
      timeZoneCode: rowNum(r.timezonecode),
      currencyId: rowStr(r._transactioncurrencyid_value),
      defaultCountryCode: rowStr(r.defaultcountrycode),
      decimalSymbol: rowStr(r.decimalsymbol),
      numberSeparator: rowStr(r.numberseparator),
      numberGroupFormat: rowStr(r.numbergroupformat),
      negativeFormatCode: rowNum(r.negativeformatcode),
      currencySymbol: rowStr(r.currencysymbol),
      currencyFormatCode: rowNum(r.currencyformatcode),
      negativeCurrencyFormatCode: rowNum(r.negativecurrencyformatcode),
      currencyDecimalPrecision: rowNum(r.currencydecimalprecision),
      timeFormatString: rowStr(r.timeformatstring),
      timeSeparator: rowStr(r.timeseparator),
      amDesignator: rowStr(r.amdesignator),
      pmDesignator: rowStr(r.pmdesignator),
      showWeekNumber: r.showweeknumber === true,
      dateFormatString: rowStr(r.dateformatstring),
      dateSeparator: rowStr(r.dateseparator),
      longDateFormatCode: rowNum(r.longdateformatcode),
      isSendAsAllowed: r.issendasallowed === true,
      incomingEmailFilteringMethod: rowNum(r.incomingemailfilteringmethod),
      isEmailConversationViewEnabled: r.isemailconversationviewenabled === true,
      reportScriptErrors: rowNum(r.reportscripterrors),
      uiLanguageId: rowNum(r.uilanguageid),
      helpLanguageId: rowNum(r.helplanguageid),
    }
  }

  async pickers(envKey: string): Promise<UserSettingsPickers> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockUserSettingsService.pickers(envKey)

    const orgUrl = orgUrlForEnvKey(envKey)
    const cached = this.pickersByEnv.get(orgUrl)
    if (cached) return cached

    const tzRows = await fetchXmlAllPages(
      'timezonedefinitions',
      `<fetch><entity name="timezonedefinition"><attribute name="timezonecode" /><attribute name="userinterfacename" /><order attribute="userinterfacename" /></entity></fetch>`,
      orgUrl,
    ).catch(() => [] as Row[])
    const timeZones = tzRows
      .map((r) => ({
        code: rowNum(r.timezonecode),
        name: rowStr(r.userinterfacename),
      }))
      .filter((t) => !!t.name)

    const curRows = await odataQuery(
      'transactioncurrencies',
      'transactioncurrencyid,isocurrencycode,currencyname,currencysymbol',
      { orgUrl },
    ).catch(() => [] as Row[])
    const currencies: CurrencyRef[] = curRows
      .map((r) => ({
        id: rowStr(r.transactioncurrencyid),
        code: rowStr(r.isocurrencycode),
        name: rowStr(r.currencyname),
        symbol: rowStr(r.currencysymbol),
      }))
      .filter((c) => !!c.id)
      .sort((a, b) => a.code.localeCompare(b.code))

    const pickers: UserSettingsPickers = {
      timeZones,
      currencies,
      languages: languageChoices(),
    }
    this.pickersByEnv.set(orgUrl, pickers)
    return pickers
  }

  async updateUserSettings(
    envKey: string,
    userId: string,
    changes: Partial<EditableUserSettings>,
  ): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockUserSettingsService.updateUserSettings(envKey, userId, changes)

    const item: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'currencyId') {
        // Only set (not clear) the default-currency lookup.
        if (value)
          item['transactioncurrencyid@odata.bind'] = `/transactioncurrencies(${String(value)})`
        continue
      }
      const attr = ATTR[key as keyof EditableUserSettings]
      if (attr) item[attr] = value
    }
    if (Object.keys(item).length === 0) return

    const orgUrl = orgUrlForEnvKey(envKey)
    const entitySet = await this.entitySet(orgUrl)
    const res = await MicrosoftDataverseService.UpdateRecordWithOrganization(
      'return=representation',
      'application/json',
      orgUrl,
      entitySet,
      userId,
      item,
    )
    if (res && res.success === false) {
      const d = (res as { error?: { message?: string } }).error?.message
      throw new Error(`Saving user settings failed${d ? ` — ${d}` : ''}`)
    }
  }

  private async baseLanguage(orgUrl: string): Promise<number> {
    const cached = this.baseLangByOrg.get(orgUrl)
    if (cached != null) return cached
    let lcid = 0
    try {
      const rows = await odataQuery('organizations', 'languagecode', { orgUrl })
      lcid = rowNum(rows[0]?.languagecode)
    } catch (err) {
      console.warn('[user-settings] base language read failed:', err)
    }
    this.baseLangByOrg.set(orgUrl, lcid)
    return lcid
  }

  /** Resolve + cache `usersettings`' entity-set name (metadata; not naive +s). */
  private async entitySet(orgUrl: string): Promise<string> {
    const cached = this.entitySetByOrg.get(orgUrl)
    if (cached) return cached
    let set = 'usersettingscollection'
    try {
      const res = await MicrosoftDataverseService.ListRecordsWithOrganization(
        orgUrl,
        'EntityDefinitions',
        undefined,
        undefined,
        undefined,
        undefined,
        'LogicalName,EntitySetName',
        `LogicalName eq 'usersettings'`,
      )
      if (!(res && res.success === false)) {
        const rows =
          (res.data as { value?: Array<Record<string, unknown>> } | undefined)
            ?.value ?? []
        set = rowStr(rows[0]?.EntitySetName) || set
      }
    } catch (err) {
      console.warn('[user-settings] EntitySetName resolve failed:', err)
    }
    this.entitySetByOrg.set(orgUrl, set)
    return set
  }
}

export const dataverseUserSettingsService: UserSettingsService =
  new DataverseUserSettingsService()
