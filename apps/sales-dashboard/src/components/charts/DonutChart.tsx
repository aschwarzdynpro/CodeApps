import type { ChartCategory, ChartData, ChartSelection } from '../../utils/aggregate'
import { chartColor } from '../../dashboard/types'
import { fmtEurCompact, fmtNumber } from '../../utils/format'

/**
 * Donut mit klickbarer Legende — ersetzt die Pie-Charts der Legacy-
 * Visualizations. Ein Klick auf Segment oder Legendenzeile filtert das
 * Grid der Kachel (Cross-Filter), erneuter Klick hebt den Filter auf.
 */

interface DonutChartProps {
  data: ChartData
  format: 'number' | 'currency'
  selection: ChartSelection | null
  onSelect: (category: ChartCategory) => void
}

const SIZE = 168
const CX = SIZE / 2
const CY = SIZE / 2
const R = 62
const STROKE = 26
const GAP = 0.02 // rad Lücke zwischen Segmenten

function polar(r: number, angle: number): [number, number] {
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
}

function arcPath(start: number, end: number): string {
  const [x1, y1] = polar(R, start)
  const [x2, y2] = polar(R, end)
  const large = end - start > Math.PI ? 1 : 0
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

interface DonutSegment {
  cat: ChartCategory
  color: string
  start: number
  end: number
  full: boolean
}

function buildSegments(data: ChartData): DonutSegment[] {
  const total = Math.max(1, data.total)
  const gap = data.categories.length > 1 ? GAP : 0
  const segments: DonutSegment[] = []
  let angle = -Math.PI / 2
  for (const [i, cat] of data.categories.entries()) {
    const sweep = (cat.total / total) * Math.PI * 2
    segments.push({
      cat,
      color: cat.isRest ? 'var(--rest-color)' : chartColor(i),
      start: angle + gap / 2,
      end: angle + sweep - gap / 2,
      full: sweep >= Math.PI * 2 - 0.001,
    })
    angle += sweep
  }
  return segments
}

export function DonutChart({ data, format, selection, onSelect }: DonutChartProps) {
  const fmt = format === 'currency' ? fmtEurCompact : fmtNumber
  const total = Math.max(1, data.total)
  const segments = buildSegments(data)

  const isDimmed = (cat: ChartCategory) =>
    selection !== null && selection.group !== cat.key

  return (
    <div className="donut">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="donut__svg"
        role="img"
        aria-label="Verteilungsdiagramm"
      >
        {segments.map((seg) =>
          seg.full ? (
            <circle
              key={seg.cat.key}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE}
              className="donut__segment"
              onClick={() => onSelect(seg.cat)}
            />
          ) : (
            <path
              key={seg.cat.key}
              d={arcPath(seg.start, Math.max(seg.end, seg.start + 0.005))}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE}
              className={`donut__segment${seg.cat.isRest ? '' : ' donut__segment--clickable'}${isDimmed(seg.cat) ? ' is-dimmed' : ''}`}
              onClick={() => onSelect(seg.cat)}
            >
              <title>{`${seg.cat.key}: ${fmt(seg.cat.total)}`}</title>
            </path>
          ),
        )}
        <text x={CX} y={CY - 4} textAnchor="middle" className="donut__total">
          {fmt(data.total)}
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" className="donut__total-label">
          Gesamt
        </text>
      </svg>
      <ul className="chart-legend">
        {data.categories.map((cat, i) => (
          <li key={cat.key}>
            <button
              type="button"
              className={`chart-legend__item${isDimmed(cat) ? ' is-dimmed' : ''}${selection?.group === cat.key ? ' is-active' : ''}`}
              onClick={() => onSelect(cat)}
              disabled={cat.isRest}
            >
              <span
                className="chart-legend__dot"
                style={{ background: cat.isRest ? 'var(--rest-color)' : chartColor(i) }}
              />
              <span className="chart-legend__label">{cat.key}</span>
              <span className="chart-legend__value">
                {fmt(cat.total)}
                <em>{Math.round((cat.total / total) * 100)} %</em>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
