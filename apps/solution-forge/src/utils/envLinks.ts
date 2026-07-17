import type { EnvironmentDef } from '../types/comparison'

/**
 * Reference link collection — pure builders that turn what the app already
 * knows about an environment (its Dataverse org `url` and Power Platform
 * `environmentId`) into ready-to-open admin / maker / system links. No network,
 * no service call: the Links workspace maps {@link buildEnvLinkGroups} over
 * `ENVIRONMENTS` and renders {@link buildGlobalLinks} once. Kept pure so the
 * URL shapes are unit-testable.
 */

/** One external link in the reference collection. */
export interface LinkItem {
  label: string
  url: string
  /** Short one-line description shown under the label. */
  hint?: string
}

/** A titled group of links (used both per-environment and globally). */
export interface LinkGroup {
  title: string
  links: LinkItem[]
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
 * `hub` and `settings` are stable SPA routes; `backupandrestore` is best-effort
 * — the admin center is a single-page app and its route slugs occasionally
 * change, but an unknown slug redirects to the environment page rather than
 * hard-failing.
 */
function ppacEnv(envId: string, sub: string): string {
  return `${PPAC}/manage/environments/environment/${envId}/${sub}`
}

/**
 * Grouped links for a single environment. Links that need the Power Platform
 * environment id are omitted when it is missing (misconfigured entry) so the
 * collection never renders a broken `/environment//hub` URL.
 */
export function buildEnvLinkGroups(env: EnvironmentDef): LinkGroup[] {
  const url = trimUrl(env.url)
  const envId = env.environmentId
  const groups: LinkGroup[] = []

  if (url) {
    // System / Dataverse — everything that hangs off the org URL.
    groups.push({
      title: 'System',
      links: [
        { label: 'System (Unified Interface)', url, hint: 'Open the environment app' },
        {
          label: `OData / Web API ${WEB_API_VERSION}`,
          url: `${url}/api/data/${WEB_API_VERSION}/`,
          hint: 'Dataverse Web API root',
        },
        {
          label: 'Diagnostics',
          url: `${url}/tools/diagnostics/diag.aspx`,
          hint: 'Client & connectivity diagnostics',
        },
        {
          label: 'Advanced Settings (classic)',
          url: `${url}/main.aspx?settingsonly=true`,
          hint: 'Classic settings area',
        },
        {
          label: 'Security Roles (classic)',
          url: `${url}/main.aspx?pagetype=entitylist&etn=role`,
          hint: 'Role list',
        },
        {
          label: 'System Jobs (classic)',
          url: `${url}/main.aspx?pagetype=entitylist&etn=asyncoperation`,
          hint: 'Async operations',
        },
      ],
    })
  }

  if (envId) {
    // Maker / Automate portals.
    groups.push({
      title: 'Maker / Automate',
      links: [
        { label: 'Maker — Home', url: `${MAKER}/environments/${envId}/home` },
        { label: 'Maker — Solutions', url: `${MAKER}/environments/${envId}/solutions` },
        { label: 'Power Automate — Flows', url: `${FLOW}/environments/${envId}/flows` },
      ],
    })
    // Power Platform admin center (per-environment).
    groups.push({
      title: 'Admin (Power Platform)',
      links: [
        { label: 'Environment Hub', url: ppacEnv(envId, 'hub') },
        { label: 'Environment Settings', url: ppacEnv(envId, 'settings') },
        {
          label: 'Backup & Restore',
          url: ppacEnv(envId, 'backupandrestore'),
          hint: 'Admin-center slug is best-effort',
        },
      ],
    })
  }

  return groups
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
