import type { DatePeriod } from '../utils/format'
import { isFilterActive, type GlobalFilter } from '../utils/globalFilter'

/**
 * Globale Filterleiste über dem Dashboard — wirkt auf KPIs, Bereichs-Anzahlen
 * und alle Listen gleichzeitig.
 */

const PERIODS: { key: DatePeriod; label: string }[] = [
  { key: 'all', label: 'Alle Zeit' },
  { key: 'thisMonth', label: 'Dieser Monat' },
  { key: 'lastMonth', label: 'Letzter Monat' },
  { key: 'thisQuarter', label: 'Dieses Quartal' },
  { key: 'thisYear', label: 'Dieses Jahr' },
]

interface GlobalFilterBarProps {
  value: GlobalFilter
  onChange: (value: GlobalFilter) => void
}

export function GlobalFilterBar({ value, onChange }: GlobalFilterBarProps) {
  const active = isFilterActive(value)
  return (
    <section className="gfilter" aria-label="Globale Filter">
      <span className="gfilter__title">Filter</span>

      <label className="gfilter__field">
        <span>Erstellt</span>
        <select
          value={value.period}
          onChange={(e) => onChange({ ...value, period: e.target.value as DatePeriod })}
        >
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="gfilter__check">
        <input
          type="checkbox"
          checked={value.openOnly}
          onChange={(e) => onChange({ ...value, openOnly: e.target.checked })}
        />
        Nur offene
      </label>

      {active && (
        <button
          type="button"
          className="gfilter__reset"
          onClick={() => onChange({ period: 'all', openOnly: false })}
        >
          ✕ Zurücksetzen
        </button>
      )}
    </section>
  )
}
