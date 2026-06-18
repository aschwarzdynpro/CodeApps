import { useEffect, useState } from 'react'
import {
  MERGEABLE_COMPONENT_TYPES,
  type WorkingSolution,
} from '../types/solution'
import { SolutionSelect } from './SolutionSelect'

interface Props {
  solutions: WorkingSolution[]
  /** Persist a release's merge rules (allow-list + exclude-list). */
  onSave: (
    recordId: string,
    allowed: number[],
    excluded: number[],
  ) => Promise<void>
}

/**
 * Editor for one release's merge rules: an allow-list (empty = all) and an
 * exclude-list applied on top. Allow and Exclude are mutually exclusive per
 * type. Remounted per release (key) so the chips reset when another release
 * is picked.
 */
function MergeRulesEditor({
  solution,
  onSave,
}: {
  solution: WorkingSolution
  onSave: (allowed: number[], excluded: number[]) => Promise<void>
}) {
  const [allow, setAllow] = useState<Set<number>>(
    new Set(solution.allowedMergeTypes ?? []),
  )
  const [exclude, setExclude] = useState<Set<number>>(
    new Set(solution.excludedMergeTypes ?? []),
  )
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedFading, setSavedFading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The "saved" bar fades out and clears itself after 5s.
  useEffect(() => {
    if (!saved) return
    const fade = window.setTimeout(() => setSavedFading(true), 4400)
    const clear = window.setTimeout(() => setSaved(false), 5000)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(clear)
    }
  }, [saved])

  const touched = () => {
    setDirty(true)
    setSaved(false)
    setError(null)
  }
  const toggleAllow = (code: number) => {
    const adding = !allow.has(code)
    setAllow((prev) => {
      const next = new Set(prev)
      if (adding) next.add(code)
      else next.delete(code)
      return next
    })
    // A type can't be both allowed and excluded.
    if (adding)
      setExclude((prev) => {
        if (!prev.has(code)) return prev
        const next = new Set(prev)
        next.delete(code)
        return next
      })
    touched()
  }
  const toggleExclude = (code: number) => {
    const adding = !exclude.has(code)
    setExclude((prev) => {
      const next = new Set(prev)
      if (adding) next.add(code)
      else next.delete(code)
      return next
    })
    if (adding)
      setAllow((prev) => {
        if (!prev.has(code)) return prev
        const next = new Set(prev)
        next.delete(code)
        return next
      })
    touched()
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave([...allow], [...exclude])
      setDirty(false)
      setSavedFading(false)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const summary =
    allow.size === 0
      ? exclude.size === 0
        ? 'All types allowed'
        : `All types except ${exclude.size} excluded`
      : `${allow.size} allowed${exclude.size ? `, ${exclude.size} excluded` : ''}`

  return (
    <div className="card merge-rules-editor">
      {saved && (
        <div
          className={`state state--success creation-banner ${
            savedFading ? 'creation-banner--fading' : ''
          }`}
        >
          <span>✓ Merge rules saved for {solution.title}.</span>
        </div>
      )}
      <h3 className="card-title">Merge rules — {solution.title}</h3>

      <div className="merge-rules-group">
        <h4 className="merge-rules-group-title">Allow only these types</h4>
        <p className="muted merge-allowed-hint">
          None selected = <strong>all types allowed</strong>.
        </p>
        <div className="chips merge-allowed-chips">
          {MERGEABLE_COMPONENT_TYPES.map((t) => (
            <button
              key={t.code}
              className={`chip ${allow.has(t.code) ? 'chip--active' : ''}`}
              onClick={() => toggleAllow(t.code)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="merge-rules-group">
        <h4 className="merge-rules-group-title">Exclude these types</h4>
        <p className="muted merge-allowed-hint">
          Always blocked on merge — even when otherwise allowed above.
        </p>
        <div className="chips merge-allowed-chips">
          {MERGEABLE_COMPONENT_TYPES.map((t) => (
            <button
              key={t.code}
              className={`chip ${
                exclude.has(t.code) ? 'chip--exclude-active' : ''
              }`}
              onClick={() => toggleExclude(t.code)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="merge-allowed-actions">
        <button
          className="btn btn--small btn--primary"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span className="muted">{summary}</span>
      </div>
      {error && <div className="state state--error">{error}</div>}
    </div>
  )
}

/**
 * "Merge Rules" tab: pick a release solution and configure which component
 * types it accepts on merge (allow-list + exclude-list). Role-gated
 * (Deployment Manager) at the App level; the Workbench detail shows only a
 * read-only summary of the result.
 */
export function MergeRules({ solutions, onSave }: Props) {
  const releases = solutions.filter(
    (s) => s.kind === 'deployment' && !!s.recordId,
  )
  const [selectedId, setSelectedId] = useState('')
  const selected = releases.find((s) => s.id === selectedId) ?? null
  const recordId = selected?.recordId

  return (
    <div className="merge-rules">
      <div className="card compare-controls">
        <h3 className="card-title">Release solution</h3>
        <p className="muted merge-allowed-hint">
          Pick a release to manage the component types it accepts when merging.
        </p>
        {releases.length === 0 ? (
          <div className="state">No tracked release solutions yet.</div>
        ) : (
          <SolutionSelect
            options={releases}
            value={selectedId}
            onChange={setSelectedId}
            placeholder="Select a release…"
          />
        )}
      </div>
      {selected && recordId && (
        <MergeRulesEditor
          key={selected.id}
          solution={selected}
          onSave={(allowed, excluded) => onSave(recordId, allowed, excluded)}
        />
      )}
    </div>
  )
}
