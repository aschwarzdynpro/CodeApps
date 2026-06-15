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
  { key: 'lastQuarter', label: 'Letztes Quartal' },
  { key: 'thisYear', label: 'Dieses Jahr' },
  { key: 'lastYear', label: 'Letztes Jahr' },
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

      <div className="gfilter__field">
        <span>Status</span>
        <div className="seg" role="group" aria-label="Status-Filter">
          <button
            type="button"
            className={`seg__btn${!value.openOnly ? ' is-active' : ''}`}
            onClick={() => onChange({ ...value, openOnly: false })}
            aria-pressed={!value.openOnly}
          >
            Alle
          </button>
          <button
            type="button"
            className={`seg__btn${value.openOnly ? ' is-active' : ''}`}
            onClick={() => onChange({ ...value, openOnly: true })}
            aria-pressed={value.openOnly}
          >
            Nur offene
          </button>
        </div>
      </div>

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
