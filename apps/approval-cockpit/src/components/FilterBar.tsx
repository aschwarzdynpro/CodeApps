import type { ApprovalCategory } from '../types/approval'
import { CATEGORY_LABELS } from '../utils/format'

export type CategoryFilter = ApprovalCategory | 'All'

interface FilterBarProps {
  active: CategoryFilter
  counts: Record<CategoryFilter, number>
  onChange: (filter: CategoryFilter) => void
  search: string
  onSearchChange: (value: string) => void
}

const CATEGORIES: CategoryFilter[] = [
  'All',
  'Leave',
  'PurchaseOrder',
  'Invoice',
  'Expense',
  'Access',
]

export function FilterBar({
  active,
  counts,
  onChange,
  search,
  onSearchChange,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="chips">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`chip ${active === cat ? 'chip--active' : ''}`}
            onClick={() => onChange(cat)}
          >
            {cat === 'All' ? 'All' : CATEGORY_LABELS[cat]}
            <span className="chip-count">{counts[cat] ?? 0}</span>
          </button>
        ))}
      </div>
      <input
        className="search"
        type="search"
        placeholder="Search title or requester…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  )
}
