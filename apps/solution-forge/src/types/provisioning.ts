import type { EnvKey } from './comparison'

/**
 * Types for the Self-Provisioning Wizard — the guided first-run setup that
 * creates the runtime-config records (`pro_workbenchsettings` + one
 * `pro_environmentconfig` per environment) the app reads at startup
 * (`config.ts → applyRuntimeConfig`). The wizard creates DATA only; the tables
 * themselves come from the managed solution / `installer/provision-model.ps1`.
 */

/** Whether the runtime-config records already exist in the environment. */
export interface ProvisioningState {
  /** At least one `pro_workbenchsettings` record exists. */
  hasSettings: boolean
  /** At least one `pro_environmentconfig` record exists. */
  hasEnvironments: boolean
}

/**
 * An organization the connector (SP) can reach — the raw `GetOrganizations`
 * shape (the connector only exposes URL + friendly name, no environment id).
 */
export interface ReachableOrg {
  /** Dataverse org URL, no trailing slash. */
  url: string
  /** Friendly name reported by the connector. */
  name: string
}

/** One environment row being configured in the wizard. */
export interface WizardEnvRow {
  /** Stable key used across the app (dev/uat/prod). */
  key: EnvKey
  /** Display label, e.g. "UAT". */
  label: string
  /** Dataverse org URL (no trailing slash). */
  url: string
  /** Power Platform environment id (maker/portal deep links); may be empty. */
  environmentId: string
  /** Dataverse organization id; optional (best-effort, may be absent). */
  organizationId?: string
  /** True for the environment hosting this app. Exactly one row is current. */
  isCurrent: boolean
  /** Sort order (`pro_order_int`). */
  order: number
}

/** The workbench-settings half of the wizard payload. */
export interface WizardSettings {
  /** `pro_name` — a display name for the settings record. */
  name: string
  /** `pro_publisher_str` — publisher unique name (resolved to an id at startup). */
  publisher: string
  /** `pro_publisherid` — publisher guid. */
  publisherId: string
  /** `pro_mastersolutionuniquename` (optional). */
  masterSolutionUniqueName: string
  /** `pro_deploymentsolutionuniquename` (optional). */
  deploymentSolutionUniqueName: string
  /** `pro_deploymentmanagerrole` — security role gating Merge/Compare. */
  deploymentManagerRole: string
  /** `pro_adoorgurl` (optional). */
  adoOrgUrl: string
  /** `pro_adoproject` (optional). */
  adoProject: string
  /** Flow-definition source (Flow Comparer) — all optional / newer columns. */
  flowDefinition: {
    table: string
    statusCol: string
    nameCol: string
    uniqueCol: string
    areaCol: string
  }
}

/** Complete wizard payload handed to `saveProvisioning()`. */
export interface ProvisioningInput {
  settings: WizardSettings
  environments: WizardEnvRow[]
}

/** Result of {@link WizardSettings}/{@link WizardEnvRow} validation, per step. */
export interface ProvisioningValidation {
  environments: string[]
  publisher: string[]
  role: string[]
  /** True when every required step is valid. */
  ok: boolean
}
