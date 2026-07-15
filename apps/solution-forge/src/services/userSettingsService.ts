import type {
  EditableUserSettings,
  UserSettingsDetail,
  UserSettingsPickers,
  UserSettingsResult,
} from '../types/userSettings'
import { dataverseUserSettingsService } from './dataverseUserSettingsService'

/**
 * Service contract for the User Settings view: reads the personal
 * `usersettings` of the chosen environment through the connector (SP identity),
 * loads one user's full settings for the detail dialog, supplies the dialog's
 * picker lists, and writes back changes.
 */
export interface UserSettingsService {
  /** Compact list of every enabled user's key settings. */
  list(envKey: string): Promise<UserSettingsResult>
  /** Full settings of one user (by `systemuserid` in that env). */
  getDetail(envKey: string, userId: string): Promise<UserSettingsDetail>
  /** Reference lists for the dialog's pickers (cached per env). */
  pickers(envKey: string): Promise<UserSettingsPickers>
  /** Write the changed fields of one user's settings (connector SP). */
  updateUserSettings(
    envKey: string,
    userId: string,
    changes: Partial<EditableUserSettings>,
  ): Promise<void>
}

export const userSettingsService: UserSettingsService =
  dataverseUserSettingsService
