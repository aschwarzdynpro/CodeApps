import type { UserSettingsResult, UserSettingsRow } from '../types/userSettings'
import type { UserSettingsService } from './userSettingsService'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** A few users with per-env variance so the inventory is demoable offline. */
const BASE: UserSettingsRow[] = [
  {
    userId: 'u1',
    fullName: 'Anna Berger',
    email: 'anna.berger@contoso.com',
    aadObjectId: 'aad-1',
    isApp: false,
    timeZone: 'W. Europe Standard Time',
    uiLanguage: 'German (de-DE)',
    locale: 'German (de-DE)',
    dateFormat: 'dd.MM.yyyy',
    timeFormat: 'HH:mm',
    currencySymbol: '€',
    decimalSymbol: ',',
    numberSeparator: '.',
    pagingLimit: 50,
    calendarView: 'Week',
    advancedFind: 'Simple',
  },
  {
    userId: 'u2',
    fullName: 'Ben Carter',
    email: 'ben.carter@contoso.com',
    aadObjectId: 'aad-2',
    isApp: false,
    timeZone: 'Pacific Standard Time',
    uiLanguage: 'English (en-US)',
    locale: 'English (en-US)',
    dateFormat: 'M/d/yyyy',
    timeFormat: 'h:mm tt',
    currencySymbol: '$',
    decimalSymbol: '.',
    numberSeparator: ',',
    pagingLimit: 250,
    calendarView: 'Month',
    advancedFind: 'Detailed',
  },
  {
    userId: 'svc1',
    fullName: 'Integration Service',
    email: 'svc.integration@contoso.com',
    aadObjectId: '',
    isApp: true,
    timeZone: 'UTC',
    uiLanguage: 'English (en-US)',
    locale: 'English (en-US)',
    dateFormat: 'yyyy-MM-dd',
    timeFormat: 'HH:mm',
    currencySymbol: '$',
    decimalSymbol: '.',
    numberSeparator: ',',
    pagingLimit: 50,
    calendarView: 'Day',
    advancedFind: 'Simple',
  },
]

export const mockUserSettingsService: UserSettingsService = {
  async list(envKey: string): Promise<UserSettingsResult> {
    await delay(250)
    // Vary one user per env so switching the picker shows differences.
    const rows = BASE.map((r) => {
      if (r.userId === 'u1' && envKey === 'prod')
        return { ...r, uiLanguage: 'English (en-US)', pagingLimit: 250 }
      if (r.userId === 'u2' && envKey === 'uat')
        return { ...r, dateFormat: 'dd/MM/yyyy' }
      return r
    })
    return { rows }
  },
}
