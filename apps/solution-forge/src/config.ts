/**
 * Deployment-specific links. The environment id is detected at runtime from
 * the Power Apps host context (see PowerProvider); these env vars are the
 * fallback for plain local development and for the Azure DevOps organisation,
 * which the host can't know. Set them in `.env.local`:
 *
 *   VITE_ENVIRONMENT_ID=84280d0b-…       # Dataverse environment (maker links)
 *   VITE_ADO_ORG_URL=https://dev.azure.com/dynpro
 *   VITE_ADO_PROJECT=MyProject           # project containing the work items
 */

// Project defaults — not secrets; env vars override them at build time.
// (.env files are gitignored repo-wide, so the defaults live here.)
const DEFAULT_ENVIRONMENT_ID = '84280d0b-d994-ed52-9789-116d9b73384f'
const DEFAULT_ADO_ORG_URL = 'https://dev.azure.com/SchulzD365'
const DEFAULT_ADO_PROJECT = 'D365UO'

export const FALLBACK_ENVIRONMENT_ID: string =
  import.meta.env.VITE_ENVIRONMENT_ID ?? DEFAULT_ENVIRONMENT_ID

const ADO_ORG_URL: string =
  import.meta.env.VITE_ADO_ORG_URL ?? DEFAULT_ADO_ORG_URL
const ADO_PROJECT: string =
  import.meta.env.VITE_ADO_PROJECT ?? DEFAULT_ADO_PROJECT

/** Organisation ("account") name for connector calls — the last path
 *  segment of the org URL, e.g. "SchulzD365". Empty when unconfigured. */
export const ADO_ACCOUNT: string =
  ADO_ORG_URL.replace(/\/+$/, '').split('/').pop() ?? ''
/** Project name for connector calls, e.g. "D365UO". */
export const ADO_PROJECT_NAME: string = ADO_PROJECT

/** Maker-portal deep link to one solution (objects list), or the solutions
 *  area when no environment id is known. */
export function makerSolutionUrl(
  environmentId: string | null,
  solutionId: string,
): string {
  const envId = environmentId || FALLBACK_ENVIRONMENT_ID
  return envId
    ? `https://make.powerapps.com/environments/${envId}/solutions/${solutionId}`
    : 'https://make.powerapps.com'
}

/** Azure DevOps work item link, or null when the org isn't configured yet. */
export function devOpsWorkItemUrl(devOpsId: string | null): string | null {
  if (!devOpsId || !ADO_ORG_URL || !ADO_PROJECT) return null
  if (!/^\d+$/.test(devOpsId)) return null
  return `${ADO_ORG_URL.replace(/\/$/, '')}/${ADO_PROJECT}/_workitems/edit/${devOpsId}`
}
