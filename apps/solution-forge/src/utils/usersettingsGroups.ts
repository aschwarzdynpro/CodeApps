import type { EditableUserSettings } from '../types/userSettings'

/**
 * The editable `usersettings` fields grouped by the detail-dialog areas. Drives
 * both the change diff (all keys) and the "Copy to users" payload (per group).
 */
export interface SettingsGroup {
  key: 'general' | 'formats' | 'email' | 'privacy' | 'languages'
  label: string
  keys: (keyof EditableUserSettings)[]
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    key: 'general',
    label: 'General',
    keys: ['pagingLimit', 'timeZoneCode', 'currencyId', 'defaultCountryCode'],
  },
  {
    key: 'formats',
    label: 'Formats',
    keys: [
      'decimalSymbol', 'numberSeparator', 'numberGroupFormat', 'negativeFormatCode',
      'currencySymbol', 'currencyFormatCode', 'negativeCurrencyFormatCode',
      'currencyDecimalPrecision', 'timeFormatString', 'timeSeparator', 'amDesignator',
      'pmDesignator', 'showWeekNumber', 'dateFormatString', 'dateSeparator',
      'longDateFormatCode',
    ],
  },
  {
    key: 'email',
    label: 'Email',
    keys: [
      'isSendAsAllowed',
      'incomingEmailFilteringMethod',
      'isEmailConversationViewEnabled',
    ],
  },
  { key: 'privacy', label: 'Privacy', keys: ['reportScriptErrors'] },
  { key: 'languages', label: 'Languages', keys: ['uiLanguageId', 'helpLanguageId'] },
]

/** Every editable field (flattened) — used by the detail-dialog change diff. */
export const EDITABLE_KEYS: (keyof EditableUserSettings)[] =
  SETTINGS_GROUPS.flatMap((g) => g.keys)

/** Pick the selected groups' fields from a settings object into a copy payload. */
export function pickGroupValues(
  source: EditableUserSettings,
  groupKeys: Set<string>,
): Partial<EditableUserSettings> {
  const out: Record<string, unknown> = {}
  for (const g of SETTINGS_GROUPS)
    if (groupKeys.has(g.key)) for (const k of g.keys) out[k] = source[k]
  return out as Partial<EditableUserSettings>
}
