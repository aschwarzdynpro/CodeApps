/**
 * Security concept document: renders a frozen baseline as readable Markdown,
 * optionally against an earlier baseline so the "what changed since the last
 * review" chapter appears.
 *
 * Read-only and derived — nothing is written here. Publishing a document as
 * its own record would duplicate what the baseline already stores; the
 * document is reproducible from the snapshot at any time (the builder is pure
 * and takes `generatedAt`).
 */
import { useMemo, useState } from 'react'
import { envByKey } from '../config'
import { securityBaselineService } from '../services/securityBaselineService'
import type { SecuritySnapshotSummary } from '../types/roleComparer'
import { parseBaseline } from '../utils/securityBaseline'
import { buildSecurityConcept, type ConceptDoc } from '../utils/securityConcept'
import { PRIVILEGE_ACTIONS } from '../types/roles'

/** Depth short code → the badge class the Role Analyzer already uses. */
const DEPTH_CLASS: Record<string, string> = {
  U: 'roles-depth--user',
  BU: 'roles-depth--bu',
  P: 'roles-depth--parent',
  O: 'roles-depth--org',
}

/** A changed-privilege line, coloured by its leading +/−/~ marker. */
function ChangeLine({ line }: { line: string }) {
  const kind = line.startsWith('+')
    ? 'add'
    : line.startsWith('−')
      ? 'remove'
      : 'move'
  return <li className={`scdoc-change scdoc-change--${kind}`}>{line}</li>
}

