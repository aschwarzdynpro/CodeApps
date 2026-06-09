import { DATE_RANGES } from '../utils/format'

interface FilterBarProps {
  rangeDays: number
  onRangeChange: (days: number) => void
  search: string
  onSearchChange: (value: string) => void
}

export function FilterBar({
  rangeDays,
  onRangeChange,
  search,
  onSearchChange,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="chips">
        {DATE_RANGES.map((r) => (
          <button
            key={r.label}
            className={`chip ${rangeDays === r.days ? 'chip--active' : ''}`}
            onClick={() => onRangeChange(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <input
        className="search"
        type="search"
        placeholder="Search table, record or user…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  )
}
