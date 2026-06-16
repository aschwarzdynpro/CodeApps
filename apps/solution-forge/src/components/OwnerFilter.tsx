interface Props {
  /** Distinct owner display names to choose from. */
  owners: string[]
  /** Selected owner, or '' for "all owners". */
  value: string
  onChange: (owner: string) => void
  className?: string
}

/**
 * Compact owner filter: a styled native <select> over the distinct working
 * solution owners. '' means "all owners". Renders nothing when no owner
 * information is available.
 */
export function OwnerFilter({ owners, value, onChange, className }: Props) {
  if (owners.length === 0) return null
  return (
    <label className={`owner-filter ${className ?? ''}`}>
      <span className="owner-filter-icon" aria-hidden="true">
        👤
      </span>
      <select
        className="owner-filter-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title="Filter by owner"
      >
        <option value="">All owners</option>
        {owners.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
