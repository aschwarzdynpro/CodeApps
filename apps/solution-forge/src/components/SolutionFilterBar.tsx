import type { SolutionKind } from '../types/solution'

export type KindFilter = SolutionKind | 'All'

const CHIPS: { value: KindFilter; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'feature', label: 'Features' },
  { value: 'bug', label: 'Bugs' },
  { value: 'deployment', label: 'Releases' },
  { value: 'other', label: 'Other' },
]

interface Props {
  kind: KindFilter
  onKindChange: (kind: KindFilter) => void
  counts: Partial<Record<KindFilter, number>>
  /** Default-on: deployment status not completed/merged. */
  openOnly: boolean
  onOpenOnlyChange: (enabled: boolean) => void
  /** Default-on: only entries with a working-solution record. */
  trackedOnly: boolean
  onTrackedOnlyChange: (enabled: boolean) => void
  /** Only working solutions owned by the signed-in user. */
  mineOnly: boolean
  onMineOnlyChange: (enabled: boolean) => void
  /** Resolved name of the signed-in user, when known. */
  mineUserName?: string | null
}

export function SolutionFilterBar({
  kind,
  onKindChange,
  counts,
  openOnly,
  onOpenOnlyChange,
  trackedOnly,
  onTrackedOnlyChange,
  mineOnly,
  onMineOnlyChange,
  mineUserName,
}: Props) {
  return (
    <div className="filter-bar">
      <div className="chips">
        {CHIPS.map((chip) => {
          const count =
            chip.value === 'All'
              ? Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)
              : (counts[chip.value] ?? 0)
          return (
            <button
              key={chip.value}
              className={`chip ${kind === chip.value ? 'chip--active' : ''}`}
              onClick={() => onKindChange(chip.value)}
            >
              {chip.label}
              <span className="chip-count">{count}</span>
            </button>
          )
        })}
        <span className="chip-divider" />
        <button
          className={`chip ${openOnly ? 'chip--active' : ''}`}
          title="Deployment status is not Completed / Merged — untick to include finished working solutions."
          onClick={() => onOpenOnlyChange(!openOnly)}
        >
          Open
        </button>
        <button
          className={`chip ${trackedOnly ? 'chip--active' : ''}`}
          title="Has a working-solution record — untick to include plain solutions without one."
          onClick={() => onTrackedOnlyChange(!trackedOnly)}
        >
          Tracked
        </button>
        <button
          className={`chip ${mineOnly ? 'chip--active' : ''}`}
          title={
            mineUserName
              ? `Only working solutions owned by ${mineUserName}`
              : 'Only working solutions owned by you'
          }
          onClick={() => onMineOnlyChange(!mineOnly)}
        >
          👤 Mine
        </button>
      </div>
    </div>
  )
}
