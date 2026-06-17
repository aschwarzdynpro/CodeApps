import { useState } from 'react'
import {
  MERGEABLE_COMPONENT_TYPES,
  type WorkingSolution,
} from '../types/solution'
import { SolutionSelect } from './SolutionSelect'

interface Props {
  solutions: WorkingSolution[]
  /** Persist a release's merge allow-list (component-type codes). */
  onSave: (recordId: string, typeCodes: number[]) => Promise<void>
}

/**
 * Editor for one release's merge allow-list: toggle the component types it
 * accepts on merge. None selected = no restriction (all types allowed).
 * Remounted per release (key) so the chips reset when another release is picked.
 */
function AllowedTypesEditor({
  solution,
  onSave,
}: {
  solution: WorkingSolution
  onSave: (typeCodes: number[]) => Promise<void>
}) {
  const [selected, setSelected] = useState<Set<number>>(
    new Set(solution.allowedMergeTypes ?? []),
  )
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (code: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
    setDirty(true)
    setSaved(false)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave([...selected])
      setDirty(false)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card merge-rules-editor">
      <h3 className="card-title">Allowed component types</h3>
      <p className="muted merge-allowed-hint">
        Only these component types may be merged into{' '}
        <strong>{solution.title}</strong>. None selected ={' '}
        <strong>all types allowed</strong>.
      </p>
      <div className="chips merge-allowed-chips">
        {MERGEABLE_COMPONENT_TYPES.map((t) => (
          <button
            key={t.code}
            className={`chip ${selected.has(t.code) ? 'chip--active' : ''}`}
            onClick={() => toggle(t.code)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="merge-allowed-actions">
        <button
          className="btn btn--small btn--primary"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span className="muted">
          {selected.size === 0
            ? 'All types allowed'
            : `${selected.size} type${selected.size === 1 ? '' : 's'} allowed`}
        </span>
        {saved && !dirty && <span className="merge-allowed-saved">✓ Saved</span>}
      </div>
      {error && <div className="state state--error">{error}</div>}
    </div>
  )
}

/**
 * "Merge Rules" tab: pick a release solution and configure which component
 * types it accepts on merge. Role-gated (Deployment Manager) at the App level;
 * the Workbench detail shows only a read-only summary of the result.
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
        <AllowedTypesEditor
          key={selected.id}
          solution={selected}
          onSave={(codes) => onSave(recordId, codes)}
        />
      )}
    </div>
  )
}
