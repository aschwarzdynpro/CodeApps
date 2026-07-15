import { useMemo, useState } from 'react'
import type {
  EditableUserSettings,
  UserSettingsRow,
} from '../types/userSettings'
import { userSettingsService } from '../services/userSettingsService'
import { ConfirmDialog } from './ConfirmDialog'
import { SETTINGS_GROUPS, pickGroupValues } from '../utils/usersettingsGroups'

interface Props {
  envKey: string
  envLabel: string
  /** The template user whose settings are being copied. */
  source: UserSettingsRow
  /** The settings values shown in the detail dialog (the copy source). */
  sourceValues: EditableUserSettings
  /** Candidate target users (the environment's user list). */
  users: UserSettingsRow[]
  onClose: () => void
  /** Called after the run so the list can refresh. */
  onDone: () => void
}

interface CopyResult {
  id: string
  name: string
  ok: boolean
  error?: string
}

/**
 * Copy one user's proven settings onto several other users in the same
 * environment: pick which setting groups to copy + the target users, then write
 * serially (connector SP) with a progress bar + per-user result. Reuses the
 * Flow-Comparer serial-runner pattern on top of `updateUserSettings`.
 */
export function UserSettingsCopyDialog({
  envKey,
  envLabel,
  source,
  sourceValues,
  users,
  onClose,
  onDone,
}: Props) {
  const [groups, setGroups] = useState<Set<string>>(
    new Set(['general', 'formats']),
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [label, setLabel] = useState('')
  const [results, setResults] = useState<CopyResult[] | null>(null)

  const q = search.trim().toLowerCase()
  // Targets: real users in this env, excluding the source, matching the search.
  const candidates = useMemo(
    () =>
      users.filter(
        (u) =>
          !u.isApp &&
          u.userId !== source.userId &&
          (!q ||
            u.fullName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q)),
      ),
    [users, source.userId, q],
  )
  const selectedTargets = useMemo(
    () => candidates.filter((u) => selected.has(u.userId)),
    [candidates, selected],
  )
  const running = progress !== null
  const fieldCount = SETTINGS_GROUPS.filter((g) => groups.has(g.key)).reduce(
    (n, g) => n + g.keys.length,
    0,
  )
  const canRun = groups.size > 0 && selectedTargets.length > 0 && !running

  const toggleGroup = (key: string) =>
    setGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const toggleUser = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = (checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const u of candidates)
        if (checked) next.add(u.userId)
        else next.delete(u.userId)
      return next
    })

  const run = async () => {
    setConfirming(false)
    const targets = selectedTargets
    const payload = pickGroupValues(sourceValues, groups)
    setResults(null)
    setProgress([0, targets.length])
    const out: CopyResult[] = []
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      setLabel(`Copying to “${t.fullName}”…`)
      setProgress([i, targets.length])
      try {
        await userSettingsService.updateUserSettings(envKey, t.userId, payload)
        out.push({ id: t.userId, name: t.fullName, ok: true })
      } catch (err) {
        out.push({
          id: t.userId,
          name: t.fullName,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    setProgress(null)
    setResults(out)
    setSelected(new Set())
    onDone()
  }

  const allChecked =
    candidates.length > 0 && candidates.every((u) => selected.has(u.userId))
  const someChecked = candidates.some((u) => selected.has(u.userId))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Copy settings to users</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="muted us-detail-sub">
          From <strong>{source.fullName}</strong> · {envLabel}
        </p>

        <div className="us-copy-groups">
          <span className="us-field-label">Which settings</span>
          {SETTINGS_GROUPS.map((g) => (
            <label key={g.key} className="us-copy-group">
              <input
                type="checkbox"
                checked={groups.has(g.key)}
                disabled={running}
                onChange={() => toggleGroup(g.key)}
              />
              {g.label}
            </label>
          ))}
        </div>

        <div className="us-copy-targets">
          <div className="us-copy-targets-head">
            <label className="us-copy-group">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked && !allChecked
                }}
                disabled={running || candidates.length === 0}
                onChange={(e) => toggleAll(e.target.checked)}
              />
              Target users ({selectedTargets.length}/{candidates.length})
            </label>
            <input
              className="search"
              type="search"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ul className="us-copy-list">
            {candidates.map((u) => (
              <li key={u.userId}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(u.userId)}
                    disabled={running}
                    onChange={() => toggleUser(u.userId)}
                  />
                  <span className="us-user">{u.fullName}</span>
                  <code>{u.email}</code>
                </label>
              </li>
            ))}
            {candidates.length === 0 && (
              <li className="muted">No other users match.</li>
            )}
          </ul>
        </div>

        {progress && (
          <div className="state cmp-bulk-progress" aria-live="polite">
            <div className="cmp-bulk-progress-head">
              <span className="sharing-progress-spinner" />
              <span className="cmp-bulk-progress-label">{label}</span>
              <span className="cmp-bulk-progress-pct">
                {progress[0]}/{progress[1]}
              </span>
            </div>
            <div className="cmp-progress">
              <div
                className="cmp-progress-bar"
                style={{
                  width: `${(progress[0] / Math.max(1, progress[1])) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
        {results && (
          <div
            className={`state ${
              results.some((r) => !r.ok) ? 'state--error' : 'state--success'
            }`}
          >
            {results.filter((r) => r.ok).length} succeeded
            {results.some((r) => !r.ok)
              ? `, ${results.filter((r) => !r.ok).length} failed`
              : ''}
            .
            {results.some((r) => !r.ok) && (
              <ul className="merge-errors">
                {results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.id}>
                      {r.name}: {r.error}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        <div className="us-detail-actions">
          <span className="muted">
            {fieldCount} field{fieldCount === 1 ? '' : 's'} →{' '}
            {selectedTargets.length} user{selectedTargets.length === 1 ? '' : 's'}
          </span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn--primary"
            disabled={!canRun}
            onClick={() => setConfirming(true)}
          >
            Copy
          </button>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Copy user settings"
          confirmLabel="Copy"
          danger={envKey === 'prod'}
          onConfirm={() => void run()}
          onCancel={() => setConfirming(false)}
          message={
            <>
              <p>
                Copy{' '}
                <strong>
                  {SETTINGS_GROUPS.filter((g) => groups.has(g.key))
                    .map((g) => g.label)
                    .join(', ')}
                </strong>{' '}
                from <strong>{source.fullName}</strong> to{' '}
                <strong>{selectedTargets.length}</strong> user
                {selectedTargets.length === 1 ? '' : 's'} in{' '}
                <strong>{envLabel}</strong>.
              </p>
              <p className="muted">
                Overwrites those fields for each target user. Runs one after
                another.
              </p>
              {envKey === 'prod' && (
                <p className="confirm-warn">
                  This is <strong>production</strong> — changes take effect
                  immediately.
                </p>
              )}
            </>
          }
        />
      )}
    </div>
  )
}
