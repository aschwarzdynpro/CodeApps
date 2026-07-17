import type { EnvironmentDef } from '../types/comparison'

/**
 * Reference link collection — pure builders that turn what the app already
 * knows about an environment (its Dataverse org `url` and Power Platform
 * `environmentId`) into ready-to-open admin / maker / system links. No network,
 * no service call.
 *
 * The per-environment links are exposed as a **matrix**: {@link buildEnvLinkRows}
 * returns one row per link kind, each carrying the URL for every environment
 * (aligned to the input array) so the workspace can render environments as
 * columns. Kept pure so the URL shapes are unit-testable.
 */

/** One external link in the reference collection (used for the global list). */
export interface LinkItem {
  label: string
  url: string
  /** Short one-line description shown under the label. */
  hint?: string
}

/**
 * One row of the per-environment link matrix. `urls` is aligned to the
 * environments passed to {@link buildEnvLinkRows}; a null entry means the link
 * can't be built for that environment (missing url / id) and renders empty.
 */
export interface EnvLinkRow {
  group: string
  label: string
  hint?: string
  urls: (string | null)[]
}

const PPAC = 'https://admin.powerplatform.microsoft.com'
const MAKER = 'https://make.powerapps.com'
const FLOW = 'https://make.powerautomate.com'
/** Web API version the app targets everywhere else (see add-data-source paths). */
const WEB_API_VERSION = 'v9.2'

/** Strip trailing slashes so we can append paths safely. */
function trimUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Deep link into one environment's page in the Power Platform admin center.
 * Path shape: `/manage/environments/{orgId}/{sub}` — the admin center keys on
 * the Dataverse **organization id** (not the Power Platform environment id).
 * `hub` and `settings` are stable SPA routes; `backupandrestore` is best-effort
 * — the admin center is a single-page app and its route slugs occasionally
 * change, but an unknown slug redirects to the environment page rather than
 * hard-failing.
 */
function ppacEnv(orgId: string, sub: string): string {
  return `${PPAC}/manage/environments/${orgId}/${sub}`
}

/** Ordered group labels for the matrix — also the render order. */
export const ENV_LINK_GROUPS = [
  'System',
  'Maker / Automate',
  'Admin (Power Platform)',
] as const

/** Inputs available to a link builder for one environment. */
interface EnvLinkContext {
  /** Dataverse org URL, trailing slash trimmed. */
  url: string
  /** Power Platform environment id (maker links). */
  envId: string
  /** Dataverse organization id (Power Platform admin-center links); '' if unknown. */
  orgId: string
}

interface EnvLinkSpec {
  group: (typeof ENV_LINK_GROUPS)[number]
  label: string
  hint?: string
  /** Build the URL for one environment; null to omit that cell. */
  build: (ctx: EnvLinkContext) => string | null
}

/**
 * Canonical catalogue of per-environment links. The label/group/hint are the
 * same for every environment; only the built URL differs. Order here is the
 * render order within each group.
 */
const ENV_LINK_SPECS: EnvLinkSpec[] = [
  {
    group: 'System',
    label: 'System (Unified Interface)',
    hint: 'Open the environment app',
    build: ({ url }) => url || null,
  },
  {
    group: 'System',
    label: `OData / Web API ${WEB_API_VERSION}`,
    hint: 'Dataverse Web API root',
    build: ({ url }) => (url ? `${url}/api/data/${WEB_API_VERSION}/` : null),
  },
  {
    group: 'System',
    label: 'Diagnostics',
    hint: 'Client & connectivity diagnostics',
    build: ({ url }) => (url ? `${url}/tools/diagnostics/diag.aspx` : null),
  },
  {
    group: 'System',
    label: 'Advanced Settings (classic)',
    hint: 'Classic settings area',
    build: ({ url }) => (url ? `${url}/main.aspx?settingsonly=true` : null),
  },
  {
    group: 'System',
    label: 'Security Roles (classic)',
    hint: 'Role list',
    build: ({ url }) => (url ? `${url}/main.aspx?pagetype=entitylist&etn=role` : null),
  },
  {
    group: 'System',
    label: 'System Jobs (classic)',
    hint: 'Async operations',
    build: ({ url }) =>
      url ? `${url}/main.aspx?pagetype=entitylist&etn=asyncoperation` : null,
  },
  {
    group: 'Maker / Automate',
    label: 'Maker — Home',
    build: ({ envId }) => (envId ? `${MAKER}/environments/${envId}/home` : null),
  },
  {
    group: 'Maker / Automate',
    label: 'Maker — Solutions',
    build: ({ envId }) => (envId ? `${MAKER}/environments/${envId}/solutions` : null),
  },
  {
    group: 'Maker / Automate',
    label: 'Power Automate — Flows',
    build: ({ envId }) => (envId ? `${FLOW}/environments/${envId}/flows` : null),
  },
  // Admin-center links key on the Dataverse organization id, not the env id.
  {
    group: 'Admin (Power Platform)',
    label: 'Environment Hub',
    build: ({ orgId }) => (orgId ? ppacEnv(orgId, 'hub') : null),
  },
  {
    group: 'Admin (Power Platform)',
    label: 'Environment Settings',
    build: ({ orgId }) => (orgId ? ppacEnv(orgId, 'settings') : null),
  },
  {
    group: 'Admin (Power Platform)',
    label: 'Backup & Restore',
    hint: 'Admin-center slug is best-effort',
    build: ({ orgId }) => (orgId ? ppacEnv(orgId, 'backupandrestore') : null),
  },
]

/**
 * Build the per-environment link matrix: one row per link kind, each carrying
 * the URL for every input environment (aligned to `envs`). Pure — the Links
 * workspace renders `envs` as columns and these rows as the table body. The
 * admin-center links use each environment's `organizationId` (read from
 * `pro_environmentconfig`); environments without one simply get no admin links.
 */
export function buildEnvLinkRows(envs: EnvironmentDef[]): EnvLinkRow[] {
  return ENV_LINK_SPECS.map((spec) => ({
    group: spec.group,
    label: spec.label,
    hint: spec.hint,
    urls: envs.map((e) =>
      spec.build({
        url: trimUrl(e.url),
        envId: e.environmentId,
        orgId: e.organizationId ?? '',
      }),
    ),
  }))
}

/** Global links (not tied to a single environment). */
export function buildGlobalLinks(): LinkItem[] {
  return [
    {
      label: 'Power Platform Admin Center',
      url: `${PPAC}/`,
      hint: 'Environments, DLP, analytics',
    },
    {
      label: 'Capacity',
      url: `${PPAC}/resources/capacity`,
      hint: 'Storage & add-on capacity (best-effort slug)',
    },
    {
      label: 'Release Planner',
      url: 'https://releaseplans.microsoft.com/',
      hint: 'Upcoming feature roadmap',
    },
    {
      label: 'Service Health (Microsoft 365)',
      url: 'https://admin.microsoft.com/Adminportal/Home#/servicehealth',
      hint: 'Incidents & advisories',
    },
  ]
}
