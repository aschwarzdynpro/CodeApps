import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type {
  CreateWorkingSolutionInput,
  PublisherInfo,
  WorkingSolution,
} from '../types/solution'
import type { WorkItemPick } from '../utils/workItem'
import { buildUniqueName, sanitizeIdPart } from '../utils/naming'
import { DEPLOYMENT_MANAGER_ROLE, isDevOpsAvailable } from '../config'
import { devOpsService } from '../services/devOpsService'

type Kind = CreateWorkingSolutionInput['kind']

const KIND_OPTIONS: { value: Kind; label: string; hint: string }[] = [
  { value: 'feature', label: 'Feature', hint: 'feature_<ADO id>' },
  { value: 'bug', label: 'Bug', hint: 'bug_<ADO id>' },
  { value: 'deployment', label: 'Release', hint: 'deploy_<name>' },
]

interface Props {
  publishers: PublisherInfo[]
  /** Preselected publisher id (from Workbench Settings); '' = none. */
  defaultPublisherId: string
  existingUniqueNames: string[]
  /** Release solutions may only be created by deployment managers. */
  canCreateRelease: boolean
  /** Optional pre-fill (e.g. when created from a DevOps work item in the drawer). */
  initialKind?: Kind
  initialDevOpsId?: string
  initialTitle?: string
  onCreate: (input: CreateWorkingSolutionInput) => Promise<WorkingSolution>
  onCreated: (solution: WorkingSolution) => void
  onClose: () => void
}

/**
 * Modal form for a new working solution. The Azure DevOps id becomes the
 * unique name (with the kind prefix supplying the mandatory leading letter),
 * the title becomes the display name. Shows a live preview and validates the
 * unique name against the solutions already in the environment.
 */
