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

import type { EnvironmentDef } from './types/comparison'

// Project defaults — not secrets; env vars override them at build time.
// (.env files are gitignored repo-wide, so the defaults live here.)
const DEFAULT_ENVIRONMENT_ID = '431783f6-367c-eb49-984b-4e70e4c0424d'

/**
 * Environments for the ALM comparison. Hardcoded for now; the planned
 * upgrade is a Dataverse control table (e.g. sst_environmentconfig) read at
 * startup, with these values as fallback. The connector's GetOrganizations()
 * can validate the URLs against what the signed-in user can actually reach.
 */
export const ENVIRONMENTS: EnvironmentDef[] = [
  {
    key: 'dev',
    label: 'INT-11 · current',
    url: 'https://operations-d365-schulz-int-11.crm4.dynamics.com',
    environmentId: '431783f6-367c-eb49-984b-4e70e4c0424d',
    isCurrent: true,
  },
  {
    key: 'uat',
    label: 'UAT',
    url: 'https://operations-d365-schulz-uat-1-1.crm4.dynamics.com',
    environmentId: '2eaa34de-dcf1-e949-86d9-82d9fd748045',
  },
  {
    key: 'prod',
    label: 'PROD',
    url: 'https://operations-d365-schulz-prod.crm4.dynamics.com',
    environmentId: '0cb8d3e7-faf3-eb34-a648-e3e309c3164d',
  },
]
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

/**
 * TEMPORARY: the Azure DevOps work item panel is disabled until the
 * service-principal access to dev.azure.com/SchulzD365 is sorted out
 * (see TODO.md "Auth auf Service Principal umstellen"). While false, the
 * panel is hidden, no work items are fetched, and the DevOps connector is
 * removed from the app so users get no connection prompt at startup.
 * Re-enable: re-add the connector data source (-cr sst_CRDevOps), restore
 * the AzureDevOpsService call in dataverseSolutionService.getWorkItem(),
 * then flip this to true.
 */
export const DEVOPS_PANEL_ENABLED = false

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
