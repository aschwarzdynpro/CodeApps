import { useEffect, useMemo, useState } from 'react'
import { solutionService } from '../services/solutionService'
import { DEPLOYMENT_MANAGER_ROLE } from '../config'
import type { PublisherInfo } from '../types/solution'
import type { EnvKey } from '../types/comparison'
import type {
  ReachableOrg,
  WizardEnvRow,
  WizardSettings,
} from '../types/provisioning'
import {
  ENV_KEYS,
  emptySettings,
  suggestEnvRows,
  validateProvisioning,
} from '../utils/provisioning'

/**
 * Self-Provisioning Wizard — the guided first-run setup. It appears (hard
 * blocking) when the app starts in a Power Platform environment that has no
 * runtime-config records yet, and creates them: one `pro_workbenchsettings`
 * record plus one `pro_environmentconfig` row per environment. The same wizard
 * reopens from the "Environment Setup" menu entry to edit an existing config
 * (the save is an idempotent upsert, so no duplicate records).
 *
 * The wizard writes DATA only. The `pro_` tables it fills come from the managed
 * solution / `installer/provision-model.ps1`; a failing preflight read points
 * the user at that step instead of leaving them stuck.
 */

type WizardMode = 'provision' | 'edit'

interface Props {
  mode: WizardMode
  /** Host environment id from the Power Apps context (auto-fills the current row). */
  hostEnvironmentId: string | null
  /** Fired after a successful save so the app can re-hydrate its config. */
  onComplete: () => void
  /** Edit mode only: dismiss without saving. */
  onClose?: () => void
}

const STEPS = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'environments', label: 'Environments' },
  { key: 'publisher', label: 'Publisher' },
  { key: 'role', label: 'Deployment role' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'review', label: 'Review & create' },
] as const
type StepKey = (typeof STEPS)[number]['key']

const ENV_KEY_LABEL: Record<EnvKey, string> = {
  dev: 'DEV / current',
  uat: 'UAT',
  prod: 'PROD',
}

function errMessage(err: unknown): string {
  const odata = (err as { error?: { message?: string } } | undefined)?.error
    ?.message
  if (odata) return odata
  return err instanceof Error ? err.message : String(err)
}

