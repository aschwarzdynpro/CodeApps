import type { AppSharingResult } from '../types/sharing'
import { dataverseSharingService } from './dataverseSharingService'

/**
 * Service contract for the app-sharing inspector.
 *
 * `checkAppSharing()` resolves the canvas apps and custom pages of one
 * solution (in the current environment) and, for every configured
 * environment, reports who each app is shared with — so you can tell
 * whether a deployed canvas app actually reaches its users in UAT/PROD.
 *
 * The exported singleton is Dataverse-backed and falls back to mock data
 * outside a Power Platform host.
 */
export interface SharingService {
  checkAppSharing(
    solutionId: string,
    onProgress?: (message: string) => void,
  ): Promise<AppSharingResult>
}

export const sharingService: SharingService = dataverseSharingService
