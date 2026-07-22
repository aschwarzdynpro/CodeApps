import { Fragment, useState } from 'react'
import type {
  ComparerResult,
  ComparerRow,
  DriftMode,
} from '../types/comparer'
import { cellHasDrift, rowHasDrift } from '../types/comparer'
import { ENVIRONMENTS } from '../config'
import { formatRelative } from '../utils/format'
import { processTypeIcon } from '../utils/processType'

/** A power (on/off) glyph so the action button reads as a control, not a badge. */
const PowerIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 3v9" />
    <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
  </svg>
)

interface Props {
  result: ComparerResult
  /** Host (current) env key — the reference the target cells are compared to. */
  hostKey: string
  /** Plugin steps show a version; flows show the modified time instead. */
  showVersion: boolean
  /** Deployment-manager: enables the per-cell turn on/off buttons. */
  canManage: boolean
  /** `${envKey}:${rowId}` currently toggling (shows a spinner, disables). */
  busyCell: string | null
  /** `${envKey}:${rowId}` that just changed — flashes green, fades to resting. */
  flashCell?: string | null
  /** How drift is measured — vs. current env or vs. the definition. */
  driftMode: DriftMode
  /** Show the Definition column (definition mode + data present). */
  showDefinition: boolean
  /** When set, rows are grouped by this key into collapsible sections. */
  groupKey?: (row: ComparerRow) => string
  /** Preferred order of group headers; groups outside it sort after, alpha. */
  groupOrder?: string[]
  onToggle: (
    env: { key: string; label: string },
    row: ComparerRow,
    desiredOn: boolean,
  ) => void
  /** Show each cell's owner (flows only). */
  showOwner?: boolean
  /** Show a leading checkbox column for multi-select bulk actions. */
  selectable?: boolean
  /** Selected row ids (when `selectable`). */
  selected?: Set<string>
  onToggleRow?: (rowId: string) => void
  /** Toggle all currently-shown rows on/off. */
  onToggleAll?: (checked: boolean) => void
}

/**
 * The comparer matrix: one row per compared item (flow / plugin step), one
 * column per configured environment. Each cell splits an info zone (status
 * pill + version/modified) from a separated action zone (portal deep-link +
 * turn on/off). Cells whose on/off differs from the host are highlighted, the
 * whole row is flagged when any target drifts, and — with `groupKey` — rows are
 * grouped into collapsible sections (e.g. by plugin assembly).
 */
