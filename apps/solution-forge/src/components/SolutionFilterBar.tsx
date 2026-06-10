import type { SolutionKind } from '../types/solution'

export type KindFilter = SolutionKind | 'All'

const CHIPS: { value: KindFilter; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'feature', label: 'Features' },
  { value: 'bug', label: 'Bugs' },
  { value: 'deployment', label: 'Deployments' },
  { value: 'other', label: 'Other' },
]

interface Props {
  kind: KindFilter
  onKindChange: (kind: KindFilter) => void
  search: string
  onSearchChange: (value: string) => void
  counts: Partial<Record<KindFilter, number>>
}

export function SolutionFilterBar({
  kind,
  onKindChange,
  search,
  onSearchChange,
  counts,
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
      </div>
      <input
        className="search"
        type="search"
        placeholder="Search title, unique name, ADO id…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  )
}
