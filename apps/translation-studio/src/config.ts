/**
 * Org URL of the target environment — every connector call needs it
 * (`…WithOrganization`). It can't be discovered at runtime: `getContext()`
 * only returns the environment id (same reasoning as schedule-board-manager).
 * Build-time setting from `.env`; empty = setup page explains what's missing.
 */
export const ORG_URL = (import.meta.env.VITE_ORG_URL ?? '').trim().replace(/\/+$/, '')
