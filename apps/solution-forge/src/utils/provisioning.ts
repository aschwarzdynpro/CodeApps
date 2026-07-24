import type { EnvKey } from '../types/comparison'
import type {
  ProvisioningInput,
  ProvisioningValidation,
  ReachableOrg,
  WizardEnvRow,
  WizardSettings,
} from '../types/provisioning'

/**
 * Pure helpers for the Self-Provisioning Wizard: suggest environment rows from
 * the reachable organizations, validate the wizard input per step, and build
 * the Dataverse record payloads (`pro_workbenchsettings` + `pro_environmentconfig`).
 *
 * Kept side-effect-free and Dataverse-agnostic so they are unit-testable
 * (Vitest) without a Power Platform host — the service layer feeds their output
 * to the generated create/update services.
 */

/** The three environment keys the app's config model supports, in order. */
export const ENV_KEYS: EnvKey[] = ['dev', 'uat', 'prod']

const DEFAULT_LABELS: Record<EnvKey, string> = {
  dev: 'DEV',
  uat: 'UAT',
  prod: 'PROD',
}

/** Strip trailing slashes and surrounding whitespace from an org URL. */
export function normalizeUrl(url: string): string {
  return (url ?? '').trim().replace(/\/+$/, '')
}

/** Whether a string looks like an absolute http(s) URL. */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url.trim())
}

/**
 * Guess which environment key an org URL belongs to from its host segments.
 * Order matters: check uat/test/qa before dev/int so "…-uat-…" doesn't match
 * a generic "dev" rule, and prod last as the catch-all production marker.
 */
export function guessEnvKey(url: string): EnvKey | null {
  const u = url.toLowerCase()
  if (/\b(uat|test|qa|staging|sandbox)\b|-uat-|uat\./.test(u)) return 'uat'
  if (/\bprod(uction)?\b|-prod|prod\./.test(u)) return 'prod'
  if (/\b(dev|int|develop)\b|-int-|-dev-|int\.|dev\./.test(u)) return 'dev'
  return null
}

/** Default, empty settings — the wizard hydrates publisher/role over these. */
export function emptySettings(): WizardSettings {
  return {
    name: 'Workbench Settings',
    publisher: '',
    publisherId: '',
    masterSolutionUniqueName: '',
    deploymentSolutionUniqueName: '',
    deploymentManagerRole: '',
    adoOrgUrl: '',
    adoProject: '',
    flowDefinition: {
      table: '',
      statusCol: '',
      nameCol: '',
      uniqueCol: '',
      areaCol: '',
    },
  }
}

/**
 * Suggest environment rows from the organizations the connector can reach.
 *
 * The host org (matched by URL, else the first reachable org) becomes the
 * current `dev` row with its environment id pre-filled from the host context.
 * Remaining orgs are slotted into `uat` / `prod` by {@link guessEnvKey}; only
 * one row per key is produced (the app's config model is keyed dev/uat/prod).
 * The environment id is left empty for non-host rows — the connector doesn't
 * expose it, so the user fills it in (optional) later.
 */
export function suggestEnvRows(
  orgs: ReachableOrg[],
  hostUrl: string,
  hostEnvId: string,
): WizardEnvRow[] {
  const normalizedHost = normalizeUrl(hostUrl)
  const cleaned = orgs
    .map((o) => ({ url: normalizeUrl(o.url), name: o.name?.trim() ?? '' }))
    .filter((o) => o.url)

  // Prefer an exact host-URL match; when the host URL is unknown, fall back to
  // the org that looks like a dev/int environment, then the first reachable one.
  const hostOrg =
    (normalizedHost &&
      cleaned.find(
        (o) => o.url.toLowerCase() === normalizedHost.toLowerCase(),
      )) ||
    (normalizedHost ? { url: normalizedHost, name: '' } : undefined) ||
    cleaned.find((o) => guessEnvKey(o.url) === 'dev') ||
    cleaned[0]

  const rows: WizardEnvRow[] = []
  const usedKeys = new Set<EnvKey>()
  const usedUrls = new Set<string>()

  if (hostOrg) {
    rows.push({
      key: 'dev',
      label: hostOrg.name || DEFAULT_LABELS.dev,
      url: hostOrg.url,
      environmentId: hostEnvId ?? '',
      isCurrent: true,
      order: 0,
    })
    usedKeys.add('dev')
    usedUrls.add(hostOrg.url.toLowerCase())
  }

  for (const org of cleaned) {
    if (usedUrls.has(org.url.toLowerCase())) continue
    const guessed = guessEnvKey(org.url)
    const key = guessed && !usedKeys.has(guessed) ? guessed : null
    if (!key) continue
    rows.push({
      key,
      label: org.name || DEFAULT_LABELS[key],
      url: org.url,
      environmentId: '',
      isCurrent: false,
      order: rows.length,
    })
    usedKeys.add(key)
    usedUrls.add(org.url.toLowerCase())
  }

  return rows
}

