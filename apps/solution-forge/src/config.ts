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
 * Default environments for the ALM comparison (Schulz). The installer
 * overrides these per customer by writing a `VITE_ENVIRONMENTS` JSON array to
 * `.env.local` at build time (see {@link ENVIRONMENTS}); the planned further
 * upgrade is a Dataverse control table (`pro_environmentconfig`) read at
 * startup. The connector's GetOrganizations() can validate the URLs against
 * what the signed-in user can actually reach.
 */
const DEFAULT_ENVIRONMENTS: EnvironmentDef[] = [
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

/** Compare/Dependency-Check target environments. Customer-specific value comes
 *  from the installer via `VITE_ENVIRONMENTS` (a JSON array of EnvironmentDef);
 *  falls back to the Schulz defaults for local dev. */
function parseEnvironments(): EnvironmentDef[] {
  const raw = import.meta.env.VITE_ENVIRONMENTS as string | undefined
  if (!raw) return DEFAULT_ENVIRONMENTS
  try {
    const parsed = JSON.parse(raw) as EnvironmentDef[]
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch {
    console.warn('[config] VITE_ENVIRONMENTS is not valid JSON — using defaults')
  }
  return DEFAULT_ENVIRONMENTS
}
// `let`, not `const`: hydrated from the Dataverse config tables at startup via
// applyRuntimeConfig(). The build-time value (VITE / Schulz default) is the
// fallback used until that load completes. Consumers read these as ES live
// bindings, so they pick up the hydrated values on the next access.
export let ENVIRONMENTS: EnvironmentDef[] = parseEnvironments()
const DEFAULT_ADO_ORG_URL = 'https://dev.azure.com/SchulzD365'
const DEFAULT_ADO_PROJECT = 'D365UO'

export const FALLBACK_ENVIRONMENT_ID: string =
  import.meta.env.VITE_ENVIRONMENT_ID ?? DEFAULT_ENVIRONMENT_ID

let ADO_ORG_URL: string =
  import.meta.env.VITE_ADO_ORG_URL ?? DEFAULT_ADO_ORG_URL
let ADO_PROJECT: string =
  import.meta.env.VITE_ADO_PROJECT ?? DEFAULT_ADO_PROJECT
const adoAccount = (url: string): string =>
  url.replace(/\/+$/, '').split('/').pop() ?? ''

/** Organisation ("account") name for connector calls — the last path
 *  segment of the org URL, e.g. "SchulzD365". Empty when unconfigured. */
export let ADO_ACCOUNT: string = adoAccount(ADO_ORG_URL)
/** Project name for connector calls, e.g. "D365UO". */
export let ADO_PROJECT_NAME: string = ADO_PROJECT

/**
 * TEMPORARY: the Azure DevOps work item panel is disabled until the
 * service-principal access to dev.azure.com/SchulzD365 is sorted out
 * (see TODO.md "Auth auf Service Principal umstellen"). While false, the
 * panel is hidden, no work items are fetched, and the DevOps connector is
 * removed from the app so users get no connection prompt at startup.
 * Re-enable: re-add the connector data source (-cr pro_CRDevOps), restore
 * the AzureDevOpsService call in dataverseSolutionService.getWorkItem(),
 * then flip this to true.
 */
export const DEVOPS_PANEL_ENABLED = false

/** Security role required for the Merge and Compare tabs. Hydrated from the
 *  config table at startup; falls back to the build-time value. */
export let DEPLOYMENT_MANAGER_ROLE: string =
  import.meta.env.VITE_DEPLOYMENT_MANAGER_ROLE ?? 'INT | Deployment Manager'

/** Config values the app loads from Dataverse at startup (see configService). */
export interface RuntimeConfig {
  environments?: EnvironmentDef[]
  adoOrgUrl?: string
  adoProject?: string
  deploymentManagerRole?: string
}

/**
 * Overlay runtime config (read from the `pro_environmentconfig` /
 * `pro_workbenchsettings` tables) onto the build-time defaults. Each field is
 * only applied when present, so partial config keeps the fallbacks. Consumers
 * see the new values via ES live bindings on their next read.
 */
export function applyRuntimeConfig(cfg: RuntimeConfig): void {
  if (cfg.environments && cfg.environments.length > 0) ENVIRONMENTS = cfg.environments
  if (cfg.adoOrgUrl) {
    ADO_ORG_URL = cfg.adoOrgUrl
    ADO_ACCOUNT = adoAccount(ADO_ORG_URL)
  }
  if (cfg.adoProject) {
    ADO_PROJECT = cfg.adoProject
    ADO_PROJECT_NAME = cfg.adoProject
  }
  if (cfg.deploymentManagerRole) DEPLOYMENT_MANAGER_ROLE = cfg.deploymentManagerRole
}

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

/** Maker-portal deep link to the Solutions area of a specific environment —
 *  the entry point for inspecting a component's solution layers there
 *  (open the solution → select the component → Advanced → See solution
 *  layers). Used as the last-resort fallback when neither the target
 *  solution nor a known per-type route segment is available. */
export function makerEnvSolutionsUrl(environmentId: string): string {
  const envId = environmentId || FALLBACK_ENVIRONMENT_ID
  return envId
    ? `https://make.powerapps.com/environments/${envId}/solutions`
    : 'https://make.powerapps.com'
}

/**
 * Relative maker-portal path (the bit between `/solutions/{id}/` and
 * `/layers`) for a component's solution-layers view, by component type.
 * Verified from real maker-portal URLs. Returns undefined for types we can't
 * build a route for (entity-nested forms/views/columns/business rules, which
 * need the owning table's id; or unmapped types) — the caller then falls back
 * to the solution's objects list.
 *
 * Two types need a sub-type discriminator:
 *  - Canvas App (300): `canvasAppType` 2 = custom page (`objects/pages`),
 *    otherwise an app (`objects/apps`).
 *  - Process (29): `workflowCategory` 5 = cloud flow (`objects/cloudflows`);
 *    0/3/4 = workflow/action/BPF (`objects/processes`); 2 (business rule) is
 *    entity-nested → undefined.
 */
export function makerLayerPath(
  typeCode: number,
  objectId: string,
  opts: { canvasAppType?: number; workflowCategory?: number } = {},
): string | undefined {
  switch (typeCode) {
    case 1: // Entity / table
      return `entities/${objectId}`
    case 61: // Web resource (the maker groups them under "web resources/code")
      return `web%20resources/code/${objectId}`
    case 91: // Plugin assembly
      return `objects/plugin%20assemblies/${objectId}`
    case 92: // SDK message processing step
      return `objects/plugin%20steps/${objectId}`
    case 10021: // Custom API
      return `objects/customapis/${objectId}`
    case 10022: // Custom API request parameter
      return `objects/customapirequestparameters/${objectId}`
    case 10023: // Custom API response property
      return `objects/customapiresponseproperties/${objectId}`
    case 300: // Canvas app vs. custom page
      if (opts.canvasAppType === undefined) return undefined
      return opts.canvasAppType === 2
        ? `objects/pages/${objectId}`
        : `objects/apps/${objectId}`
    case 29: // Process family — split by workflow category
      if (opts.workflowCategory === 5) return `objects/cloudflows/${objectId}`
      if ([0, 3, 4].includes(opts.workflowCategory ?? -1))
        return `objects/processes/${objectId}`
      return undefined // business rule (2) etc. are entity-nested
    default:
      return undefined
  }
}

/**
 * Maker-portal deep link straight into a component's **solution layers** view
 * in a specific environment, e.g.
 * `…/environments/{env}/solutions/{solutionId}/entities/{objectId}/layers`.
 * `layerPath` comes from {@link makerLayerPath}; only emit this when both the
 * path and the target solution id are known.
 */
export function makerComponentLayersUrl(
  environmentId: string,
  solutionId: string,
  layerPath: string,
): string {
  return `https://make.powerapps.com/environments/${environmentId}/solutions/${solutionId}/${layerPath}/layers`
}

/** Maker-portal deep link to a canvas app's details page (where the Share
 *  command lives) in a specific environment. `appName` is the canvas app's
 *  import-stable logical name (`canvasapp.name`) — the id the maker portal
 *  uses in app URLs, not the per-environment `canvasappid`. */
export function makerCanvasAppUrl(
  environmentId: string,
  appName: string,
): string {
  if (!environmentId || !appName) return 'https://make.powerapps.com'
  return `https://make.powerapps.com/environments/${environmentId}/apps/${appName}/details`
}

/** Azure DevOps work item link, or null when the org isn't configured yet. */
export function devOpsWorkItemUrl(devOpsId: string | null): string | null {
  if (!devOpsId || !ADO_ORG_URL || !ADO_PROJECT) return null
  if (!/^\d+$/.test(devOpsId)) return null
  return `${ADO_ORG_URL.replace(/\/$/, '')}/${ADO_PROJECT}/_workitems/edit/${devOpsId}`
}
