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

/**
 * Environment helpers for the Operate features (Trace Explorer / Job Monitor
 * / Role Analyzer), which can target ANY configured environment — not just
 * the uat/prod deploy targets. All read via the Dataverse connector's
 * per-organization ops, so a chosen env's org URL is all they need. Native
 * WRITES (trace-level switch, job cancel/retry) always hit the host env, so
 * the UI gates them with {@link isCurrentEnvKey}.
 *
 * Everything resolves ENVIRONMENTS at call time (it is a live binding
 * hydrated from `pro_environmentconfig` at startup).
 */

/** The env flagged `isCurrent` (host), falling back to the first entry. */
export function currentEnv(): EnvironmentDef | undefined {
  return ENVIRONMENTS.find((e) => e.isCurrent) ?? ENVIRONMENTS[0]
}

/** Key of the host environment — the Operate default selection. */
export function currentEnvKey(): string {
  return currentEnv()?.key ?? 'dev'
}

/** Resolve an env def by key, falling back to the host env. */
export function envByKey(envKey: string): EnvironmentDef | undefined {
  return ENVIRONMENTS.find((e) => e.key === envKey) ?? currentEnv()
}

/** Org URL (no trailing slash) for a configured env key. */
export function orgUrlForEnvKey(envKey: string): string {
  return (envByKey(envKey)?.url ?? '').replace(/\/+$/, '')
}

/** Dataverse environment id for a configured env key (maker/portal links). */
export function environmentIdForEnvKey(envKey: string): string {
  return envByKey(envKey)?.environmentId ?? FALLBACK_ENVIRONMENT_ID
}

/** Whether the given key is the host environment (where native writes land). */
export function isCurrentEnvKey(envKey: string): boolean {
  return envByKey(envKey)?.isCurrent === true
}

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

/** Logical name of the Azure DevOps connection reference the app binds to. */
export const DEVOPS_CONNECTION_REFERENCE = 'pro_CR_SAC_DevOps'

/**
 * Azure DevOps integration is OPTIONAL and OFF by default. Three independent
 * signals must all be true for it to surface (see {@link isDevOpsAvailable}):
 *   1. DEVOPS_ENABLED — explicit opt-in (`pro_devopsenabled`), so the feature
 *      never turns on by accident. Replaces the old build-time
 *      DEVOPS_PANEL_ENABLED constant.
 *   2. DEVOPS_CONNECTION_BOUND — the `pro_CR_SAC_DevOps` connection reference is
 *      actually bound to a connection (hydrated by devOpsService.refreshAvailability
 *      at startup). A customer without DevOps ships it unbound → stays off.
 *   3. a configured org URL + project (ADO_ACCOUNT / ADO_PROJECT_NAME).
 * All are `let` (live bindings) hydrated at startup; the UI reads
 * {@link isDevOpsAvailable}.
 */
let DEVOPS_ENABLED = false
let DEVOPS_CONNECTION_BOUND = false
let DEVOPS_SYNC_VIA: 'flow' | 'connector' = 'flow'

/** Called by devOpsService.refreshAvailability once the CR binding is known. */
export function setDevOpsConnectionBound(bound: boolean): void {
  DEVOPS_CONNECTION_BOUND = bound
}

/** Which path syncs work-item status back onto records: the cloud flow
 *  (default, Schulz) or the direct connector (product bundle). */
export function devOpsSyncVia(): 'flow' | 'connector' {
  return DEVOPS_SYNC_VIA
}

/** Whether an ADO org URL + project are configured (needed for connector calls). */
export function isDevOpsConfigured(): boolean {
  return ADO_ACCOUNT !== '' && ADO_PROJECT_NAME !== ''
}

/** Single gate for every DevOps affordance: enabled AND connection bound AND
 *  org/project configured. False keeps the feature entirely dark. */
export function isDevOpsAvailable(): boolean {
  return DEVOPS_ENABLED && DEVOPS_CONNECTION_BOUND && isDevOpsConfigured()
}


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
  /** Explicit opt-in for the Azure DevOps integration (`pro_devopsenabled`). */
  devOpsEnabled?: boolean
  /** Work-item status sync path: 'flow' (default, Schulz) or 'connector'. */
  devOpsSyncVia?: 'flow' | 'connector'
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
  if (cfg.devOpsEnabled !== undefined) DEVOPS_ENABLED = cfg.devOpsEnabled
  if (cfg.devOpsSyncVia) DEVOPS_SYNC_VIA = cfg.devOpsSyncVia
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

/**
 * Power Automate portal deep link to a flow's details page. `flowIdUnique` is
 * the import-stable `workflow.workflowidunique` (same id used in {@link
 * flowRunUrl}).
 */
export function flowDetailsUrl(
  environmentId: string | null,
  flowIdUnique: string,
): string {
  const envId = environmentId || FALLBACK_ENVIRONMENT_ID
  return `https://make.powerautomate.com/environments/${envId}/flows/${flowIdUnique}/details`
}

/**
 * Power Automate portal deep link to one flow run. `flowIdUnique` is the
 * import-stable `workflow.workflowidunique`; `runName` is the flow-run id
 * (`flowrun.name`, e.g. "08584690…").
 */
export function flowRunUrl(
  environmentId: string | null,
  flowIdUnique: string,
  runName: string,
): string {
  const envId = environmentId || FALLBACK_ENVIRONMENT_ID
  return `https://make.powerautomate.com/environments/${envId}/flows/${flowIdUnique}/runs/${runName}`
}

/**
 * Watchdog (heartbeat) tables used by the Async Job / Flow Monitor. The
 * pattern: integration flows write one heartbeat row per run; a definition
 * row states how often a beat is expected (+ grace). The tables are
 * customer-specific — adjust the logical names here (or leave them and the
 * Watchdog board shows its "not installed" hint when the query fails).
 */
export const WATCHDOG_TABLES = {
  /** FetchXML entity name of the definition table. */
  definitionEntity: 'cust_heartbeatdefinition',
  /** OData entity-set name of the definition table. */
  definitionEntitySet: 'cust_heartbeatdefinitions',
  definitionIdAttr: 'cust_heartbeatdefinitionid',
  definitionNameAttr: 'cust_name',
  intervalAttr: 'cust_expectedintervalminutes',
  graceAttr: 'cust_graceminutes',
  activeAttr: 'cust_isactive',
  /** FetchXML entity name of the heartbeat table. */
  beatEntity: 'cust_heartbeat',
  /** OData entity-set name of the heartbeat table. */
  beatEntitySet: 'cust_heartbeats',
  /** Lookup attribute on the beat table pointing at its definition. */
  beatDefinitionAttr: 'cust_heartbeatdefinition',
  beatTimestampAttr: 'cust_timestamp',
  beatStatusAttr: 'cust_status',
  beatMessageAttr: 'cust_message',
} as const

/** Azure DevOps work item link, or null when the org isn't configured yet. */
export function devOpsWorkItemUrl(devOpsId: string | null): string | null {
  if (!devOpsId || !ADO_ORG_URL || !ADO_PROJECT) return null
  if (!/^\d+$/.test(devOpsId)) return null
  return `${ADO_ORG_URL.replace(/\/$/, '')}/${ADO_PROJECT}/_workitems/edit/${devOpsId}`
}
