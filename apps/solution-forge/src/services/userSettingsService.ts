import type { UserSettingsResult } from '../types/userSettings'
import { dataverseUserSettingsService } from './dataverseUserSettingsService'

/**
 * Service contract for the User Settings inventory: reads the personal
 * `usersettings` of every enabled user in the chosen environment through the
 * connector (SP identity). Read-only.
 */
export interface UserSettingsService {
  list(envKey: string): Promise<UserSettingsResult>
}

export const userSettingsService: UserSettingsService =
  dataverseUserSettingsService