export function ComparerMatrix({
  result,
  hostKey,
  showVersion,
  canManage,
  busyCell,
  flashCell,
  driftMode,
  showDefinition,
  groupKey,
  groupOrder,
  onToggle,
  showOwner,
  selectable,
  selected,
  onToggleRow,
  onToggleAll,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))

  const envKeys = ENVIRONMENTS.map((e) => e.key)
  const hasDefinition =
    showDefinition && result.rows.some((r) => r.definition !== undefined)
  const colSpan =
    1 + (selectable ? 1 : 0) + (hasDefinition ? 1 : 0) + ENVIRONMENTS.length
  const allSelected =
    !!selectable &&
    !!selected &&
    result.rows.length > 0 &&
    result.rows.every((r) => selected.has(r.id))
  const someSelected =
    !!selectable && !!selected && result.rows.some((r) => selected.has(r.id))
  const driftTitle =
    driftMode === 'definition'
      ? 'Not in its defined state in some environment'
      : 'Status differs from current in some environment'

  const renderRow = (row: ComparerRow) => {
    const drift = rowHasDrift(row, hostKey, envKeys, driftMode)
    return (
      <tr key={row.id} className={selected?.has(row.id) ? 'cmp-row--sel' : ''}>
        {selectable && (
          <td className="cmp-sel">
            <input
              type="checkbox"
              checked={selected?.has(row.id) ?? false}
              onChange={() => onToggleRow?.(row.id)}
              aria-label={`Select ${row.name}`}
            />
          </td>
        )}
        <td className="cmp-item">
          <div className="cmp-item-name" title={row.name}>
            {row.processCategory !== undefined && (
              <span
                className="cmp-type-icon"
                role="img"
                aria-label={row.processType}
                title={`Process type: ${row.processType}`}
              >
                {processTypeIcon(row.processCategory)}
              </span>
            )}
            {row.name}
            {drift && (
              <span className="cmp-mark cmp-mark--drift" title={driftTitle}>
                drift
              </span>
            )}
          </div>
          {/* Show the subtitle as a secondary line unless it IS the grouping
              dimension (then it's already the section header — e.g. area/assembly
              grouping); when grouping by process type it still shows the area. */}
          {row.subtitle && (!groupKey || groupKey(row) !== row.subtitle) && (
            <div className="cmp-item-sub muted">{row.subtitle}</div>
          )}
        </td>
        {hasDefinition && (
          <td className="cmp-def">
            {row.definition ? (
              <span
                className={`cmp-defpill ${
                  row.definitionActive ? 'cmp-defpill--on' : 'cmp-defpill--off'
                }`}
                title="Defined desired state (hso_cloudflow)"
              >
                {row.definition}
              </span>
            ) : (
              <span className="muted" title="No definition found">
                —
              </span>
            )}
          </td>
        )}
        {ENVIRONMENTS.map((env) => {
          const state = row.byEnv[env.key] ?? null
          const busy = busyCell === `${env.key}:${row.id}`
          if (state === null)
            return (
              <td
                key={env.key}
                className="cmp-cell cmp-cell--unknown"
                title="Environment could not be read"
              >
                ?
              </td>
            )
          if (!state.present)
            return (
              <td key={env.key} className="cmp-cell cmp-cell--missing">
                <span className="cmp-missing">Missing</span>
              </td>
            )
          const cellDrift = cellHasDrift(row, env.key, hostKey, driftMode)
          const flash = flashCell === `${env.key}:${row.id}`
          return (
            <td
              key={env.key}
              className={`cmp-cell ${cellDrift ? 'cmp-cell--drift' : ''} ${
                flash ? 'cmp-cell--flash' : ''
              }`}
            >
              <div className="cmp-cell-body">
                <div className="cmp-cell-info">
                  <span
                    className={`cmp-pill ${
                      state.active ? 'cmp-pill--on' : 'cmp-pill--off'
                    }`}
                  >
                    {state.statusLabel}
                  </span>
                  {showVersion ? (
                    <span className={`cmp-ver ${state.version ? '' : 'muted'}`}>
                      {state.version ? `v${state.version}` : '—'}
                    </span>
                  ) : (
                    state.modifiedOn && (
                      <span className="cmp-when muted">
                        {formatRelative(state.modifiedOn)}
                      </span>
                    )
                  )}
                </div>
                {showOwner && state.ownerName && (
                  <div
                    className="cmp-owner"
                    title={`Owner in ${env.label}: ${state.ownerName}`}
                  >
                    <span aria-hidden="true">👤</span> {state.ownerName}
                  </div>
                )}
                {(state.link || canManage) && (
                  <div className="cmp-actions">
                    {state.link && (
                      <a
                        className="cmp-jump"
                        href={state.link}
                        target="_blank"
                        rel="noreferrer"
                        title={`Open in ${env.label}`}
                        aria-label={`Open in ${env.label}`}
                      >
                        ↗
                      </a>
                    )}
                    {canManage && (
                      <button
                        className={`cmp-toggle ${
                          state.active ? 'cmp-toggle--off' : 'cmp-toggle--on'
                        }`}
                        disabled={busy}
                        onClick={() => onToggle(env, row, !state.active)}
                        title={
                          state.active
                            ? `Turn off in ${env.label}`
                            : `Turn on in ${env.label}`
                        }
                      >
                        <PowerIcon />
                        {busy ? '…' : state.active ? 'Turn off' : 'Turn on'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </td>
          )
        })}
      </tr>
    )
  }

  // Group rows by the key when provided; groups with any drift first, then by
  // name; every row keeps its incoming (drift-first) order within a group.
  const groups: { key: string; rows: ComparerRow[] }[] = []
  if (groupKey) {
    const byKey = new Map<string, ComparerRow[]>()
    for (const row of result.rows) {
      const k = groupKey(row) || '(none)'
      const list = byKey.get(k)
      if (list) list.push(row)
      else byKey.set(k, [row])
    }
    groups.push(...[...byKey.entries()].map(([key, rows]) => ({ key, rows })))
    // Groups with any drift first, then the caller's preferred order (process
    // types), then alphabetically for anything unranked.
    const rank = (key: string): number => {
      const i = groupOrder ? groupOrder.indexOf(key) : -1
      return i < 0 ? Number.MAX_SAFE_INTEGER : i
    }
    groups.sort((a, b) => {
      const da = a.rows.some((r) => r.statusDrift) ? 0 : 1
      const db = b.rows.some((r) => r.statusDrift) ? 0 : 1
      return da - db || rank(a.key) - rank(b.key) || a.key.localeCompare(b.key)
    })
  }

  return (
    <div className="cmp-table-wrap">
      <table className="cmp-table">
        <thead>
          <tr>
            {selectable && (
              <th className="cmp-sel">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected
                  }}
                  onChange={(e) => onToggleAll?.(e.target.checked)}
                  aria-label="Select all shown flows"
                  disabled={result.rows.length === 0}
                />
              </th>
            )}
            <th className="cmp-th-item">Item</th>
            {hasDefinition && (
              <th className="cmp-th-def" title="Defined desired state">
                Definition
              </th>
            )}
            {ENVIRONMENTS.map((env) => (
              <th
                key={env.key}
                className={env.key === hostKey ? 'cmp-th--host' : ''}
                title={result.envErrors[env.key]}
              >
                {env.label}
                {env.key === hostKey && !/current/i.test(env.label) && (
                  <span className="cmp-th-tag"> · current</span>
                )}
                {result.envErrors[env.key] && (
                  <span className="cmp-th-err" title={result.envErrors[env.key]}>
                    {' '}
                    ⚠
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!groupKey && result.rows.map(renderRow)}
          {groupKey &&
            groups.map((g) => {
              const open = !collapsed[g.key]
              const driftInGroup = g.rows.filter((r) => r.statusDrift).length
              // Show the type icon in the header only when this is a process-type
              // group (the group key equals the rows' process-type label) — not
              // for area / assembly grouping.
              const head = g.rows[0]
              const headIcon =
                head?.processCategory !== undefined &&
                head.processType === g.key
                  ? processTypeIcon(head.processCategory)
                  : undefined
              return (
                <Fragment key={`g:${g.key}`}>
                  <tr className="cmp-group-head">
                    <td colSpan={colSpan}>
                      <button
                        className="cmp-group-toggle"
                        onClick={() => toggleGroup(g.key)}
                        aria-expanded={open}
                      >
                        <span
                          className={`cmp-group-chevron ${
                            open ? 'cmp-group-chevron--open' : ''
                          }`}
                        >
                          ▸
                        </span>
                        {headIcon && (
                          <span className="cmp-group-icon" aria-hidden="true">
                            {headIcon}
                          </span>
                        )}
                        <span className="cmp-group-name">{g.key}</span>
                        <span className="muted">({g.rows.length})</span>
                        {driftInGroup > 0 && (
                          <span className="cmp-group-drift">
                            {driftInGroup} drift
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                  {open && g.rows.map(renderRow)}
                </Fragment>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}