export function CreateSolutionDialog({
  publishers,
  defaultPublisherId,
  existingUniqueNames,
  canCreateRelease,
  initialKind,
  initialDevOpsId,
  initialTitle,
  onCreate,
  onCreated,
  onClose,
}: Props) {
  const [kind, setKind] = useState<Kind>(initialKind ?? 'feature')
  const [devOpsId, setDevOpsId] = useState(initialDevOpsId ?? '')
  const [title, setTitle] = useState(initialTitle ?? '')
  const [description, setDescription] = useState('')
  const [publisherId, setPublisherId] = useState(
    defaultPublisherId || publishers[0]?.id || '',
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Optional live work-item search (a separate "Azure DevOps search" field that
  // fills the id + title). Offered whenever the connector is available (reads work
  // regardless of the sync path) and the type is feature/bug; the id + title are
  // always editable manually, so the dialog works with no connector at all.
  const [searchTerm, setSearchTerm] = useState('')
  const [suggestions, setSuggestions] = useState<WorkItemPick[]>([])
  const [searching, setSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const activeRef = useRef<HTMLButtonElement | null>(null)
  const searchEnabled = kind !== 'deployment' && isDevOpsAvailable()

  useEffect(() => {
    const q = searchTerm.trim()
    if (!searchEnabled || !showSuggestions || q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      void devOpsService
        .searchWorkItems(q)
        .then((res) => {
          if (!cancelled) {
            setSuggestions(res)
            setActiveIndex(res.length ? 0 : -1)
          }
        })
        .catch(() => {
          if (!cancelled) setSuggestions([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchTerm, searchEnabled, showSuggestions])

  // Keep the keyboard-highlighted suggestion scrolled into view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const pickWorkItem = (p: WorkItemPick) => {
    setDevOpsId(p.id)
    setTitle(p.title)
    setSearchTerm('')
    setSuggestions([])
    setShowSuggestions(false)
  }

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false)
      return
    }
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      pickWorkItem(suggestions[activeIndex])
    }
  }

  const idPart = sanitizeIdPart(devOpsId)
  const uniqueName = idPart ? buildUniqueName(kind, idPart) : ''
  const duplicate =
    !!uniqueName &&
    existingUniqueNames.some(
      (n) => n.toLowerCase() === uniqueName.toLowerCase(),
    )
  const idInvalid =
    kind !== 'deployment' && idPart !== '' && !/^\d+$/.test(idPart)

  const canSubmit =
    !submitting &&
    title.trim() !== '' &&
    idPart !== '' &&
    !duplicate &&
    !idInvalid &&
    publisherId !== '' &&
    (kind !== 'deployment' || canCreateRelease)

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await onCreate({
        title: title.trim(),
        devOpsId: idPart,
        kind,
        description: description.trim(),
        publisherId,
      })
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>New Working Solution</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="form-row">
          <span className="form-label">Type</span>
          <div className="chips">
            {KIND_OPTIONS.map((opt) => {
              const locked = opt.value === 'deployment' && !canCreateRelease
              return (
                <button
                  key={opt.value}
                  className={`chip ${kind === opt.value ? 'chip--active' : ''} ${
                    locked ? 'chip--disabled' : ''
                  }`}
                  disabled={locked}
                  onClick={() => !locked && setKind(opt.value)}
                  title={
                    locked
                      ? `Creating a Release requires the security role “${DEPLOYMENT_MANAGER_ROLE}”.`
                      : opt.hint
                  }
                >
                  {opt.label}
                  {locked && <span className="chip-lock"> ⓘ</span>}
                </button>
              )
            })}
          </div>
        </div>

        {searchEnabled && (
          <div className="form-row">
            <span className="form-label">Azure DevOps search</span>
            <div className="wi-search">
              <input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setShowSuggestions(true)
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() =>
                  window.setTimeout(() => setShowSuggestions(false), 150)
                }
                onKeyDown={onSearchKeyDown}
                placeholder="Search work items by title or id…"
                autoFocus
                autoComplete="off"
                role="combobox"
                aria-expanded={showSuggestions && suggestions.length > 0}
                aria-controls="wi-suggestion-list"
              />
              {showSuggestions && (searching || suggestions.length > 0) && (
                <ul
                  className="wi-suggestions"
                  id="wi-suggestion-list"
                  role="listbox"
                >
                  {searching && suggestions.length === 0 && (
                    <li className="wi-suggestion-empty muted">Searching…</li>
                  )}
                  {suggestions.map((p, i) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        ref={i === activeIndex ? activeRef : undefined}
                        className={`wi-suggestion ${
                          i === activeIndex ? 'wi-suggestion--active' : ''
                        }`}
                        role="option"
                        aria-selected={i === activeIndex}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => pickWorkItem(p)}
                      >
                        <span className="wi-suggestion-id">#{p.id}</span>
                        <span className="wi-suggestion-title" title={p.title}>
                          {p.title}
                        </span>
                        <span className="wi-suggestion-meta muted">
                          {p.type} · {p.state}
                          {p.assignedTo ? ` · ${p.assignedTo}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <label className="form-row">
          <span className="form-label">
            {kind === 'deployment' ? 'Release / sprint name' : 'Azure DevOps ID'}
          </span>
          <input
            value={devOpsId}
            onChange={(e) => setDevOpsId(e.target.value)}
            placeholder={kind === 'deployment' ? 'sprint_12' : '4711'}
            autoFocus={!searchEnabled}
          />
          {idInvalid && (
            <span className="form-error">
              Feature / bug solutions expect the numeric work item id.
            </span>
          )}
        </label>

        <label className="form-row">
          <span className="form-label">Title (solution display name)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Customer onboarding wizard"
          />
        </label>

        <label className="form-row">
          <span className="form-label">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What is being built or fixed in this solution?"
          />
        </label>

        <label className="form-row">
          <span className="form-label">Publisher</span>
          <select
            value={publisherId}
            onChange={(e) => setPublisherId(e.target.value)}
          >
            {publishers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.friendlyName} ({p.prefix || p.uniqueName})
              </option>
            ))}
          </select>
        </label>

        <div className={`preview ${duplicate ? 'preview--error' : ''}`}>
          <span className="form-label">Unique name preview</span>
          <code>{uniqueName || '—'}</code>
          {duplicate && (
            <span className="form-error">
              This unique name already exists in the environment.
            </span>
          )}
        </div>

        {error && <div className="state state--error">{error}</div>}

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {submitting ? 'Creating…' : 'Create solution'}
          </button>
        </div>
      </div>
    </div>
  )
}