/** Validate the wizard input, grouped by the step that owns each rule. */
export function validateProvisioning(
  input: ProvisioningInput,
): ProvisioningValidation {
  const environments: string[] = []
  const publisher: string[] = []
  const role: string[] = []

  const envs = input.environments
  if (envs.length === 0) {
    environments.push('Configure at least one environment.')
  }
  const currentCount = envs.filter((e) => e.isCurrent).length
  if (envs.length > 0 && currentCount !== 1) {
    environments.push(
      currentCount === 0
        ? 'Mark one environment as the current (host) one.'
        : 'Only one environment may be marked as current.',
    )
  }
  const seenKeys = new Set<string>()
  const seenUrls = new Set<string>()
  for (const e of envs) {
    if (!isHttpUrl(e.url)) {
      environments.push(`Environment "${e.label || e.key}" needs a valid URL.`)
    }
    const urlKey = normalizeUrl(e.url).toLowerCase()
    if (urlKey && seenUrls.has(urlKey)) {
      environments.push(`Two environments point at ${e.url}.`)
    }
    seenUrls.add(urlKey)
    if (seenKeys.has(e.key)) {
      environments.push(`Environment key "${e.key}" is used more than once.`)
    }
    seenKeys.add(e.key)
  }

  if (!input.settings.publisherId.trim() || !input.settings.publisher.trim()) {
    publisher.push('Select a publisher for new working solutions.')
  }

  if (!input.settings.deploymentManagerRole.trim()) {
    role.push('Enter the deployment-manager security role name.')
  }

  return {
    environments,
    publisher,
    role,
    ok:
      environments.length === 0 &&
      publisher.length === 0 &&
      role.length === 0,
  }
}

/** Add a field to the payload only when it carries a non-empty value. */
function put(
  target: Record<string, unknown>,
  key: string,
  value: string | undefined,
): void {
  const v = (value ?? '').trim()
  if (v) target[key] = v
}

/**
 * Core `pro_workbenchsettings` payload — the columns present on every
 * provisioned model. Written in the first (mandatory) create.
 */
export function buildWorkbenchSettingsCore(
  settings: WizardSettings,
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    pro_name: settings.name.trim() || 'Workbench Settings',
  }
  put(record, 'pro_publisher_str', settings.publisher)
  put(record, 'pro_publisherid', settings.publisherId)
  put(record, 'pro_mastersolutionuniquename', settings.masterSolutionUniqueName)
  put(
    record,
    'pro_deploymentsolutionuniquename',
    settings.deploymentSolutionUniqueName,
  )
  put(record, 'pro_deploymentmanagerrole', settings.deploymentManagerRole)
  put(record, 'pro_adoorgurl', settings.adoOrgUrl)
  put(record, 'pro_adoproject', settings.adoProject)
  return record
}

/**
 * Optional / newer `pro_workbenchsettings` columns (Flow-Comparer definition
 * source). Applied as a best-effort second update so a target whose schema
 * predates these columns still provisions — mirrors the split try/catch reads
 * in `getRuntimeConfig`. Returns an empty object when nothing is set.
 */
export function buildWorkbenchSettingsOptional(
  settings: WizardSettings,
): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  const f = settings.flowDefinition
  put(record, 'pro_flowdefinitiontable', f.table)
  put(record, 'pro_flowdefinitionstatus', f.statusCol)
  put(record, 'pro_flowdefinitionname', f.nameCol)
  put(record, 'pro_flowdefinitionunique', f.uniqueCol)
  put(record, 'pro_flowdefinitionarea', f.areaCol)
  return record
}

/** One `pro_environmentconfig` create payload per wizard environment row. */
export function buildEnvironmentConfigRecords(
  rows: WizardEnvRow[],
): Record<string, unknown>[] {
  return rows.map((row, index) => {
    const record: Record<string, unknown> = {
      pro_name: row.label.trim() || row.key,
      pro_key: row.key,
      pro_url: normalizeUrl(row.url),
      pro_iscurrent: !!row.isCurrent,
      pro_order_int: Number.isFinite(row.order) ? row.order : index,
    }
    put(record, 'pro_environmentid', row.environmentId)
    put(record, 'pro_organizationid', row.organizationId)
    return record
  })
}
