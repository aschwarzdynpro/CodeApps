import { ENVIRONMENTS, isCurrentEnvKey } from '../config'

interface Props {
  /** Selected environment key (from the configured ENVIRONMENTS). */
  envKey: string
  onChange: (envKey: string) => void
  /**
   * When true, a note explains that native writes (trace-level / job
   * cancel-retry) only work against the host environment. Set on the two
   * features that write; omit for the read-only Role Analyzer.
   */
  writeHint?: boolean
}

/**
 * Target-environment selector for the Operate features. Lists every
 * configured environment (dev/uat/prod or whatever the installer wrote to
 * `pro_environmentconfig`) and highlights the host one. All reads go
 * cross-env through the connector; the picker is the single control that
 * decides which environment a feature looks at.
 *
 * ENVIRONMENTS is read at render time (it is a live binding hydrated from
 * Dataverse at startup).
 */
export function OperateEnvPicker({ envKey, onChange, writeHint }: Props) {
  const selectedIsHost = isCurrentEnvKey(envKey)
  return (
    <div className="operate-env card">
      <span className="operate-env-label">Target environment</span>
      <div className="chips" role="group" aria-label="Target environment">
        {ENVIRONMENTS.map((env) => (
          <button
            key={env.key}
            className={`chip ${envKey === env.key ? 'chip--active' : ''}`}
            title={env.url}
            onClick={() => onChange(env.key)}
          >
            {env.label}
            {env.isCurrent ? ' · host' : ''}
          </button>
        ))}
      </div>
      {writeHint && !selectedIsHost && (
        <span className="operate-env-note" title="Native data-source writes always target the environment hosting this app.">
          ⚠ read-only here — changes apply to the host environment only
        </span>
      )}
    </div>
  )
}
