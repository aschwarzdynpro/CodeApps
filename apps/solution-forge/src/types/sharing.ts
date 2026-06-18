import type { EnvKey } from './comparison'

/**
 * App-sharing model: for the canvas apps and custom pages of a solution,
 * who each one is shared with in every environment. Solution import never
 * carries user sharing, so a canvas app deployed to UAT/PROD typically
 * reaches nobody until it is shared there — that gap is what this tab
 * surfaces.
 *
 * Cross-environment data path: canvas apps are matched by their import-
 * stable unique name (`canvasapp.name`); the sharing principals come from
 * the `RetrieveSharedPrincipalsAndAccess` message, invoked per environment
 * through the Dataverse connector's `PerformUnboundActionWithOrganization`.
 */

/**
 * Bucket derived from canvasapp.canvasapptype. Component libraries
 * (canvasapptype 1) can't be shared with users and are excluded upstream.
 */
export type CanvasAppKind = 'canvas' | 'custompage'

export const CANVAS_KIND_LABELS: Record<CanvasAppKind, string> = {
  canvas: 'Canvas Apps',
  custompage: 'Custom Pages',
}

/** One principal a canvas app is shared with in one environment. */
export interface SharedPrincipal {
  id: string
  type: 'user' | 'team' | 'organization'
  /** Resolved display name (fullname / team name); id fallback. */
  name: string
  /** Simplified access rights, e.g. "Read, Write" or "Co-owner". */
  access: string
}

/** A canvas app's sharing state in one environment. */
export interface AppSharingState {
  present: boolean
  /** canvasappid in this environment (diverges per env — see gotcha #7). */
  appId?: string
  /** Owner display name (owneridname). */
  ownerName?: string
  principals: SharedPrincipal[]
  /** Set when the sharing lookup for this app/env failed. */
  error?: boolean
}

/** One canvas app / custom page across the environments. */
export interface AppSharingRow {
  /** canvasapp.name — the import-stable cross-environment match key. */
  name: string
  displayName: string
  kind: CanvasAppKind
  byEnv: Record<EnvKey, AppSharingState | null>
}

export interface AppSharingResult {
  rows: AppSharingRow[]
  /** Environments that failed entirely (auth, network, permissions). */
  envErrors: Partial<Record<EnvKey, string>>
}
