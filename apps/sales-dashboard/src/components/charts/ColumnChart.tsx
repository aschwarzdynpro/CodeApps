import type { ChartCategory, ChartData, ChartSelection } from '../../utils/aggregate'
import { chartColor } from '../../dashboard/types'
import { fmtEur, fmtEurCompact, fmtNumber } from '../../utils/format'

/**
 * Säulendiagramm (einfach oder gestapelt) — ersetzt die Column/StackedColumn-
 * Charts der Legacy-Visualizations. Klick auf eine Säule bzw. ein Stapel-
 * Segment filtert das Grid der Kachel.
 */

interface ColumnChartProps {
  data: ChartData
  format: 'number' | 'currency'
  selection: ChartSelection | null
  onSelect: (category: ChartCategory, stack?: string) => void
}

const W = 560
const H = 232
const M = { top: 20, right: 8, bottom: 30, left: 52 } as const
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom

/** "Schöne" Achsen-Obergrenze (1/2/2.5/5 × 10^n). */
function niceCeil(value: number): number {
  if (value <= 0) return 1
  const exp = Math.floor(Math.log10(value))
  const base = 10 ** exp
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (value <= m * base) return m * base
  }
  return 10 * base
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function ColumnChart({ data, format, selection, onSelect }: ColumnChartProps) {
  const axisFmt = format === 'currency' ? fmtEurCompact : fmtNumber
  const fullFmt = format === 'currency' ? fmtEur : fmtNumber
  const stacked = data.stackKeys.length > 0
  const max = niceCeil(Math.max(...data.categories.map((c) => c.total)))
  const y = (v: number) => M.top + PLOT_H - (v / max) * PLOT_H

  const band = PLOT_W / data.categories.length
  const barW = Math.min(56, band * 0.66)

  const dimmed = (cat: ChartCategory, stack?: string) =>
    selection !== null &&
    !(selection.group === cat.key && (stack === undefined || selection.stack === stack))

  return (
    <div className="column-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="column-chart__svg" role="img" aria-label="Säulendiagramm">
        {/* Y-Achse mit Gitterlinien */}
        {[0, 1 / 3, 2 / 3, 1].map((f) => {
          const value = f * max
          return (
            <g key={f}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y(value)}
                y2={y(value)}
                className={f === 0 ? 'column-chart__axis' : 'column-chart__grid'}
              />
              <text x={M.left - 6} y={y(value) + 3.5} textAnchor="end" className="column-chart__tick">
                {axisFmt(value)}
              </text>
            </g>
          )
        })}

        {data.categories.map((cat, ci) => {
          const x = M.left + ci * band + (band - barW) / 2
          const labelX = M.left + ci * band + band / 2
          let cursor = 0
          return (
            <g key={cat.key}>
              {stacked ? (
                data.stackKeys.map((stackKey, si) => {
                  const seg = cat.segments.find((s) => s.key === stackKey)
                  if (!seg || seg.value <= 0) return null
                  const y1 = y(cursor + seg.value)
                  const height = y(cursor) - y1
                  cursor += seg.value
                  return (
                    <rect
                      key={stackKey}
                      x={x}
                      y={y1}
                      width={barW}
                      height={Math.max(height, 1)}
                      rx={2}
                      fill={chartColor(si)}
                      className={`column-chart__bar${cat.isRest ? '' : ' column-chart__bar--clickable'}${dimmed(cat, stackKey) ? ' is-dimmed' : ''}`}
                      onClick={() => onSelect(cat, stackKey)}
                    >
                      <title>{`${cat.key} · ${stackKey}: ${fullFmt(seg.value)}`}</title>
                    </rect>
                  )
                })
              ) : (
                <rect
                  x={x}
                  y={y(cat.total)}
                  width={barW}
                  height={Math.max(y(0) - y(cat.total), 1)}
                  rx={3}
                  fill={cat.isRest ? 'var(--rest-color)' : chartColor(ci)}
                  className={`column-chart__bar${cat.isRest ? '' : ' column-chart__bar--clickable'}${dimmed(cat) ? ' is-dimmed' : ''}`}
                  onClick={() => onSelect(cat)}
                >
                  <title>{`${cat.key}: ${fullFmt(cat.total)}`}</title>
                </rect>
              )}
              {/* Summenbeschriftung über der Säule */}
              <text x={labelX} y={y(cat.total) - 5} textAnchor="middle" className="column-chart__value">
                {axisFmt(cat.total)}
              </text>
              <text x={labelX} y={H - M.bottom + 16} textAnchor="middle" className="column-chart__label">
                <title>{cat.key}</title>
                {clip(cat.key, 11)}
              </text>
            </g>
          )
        })}
      </svg>
      {stacked && (
        <div className="chart-stack-legend">
          {data.stackKeys.map((key, si) => (
            <span key={key} className="chart-stack-legend__item">
              <span className="chart-legend__dot" style={{ background: chartColor(si) }} />
              {key}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
