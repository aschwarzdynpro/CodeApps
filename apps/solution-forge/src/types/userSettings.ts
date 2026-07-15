/**
 * Personal user settings (`usersettings`, 1:1 with `systemuser`) of one
 * environment — a read-only inventory for the User Settings view. Reads run
 * through the connector (SP identity) against the chosen environment.
 */

/** One user's personal settings in a single environment. */
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
  /** Resolved time-zone display name (from `timezonedefinition`). */
  timeZone: string
  /** UI language, resolved from its LCID (e.g. "German (de-DE)"). */
  uiLanguage: string
  /** Base locale, resolved from its LCID. */
  locale: string
  /** e.g. "dd/MM/yyyy". */
  dateFormat: string
  /** e.g. "HH:mm". */
  timeFormat: string
  currencySymbol: string
  decimalSymbol: string
  numberSeparator: string
  /** Records per page (`paginglimit`). */
  pagingLimit: number
  /** Default calendar view (option-set label). */
  calendarView: string
  /** Advanced Find startup mode (option-set label). */
  advancedFind: string
}

export interface UserSettingsResult {
  rows: UserSettingsRow[]
  /** Non-fatal read error (e.g. the env couldn't be queried). */
  error?: string
}