/** The document itself, rendered as a document rather than as source. */
function ConceptDocView({ doc }: { doc: ConceptDoc }) {
  return (
    <article className="scdoc-doc">
      <h2 className="scdoc-title">{doc.title}</h2>
      <p className="scdoc-subtitle muted">
        Frozen {doc.frozenOn ? new Date(doc.frozenOn).toLocaleString() : 'unknown'}
        {doc.frozenBy ? ` by ${doc.frozenBy}` : ''} · Scope: {doc.scope} ·
        Generated {doc.generatedAt.toLocaleString()}
      </p>

      {doc.disclaimers.map((line) => (
        <p key={line} className="scdoc-note">
          {line}
        </p>
      ))}

      <h3 className="scdoc-h">Environments</h3>
      <table className="ops-table scdoc-table">
        <thead>
          <tr>
            <th>Environment</th>
            <th>Roles</th>
            <th>Custom</th>
            <th>Managed</th>
          </tr>
        </thead>
        <tbody>
          {doc.environments.map((env) => (
            <tr key={env.label}>
              <td>
                {env.label}
                {env.isReference && (
                  <span className="scdoc-ref"> reference</span>
                )}
              </td>
              <td>{env.roles}</td>
              <td>{env.custom}</td>
              <td>{env.managed}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {doc.changes && (
        <>
          <h3 className="scdoc-h">
            Changes since “{doc.changes.previousName}”
            {doc.changes.previousOn
              ? ` (${new Date(doc.changes.previousOn).toLocaleDateString()})`
              : ''}
          </h3>
          {!doc.changes.added.length &&
            !doc.changes.removed.length &&
            !doc.changes.changed.length && (
              <p className="muted">No role or privilege changed.</p>
            )}
          {doc.changes.added.length > 0 && (
            <>
              <h4 className="scdoc-h4">Roles added</h4>
              <ul className="scdoc-list">
                {doc.changes.added.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          )}
          {doc.changes.removed.length > 0 && (
            <>
              <h4 className="scdoc-h4">Roles removed</h4>
              <ul className="scdoc-list">
                {doc.changes.removed.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          )}
          {doc.changes.changed.length > 0 && (
            <>
              <h4 className="scdoc-h4">Privileges changed</h4>
              {doc.changes.changed.map((role) => (
                <div key={role.name} className="scdoc-changed-role">
                  <strong>{role.name}</strong>
                  {role.byEnv.map((env) => (
                    <div key={env.label}>
                      <span className="muted">{env.label}</span>
                      <ul className="scdoc-list">
                        {env.lines.map((line) => (
                          <ChangeLine key={line} line={line} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </>
      )}

      <h3 className="scdoc-h">Roles</h3>
      {doc.roles.map((role) => (
        <section key={role.name} className="scdoc-role">
          <h4 className="scdoc-role-name">{role.name}</h4>
          <p className="muted scdoc-role-meta">
            {role.managed ? 'Managed' : 'Custom (unmanaged)'} · present in{' '}
            {role.presentIn.join(', ') || '—'}
          </p>
          {role.grants.length === 0 ? (
            <p className="muted">No table privileges in the reference environment.</p>
          ) : (
            <div className="scdoc-grants-scroll">
              <table className="ops-table scdoc-table">
                <thead>
                  <tr>
                    <th>Table</th>
                    {PRIVILEGE_ACTIONS.map((action) => (
                      <th key={action}>{action}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {role.grants.map((row) => (
                    <tr key={row.entity}>
                      <td>
                        <code>{row.entity}</code>
                      </td>
                      {row.depths.map((depth, i) => (
                        <td key={PRIVILEGE_ACTIONS[i]}>
                          {depth ? (
                            <span
                              className={`roles-depth ${DEPTH_CLASS[depth] ?? ''}`}
                            >
                              {depth}
                            </span>
                          ) : (
                            <span className="muted">·</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {role.misc.length > 0 && (
            <p className="scdoc-misc">
              Other privileges:{' '}
              {role.misc.map((m) => (
                <code key={m}>{m}</code>
              ))}
            </p>
          )}
          {role.deviations.length > 0 && (
            <p className="scdoc-deviation">
              ⚠ Differs from the reference:{' '}
              {role.deviations
                .map((d) => `${d.label} (${d.count})`)
                .join(', ')}
            </p>
          )}
        </section>
      ))}

      <p className="muted scdoc-legend">Depth: {doc.legend}</p>

      {doc.org.map((chapter) => (
        <section key={chapter.envLabel}>
          <h3 className="scdoc-h">Business units &amp; teams — {chapter.envLabel}</h3>
          <ul className="scdoc-bu-tree">
            {chapter.bus.map((bu) => (
              <li
                key={bu.name}
                style={{ paddingLeft: `${bu.depth * 18}px` }}
              >
                <strong>{bu.name}</strong>{' '}
                <span className="muted">
                  ({bu.users} user{bu.users === 1 ? '' : 's'})
                </span>
              </li>
            ))}
          </ul>
          {chapter.teams.length === 0 ? (
            <p className="muted">No teams.</p>
          ) : (
            <div className="scdoc-grants-scroll">
              <table className="ops-table scdoc-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Business unit</th>
                    <th>Type</th>
                    <th>Roles granted</th>
                    <th>Members</th>
                  </tr>
                </thead>
                <tbody>
                  {chapter.teams.map((team) => (
                    <tr key={`${team.bu}/${team.name}`}>
                      <td>{team.name}</td>
                      <td>{team.bu || <span className="muted">—</span>}</td>
                      <td className="nowrap">{team.type}</td>
                      <td>
                        {team.roles.join(', ') || <span className="muted">—</span>}
                      </td>
                      <td>{team.members}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {doc.fieldSecurity.map((chapter) => (
        <section key={chapter.envLabel}>
          <h3 className="scdoc-h">Field security — {chapter.envLabel}</h3>
          {chapter.profiles.length === 0 ? (
            <p className="muted">No field-security profiles.</p>
          ) : (
            <>
              <table className="ops-table scdoc-table">
                <thead>
                  <tr>
                    <th>Profile</th>
                    <th>Managed</th>
                    <th>Secured columns</th>
                    <th>Users</th>
                    <th>Teams</th>
                  </tr>
                </thead>
                <tbody>
                  {chapter.profiles.map((profile) => (
                    <tr key={profile.name}>
                      <td>
                        {profile.name}
                        {profile.unassigned && (
                          <span
                            className="scdoc-warn"
                            title="Assigned to no user and no team — it secures columns for nobody"
                          >
                            {' '}
                            ⚠
                          </span>
                        )}
                      </td>
                      <td>{profile.managed ? 'yes' : 'no'}</td>
                      <td>{profile.columns}</td>
                      <td>{profile.users}</td>
                      <td>{profile.teams}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="scdoc-misc">
                Secured columns ({chapter.securedColumns.length}):{' '}
                {chapter.securedColumns.map((c) => (
                  <code key={c}>{c}</code>
                ))}
              </p>
            </>
          )}
        </section>
      ))}

      {doc.audit.map((chapter) => (
        <section key={chapter.envLabel}>
          <h3 className="scdoc-h">Audit configuration — {chapter.envLabel}</h3>
          <p>
            Organisation auditing: <strong>{chapter.enabled ? 'on' : 'off'}</strong>{' '}
            · Retention: {chapter.retention}
          </p>
          {!chapter.enabled && (
            <p className="scdoc-deviation">
              ⚠ Auditing is off org-wide — the tables below are configured but
              nothing is written.
            </p>
          )}
          <p className="scdoc-misc">
            Audited tables: {chapter.auditedTables.length} of{' '}
            {chapter.totalTables}
          </p>
          {chapter.auditedTables.length > 0 && (
            <p className="scdoc-misc">
              {chapter.auditedTables.map((t) => (
                <code key={t}>{t}</code>
              ))}
            </p>
          )}
        </section>
      ))}
    </article>
  )
}

interface Props {
  baselines: SecuritySnapshotSummary[]
}

function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Payload cache so switching the view mode does not re-fetch. */
const payloadCache = new Map<string, string | null>()

export function SecurityConceptPanel({ baselines }: Props) {
  const [primaryId, setPrimaryId] = useState('')
  const [previousId, setPreviousId] = useState('')
  const [primary, setPrimary] = useState<string | null>(null)
  const [previous, setPrevious] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * `document` renders the model; the other two show the export source, which
   * is what Copy/Download produce. Previously both toggle positions showed
   * source, which is why neither looked like a document.
   */
  const [view, setView] = useState<'document' | 'markdown' | 'text'>('document')
  const [copied, setCopied] = useState(false)
  /**
   * Environments left OUT of the document. Tracked as exclusions rather than a
   * selection so switching baselines needs no effect to reset it — anything
   * not excluded is documented, whatever the new baseline happens to contain.
   */
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const load = async (id: string): Promise<string | null> => {
    if (!id) return null
    if (payloadCache.has(id)) return payloadCache.get(id) ?? null
    const payload = await securityBaselineService.getPayload(id)
    payloadCache.set(id, payload)
    return payload
  }

  const pick = async (which: 'primary' | 'previous', id: string) => {
    setError(null)
    setCopied(false)
    if (which === 'primary') setPrimaryId(id)
    else setPreviousId(id)
    setLoading(true)
    try {
      const payload = await load(id)
      if (which === 'primary') setPrimary(payload)
      else setPrevious(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const summaryOf = (id: string) => baselines.find((b) => b.id === id) ?? null

  const primaryMeta = summaryOf(primaryId)
  const documentedEnvs = (primaryMeta?.envKeys ?? []).filter(
    (key) => !excluded.has(key),
  )

  const doc = useMemo(() => {
    const meta = summaryOf(primaryId)
    const payload = parseBaseline(primary)
    if (!meta || !payload) return null
    const envKeys = meta.envKeys.filter((key) => !excluded.has(key))
    if (!envKeys.length) return null
    const prevMeta = summaryOf(previousId)
    const prevPayload = parseBaseline(previous)
    return buildSecurityConcept(
      payload,
      {
        name: meta.name,
        scope: meta.scope || '—',
        envKeys,
        allEnvKeys: meta.envKeys,
        envLabel: (key) => envByKey(key)?.label ?? key,
        frozenOn: meta.frozenOn,
        frozenBy: meta.frozenBy,
        generatedAt: new Date(),
      },
      prevMeta && prevPayload
        ? {
            payload: prevPayload,
            name: prevMeta.name,
            frozenOn: prevMeta.frozenOn,
          }
        : null,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary, previous, primaryId, previousId, baselines, excluded])

  return (
    <div className="scdoc">
      <div className="validate-toolbar scdoc-toolbar">
        <label className="scdoc-label" htmlFor="scdoc-primary">
          Baseline
        </label>
        <select
          id="scdoc-primary"
          value={primaryId}
          disabled={loading}
          onChange={(e) => void pick('primary', e.target.value)}
        >
          <option value="">Select a baseline…</option>
          {baselines.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.frozenOn
                ? ` — ${new Date(b.frozenOn).toLocaleDateString()}`
                : ''}
            </option>
          ))}
        </select>

        <label className="scdoc-label" htmlFor="scdoc-previous">
          Compare with
        </label>
        <select
          id="scdoc-previous"
          value={previousId}
          disabled={loading || !primaryId}
          onChange={(e) => void pick('previous', e.target.value)}
        >
          <option value="">— none —</option>
          {baselines
            .filter((b) => b.id !== primaryId)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.frozenOn
                  ? ` — ${new Date(b.frozenOn).toLocaleDateString()}`
                  : ''}
              </option>
            ))}
        </select>

        {doc && (
          <span className="scdoc-actions">
            <span className="muted scdoc-summary">{doc.summary}</span>
            {(['document', 'markdown', 'text'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`chip ${view === mode ? 'chip--active' : ''}`}
                onClick={() => setView(mode)}
              >
                {mode === 'document'
                  ? 'Document'
                  : mode === 'markdown'
                    ? 'Markdown'
                    : 'Text'}
              </button>
            ))}
            <button
              type="button"
              className="btn btn--small"
              title={
                view === 'text'
                  ? 'Copy as plain text'
                  : 'Copy as Markdown'
              }
              onClick={() => {
                void navigator.clipboard.writeText(
                  view === 'text' ? doc.text : doc.markdown,
                )
                setCopied(true)
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() =>
                download(
                  `security-concept-${(summaryOf(primaryId)?.name ?? 'baseline')
                    .replace(/[^\w.-]+/g, '-')
                    .toLowerCase()}.md`,
                  doc.markdown,
                  'text/markdown;charset=utf-8',
                )
              }
            >
              ⤓ Download
            </button>
          </span>
        )}
      </div>

      {primaryMeta && primaryMeta.envKeys.length > 1 && (
        <div className="validate-toolbar scdoc-envs">
          <span className="scdoc-label">Environments</span>
          {primaryMeta.envKeys.map((key, index) => {
            const on = !excluded.has(key)
            return (
              <button
                key={key}
                type="button"
                className={`chip ${on ? 'chip--active' : ''}`}
                title={
                  index === 0
                    ? 'First included environment is the reference for the privilege matrix'
                    : undefined
                }
                onClick={() =>
                  setExcluded((prev) => {
                    const next = new Set(prev)
                    if (on) next.add(key)
                    else next.delete(key)
                    return next
                  })
                }
              >
                {envByKey(key)?.label ?? key}
              </button>
            )
          })}
          <span className="muted scdoc-envs-note">
            {documentedEnvs.length
              ? `Reference: ${envByKey(documentedEnvs[0])?.label ?? documentedEnvs[0]} — its matrix is the one printed, the others appear as deviations.`
              : 'Select at least one environment.'}
          </span>
        </div>
      )}

      {loading && <div className="state">Loading baseline…</div>}
      {error && <div className="state state--error">{error}</div>}
      {!loading && !error && !primaryId && (
        <div className="state">
          Pick a frozen baseline to render it as a document. Choosing a second
          one adds a <strong>“what changed since”</strong> chapter — that is the
          part a reviewer reads first.
        </div>
      )}
      {primaryId && !loading && !error && !documentedEnvs.length && (
        <div className="state state--error">
          No environment selected — pick at least one above.
        </div>
      )}
      {doc &&
        (view === 'document' ? (
          <div className="scdoc-body scdoc-body--rendered">
            <ConceptDocView doc={doc.model} />
          </div>
        ) : (
          <pre className="scdoc-body">
            {view === 'text' ? doc.text : doc.markdown}
          </pre>
        ))}
    </div>
  )
}
