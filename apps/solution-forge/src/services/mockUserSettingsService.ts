import type {
  EditableUserSettings,
  UserSettingsDetail,
  UserSettingsPickers,
  UserSettingsResult,
  UserSettingsRow,
} from '../types/userSettings'
import type { UserSettingsService } from './userSettingsService'
import { lcidName } from '../utils/lcid'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Seed detail records (mutated by updateUserSettings so edits demo offline). */
const DETAIL: UserSettingsDetail[] = [
  {
    userId: 'u1', fullName: 'Anna Berger', email: 'anna.berger@contoso.com',
    baseLanguageLcid: 1031, pagingLimit: 50, timeZoneCode: 110, currencyId: '',
    defaultCountryCode: '49', decimalSymbol: ',', numberSeparator: '.',
    numberGroupFormat: '3', negativeFormatCode: 1, currencySymbol: '€',
    currencyFormatCode: 3, negativeCurrencyFormatCode: 8, currencyDecimalPrecision: 2,
    timeFormatString: 'HH:mm', timeSeparator: ':', amDesignator: '', pmDesignator: '',
    showWeekNumber: true, dateFormatString: 'dd.MM.yyyy', dateSeparator: '.',
    longDateFormatCode: 2, isSendAsAllowed: false, incomingEmailFilteringMethod: 1,
    isEmailConversationViewEnabled: true, reportScriptErrors: 3, uiLanguageId: 1031,
    helpLanguageId: 0,
  },
  {
    userId: 'u2', fullName: 'Ben Carter', email: 'ben.carter@contoso.com',
    baseLanguageLcid: 1031, pagingLimit: 250, timeZoneCode: 4, currencyId: '',
    defaultCountryCode: '1', decimalSymbol: '.', numberSeparator: ',',
    numberGroupFormat: '3', negativeFormatCode: 1, currencySymbol: '$',
    currencyFormatCode: 0, negativeCurrencyFormatCode: 0, currencyDecimalPrecision: 2,
    timeFormatString: 'h:mm tt', timeSeparator: ':', amDesignator: 'AM', pmDesignator: 'PM',
    showWeekNumber: false, dateFormatString: 'M/d/yyyy', dateSeparator: '/',
    longDateFormatCode: 1, isSendAsAllowed: true, incomingEmailFilteringMethod: 0,
    isEmailConversationViewEnabled: false, reportScriptErrors: 1, uiLanguageId: 1033,
    helpLanguageId: 1033,
  },
]

const TZ_NAMES: Record<number, string> = {
  110: '(GMT+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna',
  4: '(GMT-08:00) Pacific Time (US & Canada)',
}

function toRow(d: UserSettingsDetail): UserSettingsRow {
  return {
    userId: d.userId,
    fullName: d.fullName,
    email: d.email,
    aadObjectId: `aad-${d.userId}`,
    isApp: false,
    timeZone: TZ_NAMES[d.timeZoneCode] ?? `#${d.timeZoneCode}`,
    currencyCode: d.currencySymbol || '—',
    uiLanguage: lcidName(d.uiLanguageId),
  }
}

export const mockUserSettingsService: UserSettingsService = {
  async list(): Promise<UserSettingsResult> {
    await delay(200)
    return { rows: DETAIL.map(toRow) }
  },
  async getDetail(_envKey, userId): Promise<UserSettingsDetail> {
    await delay(150)
    const d = DETAIL.find((x) => x.userId === userId)
    return d ? { ...d } : { ...DETAIL[0], userId }
  },
  async pickers(): Promise<UserSettingsPickers> {
    await delay(100)
    return {
      timeZones: Object.entries(TZ_NAMES).map(([code, name]) => ({
        code: Number(code),
        name,
      })),
      currencies: [
        { id: 'c-eur', code: 'EUR', name: 'Euro', symbol: '€' },
        { id: 'c-usd', code: 'USD', name: 'US Dollar', symbol: '$' },
      ],
      languages: [
        { lcid: 1031, name: 'German (de-DE)' },
        { lcid: 1033, name: 'English (en-US)' },
      ],
    }
  },
  async updateUserSettings(
    _envKey,
    userId,
    changes: Partial<EditableUserSettings>,
  ): Promise<void> {
    await delay(200)
    const d = DETAIL.find((x) => x.userId === userId)
    if (d) Object.assign(d, changes)
  },
}