export function ProvisioningWizard({
  mode,
  hostEnvironmentId,
  onComplete,
  onClose,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [orgs, setOrgs] = useState<ReachableOrg[]>([])
  const [publishers, setPublishers] = useState<PublisherInfo[]>([])
  const [roleNames, setRoleNames] = useState<string[]>([])
  const [settings, setSettings] = useState<WizardSettings>(emptySettings)
  const [envRows, setEnvRows] = useState<WizardEnvRow[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [reachable, pubs, roles, defaultPublisher] = await Promise.all([
          solutionService.listReachableOrganizations(),
          solutionService.listPublishers(),
          solutionService.listRoleNames(),
          solutionService.getDefaultPublisher().catch(() => null),
        ])
        if (cancelled) return
        setOrgs(reachable)
        setPublishers(pubs)
        setRoleNames(roles)

        const next = emptySettings()
        next.deploymentManagerRole = DEPLOYMENT_MANAGER_ROLE
        let rows: WizardEnvRow[] = []

        // Edit mode: prefill from the config already stored in Dataverse.
        if (mode === 'edit') {
          const cfg = await solutionService.getRuntimeConfig()
          if (cancelled) return
          if (cfg.deploymentManagerRole)
            next.deploymentManagerRole = cfg.deploymentManagerRole
          next.adoOrgUrl = cfg.adoOrgUrl ?? ''
          next.adoProject = cfg.adoProject ?? ''
          if (cfg.flowDefinition)
            next.flowDefinition = { ...next.flowDefinition, ...cfg.flowDefinition }
          if (cfg.environments && cfg.environments.length > 0) {
            rows = cfg.environments.map((e, i) => ({
              key: e.key,
              label: e.label,
              url: e.url,
              environmentId: e.environmentId ?? '',
              organizationId: e.organizationId,
              isCurrent: !!e.isCurrent,
              order: i,
            }))
          }
        }

        // Resolve the default publisher (unique name / prefix / friendly name).
        const needle = (defaultPublisher ?? '').trim().toLowerCase()
        const matched =
          (needle &&
            pubs.find((p) =>
              [p.uniqueName, p.prefix, p.friendlyName].some(
                (v) => v.toLowerCase() === needle,
              ),
            )) ||
          pubs[0]
        if (matched) {
          next.publisher = matched.uniqueName
          next.publisherId = matched.id
        }

        if (rows.length === 0)
          rows = suggestEnvRows(reachable, '', hostEnvironmentId ?? '')

        setSettings(next)
        setEnvRows(rows)
      } catch (err) {
        if (!cancelled) setLoadError(errMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, hostEnvironmentId])

  const validation = useMemo(
    () => validateProvisioning({ settings, environments: envRows }),
    [settings, envRows],
  )

  const stepValid = (key: StepKey): boolean => {
    if (key === 'environments') return validation.environments.length === 0
    if (key === 'publisher') return validation.publisher.length === 0
    if (key === 'role') return validation.role.length === 0
    return true
  }

  const current = STEPS[stepIndex]
  const isLast = stepIndex === STEPS.length - 1
  const canAdvance = stepValid(current.key)

  const patchSettings = (patch: Partial<WizardSettings>) =>
    setSettings((s) => ({ ...s, ...patch }))
  const patchFlow = (patch: Partial<WizardSettings['flowDefinition']>) =>
    setSettings((s) => ({ ...s, flowDefinition: { ...s.flowDefinition, ...patch } }))

  const updateRow = (index: number, patch: Partial<WizardEnvRow>) =>
    setEnvRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    )
  const makeCurrent = (index: number) =>
    setEnvRows((rows) =>
      rows.map((r, i) => ({
        ...r,
        isCurrent: i === index,
        // Auto-fill the current row's env id from the host context when empty.
        environmentId:
          i === index && !r.environmentId
            ? (hostEnvironmentId ?? '')
            : r.environmentId,
      })),
    )
  const usedKeys = new Set(envRows.map((r) => r.key))
  const addRow = () => {
    const freeKey = ENV_KEYS.find((k) => !usedKeys.has(k)) ?? 'uat'
    setEnvRows((rows) => [
      ...rows,
      {
        key: freeKey,
        label: freeKey.toUpperCase(),
        url: '',
        environmentId: '',
        isCurrent: rows.length === 0,
        order: rows.length,
      },
    ])
  }
  const removeRow = (index: number) =>
    setEnvRows((rows) => {
      const next = rows.filter((_, i) => i !== index)
      // Keep exactly one current row.
      if (next.length > 0 && !next.some((r) => r.isCurrent)) next[0].isCurrent = true
      return next.map((r, i) => ({ ...r, order: i }))
    })

  const onPickUrl = (index: number, url: string) => {
    const match = orgs.find(
      (o) => o.url.replace(/\/+$/, '').toLowerCase() === url.replace(/\/+$/, '').toLowerCase(),
    )
    const row = envRows[index]
    const labelIsDefault =
      !row.label || row.label === row.key.toUpperCase() || row.label === row.key
    updateRow(index, {
      url,
      ...(match && labelIsDefault && match.name ? { label: match.name } : {}),
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await solutionService.saveProvisioning({ settings, environments: envRows })
      onComplete()
    } catch (err) {
      setSaveError(errMessage(err))
      setSaving(false)
    }
  }

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label="Environment setup">
      <div className="wizard-card">
        <header className="wizard-header">
          <span className="wizard-brand" aria-hidden="true">🚀</span>
          <div className="wizard-heading">
            <h2>{mode === 'edit' ? 'Environment Setup' : 'Welcome — let’s set up this environment'}</h2>
            <p className="wizard-sub">
              {mode === 'edit'
                ? 'Review and update the configuration records.'
                : 'This environment has no configuration yet. This wizard creates the records the app needs.'}
            </p>
          </div>
          {mode === 'edit' && onClose && (
            <button className="wizard-close" onClick={onClose} aria-label="Close" disabled={saving}>
              ✕
            </button>
          )}
        </header>

        <div className="wizard-body">
          <nav className="wizard-steps" aria-label="Setup steps">
            {STEPS.map((s, i) => {
              const invalid = i < stepIndex && !stepValid(s.key)
              return (
                <button
                  key={s.key}
                  className={`wizard-step ${i === stepIndex ? 'is-active' : ''} ${
                    i < stepIndex ? 'is-done' : ''
                  } ${invalid ? 'is-invalid' : ''}`}
                  onClick={() => setStepIndex(i)}
                  disabled={saving}
                >
                  <span className="wizard-step-num">{invalid ? '!' : i + 1}</span>
                  <span className="wizard-step-label">{s.label}</span>
                </button>
              )
            })}
          </nav>

          <section className="wizard-content">
            {loading ? (
              <p className="wizard-loading">Loading environment details…</p>
            ) : loadError ? (
              <div className="wizard-preflight-error">
                <h3>Could not read the configuration tables</h3>
                <p>{loadError}</p>
                <p className="muted">
                  The data model may not be installed yet. Import the managed
                  solution (or run <code>installer/provision-model.ps1</code>)
                  for this environment, then reload the app.
                </p>
              </div>
            ) : (
              renderStep(current.key)
            )}
          </section>
        </div>

        <footer className="wizard-footer">
          <div className="wizard-footer-left">
            {mode === 'edit' && onClose && (
              <button className="btn" onClick={onClose} disabled={saving}>
                Cancel
              </button>
            )}
          </div>
          <div className="wizard-footer-right">
            <button
              className="btn"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0 || saving}
            >
              Back
            </button>
            {isLast ? (
              <button
                className="btn btn--primary"
                onClick={() => void handleSave()}
                disabled={saving || loading || !!loadError || !validation.ok}
              >
                {saving ? 'Creating…' : mode === 'edit' ? 'Save configuration' : 'Create configuration'}
              </button>
            ) : (
              <button
                className="btn btn--primary"
                onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
                disabled={loading || !!loadError || !canAdvance}
              >
                Next
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )

  function renderStep(key: StepKey) {
    switch (key) {
      case 'welcome':
        return (
          <div className="wizard-panel">
            <h3>What this wizard sets up</h3>
            <ul className="wizard-list">
              <li>
                <strong>Environments</strong> — the Dataverse environments the app
                compares and operates against (one <code>pro_environmentconfig</code>
                row each).
              </li>
              <li>
                <strong>Publisher</strong> — the publisher new working solutions are
                created under.
              </li>
              <li>
                <strong>Deployment-manager role</strong> — the security role that
                unlocks Merge / Compare / write actions.
              </li>
              <li>
                <strong>Optional integrations</strong> — Azure DevOps org/project and
                the Flow-Comparer definition source. Skippable; editable later.
              </li>
            </ul>
            <p className="muted">
              Nothing is written until the final step. The wizard creates data
              records only — the tables themselves come from the installed solution.
            </p>
          </div>
        )

      case 'environments':
        return (
          <div className="wizard-panel">
            <h3>Environments</h3>
            <p className="muted">
              Pick the environments this app manages. The current (host) one is
              pre-selected with its environment id filled in; for the others the
              id is optional (used only for maker/portal deep links).
            </p>
            {orgs.length > 0 && (
              <p className="muted">
                {orgs.length} reachable organization{orgs.length === 1 ? '' : 's'} found —
                choose from the URL list or type one.
              </p>
            )}
            <datalist id="wizard-reachable-orgs">
              {orgs.map((o) => (
                <option key={o.url} value={o.url}>
                  {o.name}
                </option>
              ))}
            </datalist>

            <div className="wizard-env-rows">
              {envRows.map((row, i) => (
                <div className="wizard-env-row" key={i}>
                  <div className="wizard-env-grid">
                    <label className="wizard-field wizard-field--current">
                      <span>Current</span>
                      <input
                        type="radio"
                        name="wizard-current-env"
                        checked={row.isCurrent}
                        onChange={() => makeCurrent(i)}
                      />
                    </label>
                    <label className="wizard-field wizard-field--key">
                      <span>Key</span>
                      <select
                        value={row.key}
                        onChange={(e) => updateRow(i, { key: e.target.value as EnvKey })}
                      >
                        {ENV_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {ENV_KEY_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="wizard-field wizard-field--label">
                      <span>Label</span>
                      <input
                        type="text"
                        value={row.label}
                        onChange={(e) => updateRow(i, { label: e.target.value })}
                        placeholder="e.g. UAT"
                      />
                    </label>
                    <label className="wizard-field wizard-field--url">
                      <span>Org URL</span>
                      <input
                        type="text"
                        list="wizard-reachable-orgs"
                        value={row.url}
                        onChange={(e) => onPickUrl(i, e.target.value)}
                        placeholder="https://org.crm4.dynamics.com"
                      />
                    </label>
                    <label className="wizard-field wizard-field--envid">
                      <span>
                        Environment id {row.isCurrent ? '' : '(optional)'}
                      </span>
                      <input
                        type="text"
                        value={row.environmentId}
                        onChange={(e) => updateRow(i, { environmentId: e.target.value })}
                        placeholder={row.isCurrent ? 'auto' : 'from admin.powerplatform.com'}
                      />
                    </label>
                    <button
                      className="wizard-env-remove"
                      onClick={() => removeRow(i)}
                      title="Remove environment"
                      aria-label="Remove environment"
                      disabled={envRows.length <= 1}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              className="btn wizard-add-env"
              onClick={addRow}
              disabled={envRows.length >= ENV_KEYS.length}
            >
              + Add environment
            </button>

            {validation.environments.length > 0 && (
              <ul className="wizard-errors">
                {validation.environments.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )

      case 'publisher':
        return (
          <div className="wizard-panel">
            <h3>Publisher</h3>
            <p className="muted">
              New working solutions are created under this publisher. The
              suggested default matches the app’s data-model publisher.
            </p>
            <label className="wizard-field-block">
              <span>Publisher</span>
              <select
                value={settings.publisherId}
                onChange={(e) => {
                  const p = publishers.find((x) => x.id === e.target.value)
                  patchSettings({
                    publisherId: p?.id ?? '',
                    publisher: p?.uniqueName ?? '',
                  })
                }}
              >
                <option value="">— select a publisher —</option>
                {publishers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.friendlyName} ({p.uniqueName} · {p.prefix})
                  </option>
                ))}
              </select>
            </label>

            <details className="wizard-advanced">
              <summary>Solution names (optional, for ALM / installer)</summary>
              <label className="wizard-field-block">
                <span>Master solution unique name</span>
                <input
                  type="text"
                  value={settings.masterSolutionUniqueName}
                  onChange={(e) =>
                    patchSettings({ masterSolutionUniqueName: e.target.value })
                  }
                  placeholder="e.g. CustomerCore"
                />
              </label>
              <label className="wizard-field-block">
                <span>Deployment solution unique name</span>
                <input
                  type="text"
                  value={settings.deploymentSolutionUniqueName}
                  onChange={(e) =>
                    patchSettings({ deploymentSolutionUniqueName: e.target.value })
                  }
                  placeholder="e.g. CustomerDeployment"
                />
              </label>
            </details>

            {validation.publisher.length > 0 && (
              <ul className="wizard-errors">
                {validation.publisher.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )

      case 'role':
        return (
          <div className="wizard-panel">
            <h3>Deployment-manager role</h3>
            <p className="muted">
              Users holding this security role can run Merge, Compare and the
              write actions. Pick an existing role or type the name.
            </p>
            <label className="wizard-field-block">
              <span>Security role name</span>
              <input
                type="text"
                list="wizard-role-names"
                value={settings.deploymentManagerRole}
                onChange={(e) =>
                  patchSettings({ deploymentManagerRole: e.target.value })
                }
                placeholder="e.g. INT | Deployment Manager"
              />
              <datalist id="wizard-role-names">
                {roleNames.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            {roleNames.length === 0 && (
              <p className="muted">
                No roles could be listed — type the exact role name.
              </p>
            )}
            {validation.role.length > 0 && (
              <ul className="wizard-errors">
                {validation.role.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )

      case 'integrations':
        return (
          <div className="wizard-panel">
            <h3>Optional integrations</h3>
            <p className="muted">
              All optional — leave blank to configure later in the Workbench
              Settings record.
            </p>
            <details className="wizard-advanced" open={!!settings.adoOrgUrl}>
              <summary>Azure DevOps</summary>
              <label className="wizard-field-block">
                <span>Organization URL</span>
                <input
                  type="text"
                  value={settings.adoOrgUrl}
                  onChange={(e) => patchSettings({ adoOrgUrl: e.target.value })}
                  placeholder="https://dev.azure.com/YourOrg"
                />
              </label>
              <label className="wizard-field-block">
                <span>Project</span>
                <input
                  type="text"
                  value={settings.adoProject}
                  onChange={(e) => patchSettings({ adoProject: e.target.value })}
                  placeholder="e.g. D365UO"
                />
              </label>
            </details>

            <details className="wizard-advanced" open={!!settings.flowDefinition.table}>
              <summary>Flow-Comparer definition source</summary>
              <p className="muted">
                A table describing the wanted On/Off state of flows (used by the
                Process Comparer). Leave blank to disable that feature.
              </p>
              <div className="wizard-field-grid">
                <label className="wizard-field-block">
                  <span>Definition table</span>
                  <input
                    type="text"
                    value={settings.flowDefinition.table}
                    onChange={(e) => patchFlow({ table: e.target.value })}
                    placeholder="e.g. hso_cloudflow"
                  />
                </label>
                <label className="wizard-field-block">
                  <span>Status column</span>
                  <input
                    type="text"
                    value={settings.flowDefinition.statusCol}
                    onChange={(e) => patchFlow({ statusCol: e.target.value })}
                    placeholder="e.g. hso_flowstate"
                  />
                </label>
                <label className="wizard-field-block">
                  <span>Name column</span>
                  <input
                    type="text"
                    value={settings.flowDefinition.nameCol}
                    onChange={(e) => patchFlow({ nameCol: e.target.value })}
                    placeholder="e.g. hso_name"
                  />
                </label>
                <label className="wizard-field-block">
                  <span>Unique-id column (optional)</span>
                  <input
                    type="text"
                    value={settings.flowDefinition.uniqueCol}
                    onChange={(e) => patchFlow({ uniqueCol: e.target.value })}
                    placeholder="e.g. hso_flowuniqueid"
                  />
                </label>
                <label className="wizard-field-block">
                  <span>Area column (optional)</span>
                  <input
                    type="text"
                    value={settings.flowDefinition.areaCol}
                    onChange={(e) => patchFlow({ areaCol: e.target.value })}
                    placeholder="e.g. hso_area"
                  />
                </label>
              </div>
            </details>
          </div>
        )

      case 'review':
        return (
          <div className="wizard-panel">
            <h3>Review</h3>
            <div className="wizard-review">
              <h4>Environments</h4>
              <table className="wizard-review-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Label</th>
                    <th>URL</th>
                    <th>Current</th>
                    <th>Env id</th>
                  </tr>
                </thead>
                <tbody>
                  {envRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.key}</td>
                      <td>{r.label}</td>
                      <td className="wizard-review-url">{r.url}</td>
                      <td>{r.isCurrent ? '✓' : ''}</td>
                      <td>{r.environmentId || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4>Settings</h4>
              <dl className="wizard-review-dl">
                <dt>Publisher</dt>
                <dd>{settings.publisher || '—'}</dd>
                <dt>Deployment-manager role</dt>
                <dd>{settings.deploymentManagerRole || '—'}</dd>
                <dt>Azure DevOps</dt>
                <dd>
                  {settings.adoOrgUrl
                    ? `${settings.adoOrgUrl}${settings.adoProject ? ` · ${settings.adoProject}` : ''}`
                    : 'not configured'}
                </dd>
                <dt>Flow definition</dt>
                <dd>{settings.flowDefinition.table || 'not configured'}</dd>
              </dl>
            </div>

            {!validation.ok && (
              <ul className="wizard-errors">
                {[
                  ...validation.environments,
                  ...validation.publisher,
                  ...validation.role,
                ].map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            {saveError && <p className="wizard-save-error">Save failed: {saveError}</p>}
          </div>
        )
    }
  }
}
