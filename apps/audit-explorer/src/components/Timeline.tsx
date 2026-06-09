import { useMemo } from 'react'
import type { AuditEvent, AuditOperation } from '../types/audit'
import { OPERATION_COLORS, OPERATIONS, dayKey } from '../utils/format'

interface DayBucket {
  day: string
  total: number
  counts: Record<AuditOperation, number>
}

export function Timeline({ events }: { events: AuditEvent[] }) {
  const buckets = useMemo<DayBucket[]>(() => {
    const map = new Map<string, DayBucket>()
    for (const e of events) {
      const day = dayKey(e.createdOn)
      let b = map.get(day)
      if (!b) {
        b = { day, total: 0, counts: { Create: 0, Update: 0, Delete: 0, Access: 0 } }
        map.set(day, b)
      }
      b.total++
      b.counts[e.operation]++
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-30)
  }, [events])

  const max = Math.max(1, ...buckets.map((b) => b.total))

  return (
    <section className="card chart">
      <div className="timeline-head">
        <h3 className="card-title">Activity over time</h3>
        <div className="legend">
          {OPERATIONS.map((op) => (
            <span key={op} className="legend-item">
              <span
                className="legend-dot"
                style={{ background: OPERATION_COLORS[op] }}
              />
              {op}
            </span>
          ))}
        </div>
      </div>

      {buckets.length === 0 ? (
        <p className="muted">No data in range</p>
      ) : (
        <div className="timeline">
          {buckets.map((b) => (
            <div
              className="tl-col"
              key={b.day}
              title={`${b.day} · ${b.total} events`}
            >
              <div
                className="tl-stack"
                style={{ height: `${(b.total / max) * 100}%` }}
              >
                {OPERATIONS.map((op) =>
                  b.counts[op] > 0 ? (
                    <span
                      key={op}
                      className="tl-seg"
                      style={{
                        flexGrow: b.counts[op],
                        background: OPERATION_COLORS[op],
                      }}
                    />
                  ) : null,
                )}
              </div>
              <span className="tl-label">{b.day.slice(8, 10)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
