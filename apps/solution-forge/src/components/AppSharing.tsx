import { Fragment, useMemo, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import type { EnvKey } from '../types/comparison'
import {
  CANVAS_KIND_LABELS,
  type AppSharingResult,
  type AppSharingRow,
  type AppSharingState,
  type CanvasAppKind,
} from '../types/sharing'
import { ENVIRONMENTS } from '../config'
import { sharingService } from '../services/sharingService'
import { SolutionSelect } from './SolutionSelect'

interface Props {
  solutions: WorkingSolution[]
}

const KIND_ORDER: CanvasAppKind[] = ['canvas', 'custompage', 'componentlibrary']

/** Target environments where "deployed but not shared" is a real gap. */
const GAP_ENVS: EnvKey[] = ['uat', 'prod']

/**
 * App-sharing inspector: for a solution's canvas apps and custom pages,
 * shows who each one is shared with in DEV / UAT / PROD. Because solution
 * import never carries user sharing, a canvas app can land in UAT/PROD and
 * reach nobody — those gaps are called out.
 */
export function AppSharing({ solutions }: Props) {
  const candidates = solutions.filter(
    (s, index) =>
      !s.solutionMissing && solutions.findIndex((o) => o.id === s.id) === index,
  )

  const [solutionId, setSolutionId] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<AppSharingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const solution = candidates.find((s) => s.id === solutionId) ?? null

  const run = async () => {
    if (!solution) return
    setRunning(true)
    setResult(null)
    setError(null)
    setExpanded(null)
    setProgress('Starting…')
    try {
      const res = await sharingService.checkAppSharing(solution.id, (msg) =>
        setProgress(msg),
      )
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  // "Deployed but shared with nobody" in UAT/PROD — the actionable gap.
  // Custom pages are excluded (they get access via the app's roles).
  const gaps = useMemo(() => {
    const list: { row: AppSharingRow; envKey: EnvKey }[] = []
    for (const row of result?.rows ?? []) {
      if (row.kind === 'custompage') continue
      for (const envKey of GAP_ENVS) {
        const state = row.byEnv[envKey]
        if (state?.present && !state.error && state.principals.length === 0)
          list.push({ row, envKey })
      }
    }
    return list
  }, [result])

  // Any present cell whose sharing lookup failed — the success banner must
  // not claim "all shared" when we couldn't actually read the sharing.
  const errorCount = useMemo(() => {
    let n = 0
    for (const row of result?.rows ?? [])
      for (const env of ENVIRONMENTS) {
        const state = row.byEnv[env.key]
        if (state?.present && state.error) n++
      }
    return n
  }, [result])

  const grouped = useMemo(() => {
    const groups = new Map<CanvasAppKind, AppSharingRow[]>()
    for (const kind of KIND_ORDER) groups.set(kind, [])
    for (const row of result?.rows ?? []) groups.get(row.kind)?.push(row)
    return [...groups.entries()].filter(([, rows]) => rows.length > 0)
  }, [result])

  const envLabel = (key: EnvKey) =>
    ENVIRONMENTS.find((e) => e.key === key)?.label ?? key.toUpperCase()

  return (
    <div>
      <div className="card compare-controls">
        <div className="compare-picker">
          <span className="form-label">Solution</span>
          <SolutionSelect
            options={candidates}
            value={solutionId}
            onChange={(id) => {
              setSolutionId(id)
              setResult(null)
              setError(null)
            }}
            placeholder="Select a solution…"
          />
        </div>
        <div className="compare-envs">
          {ENVIRONMENTS.map((env) => (
            <span
              key={env.key}
              className={`env-chip ${result?.envErrors[env.key] ? 'env-chip--error' : ''}`}
              title={`${env.url}${result?.envErrors[env.key] ? ` — ${result.envErrors[env.key]}` : ''}`}
            >
              {env.label}
            </span>
          ))}
          <button
            className="btn btn--primary"
            disabled={!solution || running}
            onClick={() => void run()}
          >
            {running ? 'Checking…' : 'Check Sharing'}
          </button>
        </div>
      </div>

      {running && (
        <div className="sharing-progress" aria-live="polite">
          <span className="sharing-progress-spinner" />
          <span className="sharing-progress-text">{progress || 'Starting…'}</span>
        </div>
      )}

      {error && <div className="state state--error">{error}</div>}
      {result &&
        Object.entries(result.envErrors).map(([key, message]) => (
          <div key={key} className="state state--error">
            {envLabel(key as EnvKey)}: {message} — that environment's cells
            show “?”.
          </div>
        ))}

      {!running && result && (
        <>
          {result.rows.length === 0 ? (
            <div className="state">
              This solution contains no canvas apps or custom pages.
            </div>
          ) : errorCount > 0 ? (
            <div className="state state--error">
              The sharing lookup failed for {errorCount} app/environment
              cell{errorCount === 1 ? '' : 's'} (shown as “lookup failed”) —
              results are incomplete. Details are in the browser console
              (filter <code>[sharing]</code>).
            </div>
          ) : gaps.length > 0 ? (
            <div className="state state--error">
              {gaps.length} canvas app{gaps.length === 1 ? '' : 's'} deployed to
              UAT/PROD but shared with no users or teams — they reach nobody
              until shared. Open the rows below for details.
            </div>
          ) : (
            <div className="state state--success">
              Every deployed canvas app in UAT/PROD is shared with at least one
              user or team.
            </div>
          )}

          {grouped.map(([kind, rows]) => (
            <section key={kind} className="card compare-group">
              <h3 className="card-title">
                {CANVAS_KIND_LABELS[kind]}{' '}
                <span className="muted">({rows.length})</span>
                {kind === 'custompage' && (
                  <span className="muted card-subtitle">
                    {' '}
                    — access via the model-driven app's security roles, not
                    direct sharing
                  </span>
                )}
              </h3>
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>App</th>
                    {ENVIRONMENTS.map((env) => (
                      <th key={env.key}>{env.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isOpen = expanded === row.name
                    return (
                      <Fragment key={row.name}>
                        <tr
                          className={`sharing-row ${isOpen ? 'sharing-row--open' : ''}`}
                          onClick={() =>
                            setExpanded((prev) =>
                              prev === row.name ? null : row.name,
                            )
                          }
                        >
                          <td className="compare-name" title={row.name}>
                            <span className="sharing-caret">
                              {isOpen ? '▾' : '▸'}
                            </span>
                            {row.displayName}
                          </td>
                          {ENVIRONMENTS.map((env) => (
                            <td key={env.key}>
                              <SharingCell
                                state={row.byEnv[env.key]}
                                kind={row.kind}
                              />
                            </td>
                          ))}
                        </tr>
                        {isOpen && (
                          <tr className="sharing-detail-row">
                            <td colSpan={ENVIRONMENTS.length + 1}>
                              <div className="sharing-detail">
                                {ENVIRONMENTS.map((env) => (
                                  <SharingDetail
                                    key={env.key}
                                    label={env.label}
                                    state={row.byEnv[env.key]}
                                    kind={row.kind}
                                  />
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}

      {!running && !result && !error && (
        <div className="state">
          Pick a solution — its canvas apps and custom pages are checked for
          who they're shared with in DEV, UAT and PROD. Solution import never
          carries sharing, so this reveals apps that are deployed but reach no
          users yet.
        </div>
      )}
    </div>
  )
}

function principalCounts(state: AppSharingState) {
  let users = 0
  let teams = 0
  for (const p of state.principals) {
    if (p.type === 'user') users++
    else if (p.type === 'team') teams++
  }
  return { users, teams }
}

function SharingCell({
  state,
  kind,
}: {
  state: AppSharingState | null
  kind: CanvasAppKind
}) {
  if (!state) return <span className="cell-unknown">?</span>
  if (!state.present) return <span className="cell-notdeployed muted">not deployed</span>
  if (state.error) return <span className="cell-missing">⚠ lookup failed</span>
  if (state.principals.length === 0) {
    if (kind === 'custompage')
      return <span className="muted">via app roles</span>
    return <span className="cell-missing">⚠ not shared</span>
  }
  const { users, teams } = principalCounts(state)
  return (
    <span className="sharing-pill">
      {users > 0 && (
        <span className="state-pill state-pill--on">👤 {users}</span>
      )}
      {teams > 0 && (
        <span className="state-pill state-pill--neutral">👥 {teams}</span>
      )}
    </span>
  )
}

function SharingDetail({
  label,
  state,
  kind,
}: {
  label: string
  state: AppSharingState | null
  kind: CanvasAppKind
}) {
  return (
    <div className="sharing-detail-col">
      <div className="sharing-detail-head">{label}</div>
      {!state ? (
        <div className="muted">not queried</div>
      ) : !state.present ? (
        <div className="muted">not deployed here</div>
      ) : state.error ? (
        <div className="cell-missing">lookup failed</div>
      ) : (
        <>
          {state.ownerName && (
            <div className="sharing-owner muted">Owner: {state.ownerName}</div>
          )}
          {state.principals.length === 0 ? (
            <div className={kind === 'custompage' ? 'muted' : 'cell-missing'}>
              {kind === 'custompage'
                ? 'No direct shares (access via app roles)'
                : 'Shared with nobody'}
            </div>
          ) : (
            <ul className="sharing-principals">
              {state.principals.map((p) => (
                <li key={`${p.type}-${p.id}`}>
                  <span className="sharing-principal-icon">
                    {p.type === 'user' ? '👤' : p.type === 'team' ? '👥' : '🏢'}
                  </span>
                  <span className="sharing-principal-name">{p.name}</span>
                  <span className="sharing-principal-access muted">{p.access}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
