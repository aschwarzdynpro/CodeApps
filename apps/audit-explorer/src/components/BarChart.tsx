interface BarDatum {
  key: string
  value: number
  /** Optional small avatar/initials chip shown before the label. */
  badge?: string
}

interface BarChartProps {
  title: string
  data: BarDatum[]
  color?: string
  /** Called when a bar is clicked (enables drill-down). */
  onSelect?: (key: string) => void
  emptyText?: string
}

export function BarChart({
  title,
  data,
  color = '#5b5bd6',
  onSelect,
  emptyText = 'No data',
}: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <section className="card chart">
      <h3 className="card-title">{title}</h3>
      {data.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ul className="bars">
          {data.map((d) => (
            <li key={d.key}>
              <button
                className={`bar-row ${onSelect ? 'bar-row--clickable' : ''}`}
                onClick={onSelect ? () => onSelect(d.key) : undefined}
                disabled={!onSelect}
              >
                {d.badge && <span className="bar-badge">{d.badge}</span>}
                <span className="bar-label">{d.key}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{
                      width: `${(d.value / max) * 100}%`,
                      background: color,
                    }}
                  />
                </span>
                <span className="bar-value">{d.value}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
