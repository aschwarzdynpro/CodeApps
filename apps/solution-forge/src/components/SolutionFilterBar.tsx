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
  search: string
  onSearchChange: (value: string) => void
  counts: Partial<Record<KindFilter, number>>
  /** Whether the search also matches component display names. */
  searchInComponents: boolean
  onSearchInComponentsChange: (enabled: boolean) => void
  /** [done, total] while the component index is being built. */
  indexProgress: [number, number] | null
  /** Group the list by Azure DevOps work item number. */
  groupByWorkItem: boolean
  onGroupByWorkItemChange: (enabled: boolean) => void
  /** Only working solutions owned by the signed-in user. */
  mineOnly: boolean
  onMineOnlyChange: (enabled: boolean) => void
}

export function SolutionFilterBar({
  kind,
  onKindChange,
  search,
  onSearchChange,
  counts,
  searchInComponents,
  onSearchInComponentsChange,
  indexProgress,
  groupByWorkItem,
  onGroupByWorkItemChange,
  mineOnly,
  onMineOnlyChange,
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
        <button
          className={`chip ${mineOnly ? 'chip--active' : ''}`}
          title="Only working solutions owned by you"
          onClick={() => onMineOnlyChange(!mineOnly)}
        >
          👤 Mine
        </button>
      </div>
      <div className="search-group">
        <input
          className="search"
          type="search"
          placeholder={
            searchInComponents
              ? 'Search incl. component names…'
              : 'Search title, unique name, ADO id…'
          }
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <label
          className="search-scope"
          title="Group solutions sharing the same Azure DevOps work item number."
        >
          <input
            type="checkbox"
            checked={groupByWorkItem}
            onChange={(e) => onGroupByWorkItemChange(e.target.checked)}
          />
          group by work item
        </label>
        <label
          className="search-scope"
          title="Also match component display names (builds a one-time index across all solutions)."
        >
          <input
            type="checkbox"
            checked={searchInComponents}
            onChange={(e) => onSearchInComponentsChange(e.target.checked)}
          />
          incl. components
          {indexProgress && (
            <span className="search-scope-progress">
              indexing {indexProgress[0]}/{indexProgress[1]}…
            </span>
          )}
        </label>
      </div>
    </div>
  )
}
