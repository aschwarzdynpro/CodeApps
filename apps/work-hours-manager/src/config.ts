/**
 * Build-time configuration. `.env` is gitignored repo-wide, so every default
 * lives here; `VITE_ORG_URL` comes from `.env` (template in `.env.example`).
 *
 * The org URL cannot be discovered at runtime (the SDK's `getContext()` only
 * returns the environment id), and the Dataverse connector needs it for every
 * call (`…WithOrganization`, solution-forge gotcha #4).
 */
export const ORG_URL = (import.meta.env.VITE_ORG_URL ?? '').trim().replace(/\/+$/, '')

export const canDeepLink = ORG_URL !== ''

/** Build time (set by vite.config.ts) — tells which push the player is running. */
export const BUILD_TIME: string = import.meta.env.VITE_BUILD_TIME ?? 'dev'

export function recordUrl(table: string, recordId: string | null | undefined): string | null {
  if (!ORG_URL || !recordId) return null
  return `${ORG_URL}/main.aspx?pagetype=entityrecord&etn=${encodeURIComponent(table)}&id=${encodeURIComponent(recordId)}`
}

/** Limits from the concept ("Leitplanken"). */
export const LIMITS = {
  /** Resources per mass run, run sequentially. */
  maxRunResources: 50,
  /** Runs kept in the browser. */
  historyMax: 20,
  /** Finding 5.2: rules ending within this many days. */
  ruleEndingDays: 90,
  /** Finding 5.1: default look-ahead window in days. */
  diagnosticsWindowDays: 60,
  /** Calendar rows above which the week view windows its rows. */
  virtualizeFrom: 100,
  /** Calendars read in parallel — one request each, `$expand` of the rules only works per row. */
  calendarReadConcurrency: 8,
} as const

/** Time zone the app falls back to when a code is unknown (Berlin). */
export const DEFAULT_TIME_ZONE_CODE = 110

/** `UseV2` on every Save/Delete (concept: uniform, default on, explained in help). Switchable in the settings. */
export const DEFAULT_USE_V2 = true
