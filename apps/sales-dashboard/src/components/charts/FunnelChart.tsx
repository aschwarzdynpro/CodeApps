import type { ChartCategory, ChartData, ChartSelection } from '../../utils/aggregate'
import { chartColor } from '../../dashboard/types'
import { fmtEurCompact, fmtNumber } from '../../utils/format'

/**
 * Funnel — Pendant zur Legacy-Visualization "Summe Potential nach
 * Prognosekategorie (Funnel)". Stufenbreite proportional zum Wert,
 * Klick filtert das Grid.
 */

interface FunnelChartProps {
  data: ChartData
  format: 'number' | 'currency'
  selection: ChartSelection | null
  onSelect: (category: ChartCategory) => void
}

export function FunnelChart({ data, format, selection, onSelect }: FunnelChartProps) {
  const fmt = format === 'currency' ? fmtEurCompact : fmtNumber
  const max = Math.max(1, ...data.categories.map((c) => c.total))

  return (
    <div className="funnel">
      {data.categories.map((cat, i) => {
        const width = Math.max(24, (cat.total / max) * 100)
        const dimmed = selection !== null && selection.group !== cat.key
        return (
          <button
            key={cat.key}
            type="button"
            className={`funnel__row${dimmed ? ' is-dimmed' : ''}${selection?.group === cat.key ? ' is-active' : ''}`}
            onClick={() => onSelect(cat)}
            disabled={cat.isRest}
          >
            <span
              className="funnel__bar"
              style={{
                width: `${width}%`,
                background: cat.isRest ? 'var(--rest-color)' : chartColor(i),
              }}
            >
              <span className="funnel__label">{cat.key}</span>
              <span className="funnel__value">{fmt(cat.total)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
