/**
 * Personal user settings (`usersettings`, 1:1 with `systemuser`) of one
 * environment. The list shows a compact summary; clicking a user loads the full
 * {@link UserSettingsDetail} into a grouped, editable dialog. Reads/writes run
 * through the connector (SP identity) against the chosen environment.
 */

/** Compact list row. */
export interface UserSettingsRow {
  /** `systemuserid` in THIS environment (differs per env). */
  userId: string
  fullName: string
  /** `domainname` (UPN / login). */
  email: string
  /** Stable identity across environments; '' for application users. */
  aadObjectId: string
  /** Application (service) user rather than a human. */
  isApp: boolean
  /** Resolved time-zone display name. */
  timeZone: string
  /** The user's business unit name. */
  businessUnit: string
  /** UI language, resolved from its LCID. */
  uiLanguage: string
}

export interface UserSettingsResult {
  rows: UserSettingsRow[]
  /** Non-fatal read error. */
  error?: string
}

/** Full personal settings of one user (detail dialog). */
export interface UserSettingsDetail {
  userId: string
  fullName: string
  email: string
  /** Environment base language LCID (read-only). */
  baseLanguageLcid: number
  // General
  pagingLimit: number
  timeZoneCode: number
  /** `transactioncurrencyid` ('' when unset). */
  currencyId: string
  defaultCountryCode: string
  // Formats · Number
  decimalSymbol: string
  numberSeparator: string
  numberGroupFormat: string
  negativeFormatCode: number
  // Formats · Currency
  currencySymbol: string
  currencyFormatCode: number
  negativeCurrencyFormatCode: number
  currencyDecimalPrecision: number
  // Formats · Time
  timeFormatString: string
  timeSeparator: string
  amDesignator: string
  pmDesignator: string
  // Formats · Date
  showWeekNumber: boolean
  dateFormatString: string
  dateSeparator: string
  longDateFormatCode: number
  // Email
  isSendAsAllowed: boolean
  incomingEmailFilteringMethod: number
  isEmailConversationViewEnabled: boolean
  // Privacy
  reportScriptErrors: number
  // Languages
  uiLanguageId: number
  helpLanguageId: number
}

/** The editable fields (everything except identity + read-only base language). */
export type EditableUserSettings = Omit<
  UserSettingsDetail,
  'userId' | 'fullName' | 'email' | 'baseLanguageLcid'
>

/** Reference lists for the dialog's pickers, loaded once per environment. */
export interface TimeZoneRef {
  code: number
  name: string
}
export interface CurrencyRef {
  id: string
  code: string
  name: string
  symbol: string
}
export interface LanguageRef {
  lcid: number
  name: string
}
export interface UserSettingsPickers {
  timeZones: TimeZoneRef[]
  currencies: CurrencyRef[]
  languages: LanguageRef[]
}
