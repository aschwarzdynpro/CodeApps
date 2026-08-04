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
import { buildSecurityConcept } from '../utils/securityConcept'

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
  const [raw, setRaw] = useState(false)
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
            <button
              type="button"
              className={`chip ${raw ? '' : 'chip--active'}`}
              onClick={() => setRaw(false)}
            >
              Markdown
            </button>
            <button
              type="button"
              className={`chip ${raw ? 'chip--active' : ''}`}
              onClick={() => setRaw(true)}
            >
              Raw
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                void navigator.clipboard.writeText(raw ? doc.text : doc.markdown)
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
      {doc && <pre className="scdoc-body">{raw ? doc.text : doc.markdown}</pre>}
    </div>
  )
}
