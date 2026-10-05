import { S } from '../../strings'
import type { DayResolution, DaySegment } from '../../types/calendar'
import { spanLabel } from '../../utils/format'

/**
 * One day as a horizontal 24-hour bar. Work segments are drawn on the
 * bottom layer; breaks, time off, non-working time and closures lie on top
 * as thin overlays, so the origin of every hour stays visible at a glance.
 */

export function SegmentBar({ day, compact }: { day: DayResolution; compact?: boolean }) {
  const dayMinutes = Math.max(1440, ...day.segments.map((s) => s.endMin))
  const pct = (m: number) => `${(m / dayMinutes) * 100}%`
  const work = day.segments.filter((s) => s.kind === 'work')
  const overlays = day.segments.filter((s) => s.kind !== 'work')
  return (
    <div className={`segbar${compact ? ' segbar--compact' : ''}`} aria-hidden>
      {!compact ? [6, 12, 18].map((h) => <span key={h} className="segbar__tick" style={{ left: pct(h * 60) }} />) : null}
      {work.map((s, i) => (
        <span key={`w${i}`} className={`seg seg--work${s.effort !== null && s.effort !== 1 ? ' seg--effort' : ''}`} style={{ left: pct(s.startMin), width: pct(s.endMin - s.startMin) }} title={`${S.segments.work} ${spanLabel(s)}${s.effort !== null && s.effort !== 1 ? ` · ${S.calendar.effort(s.effort)}` : ''} · ${s.origin.label}`} />
      ))}
      {overlays.map((s, i) => (
        <span key={`o${i}`} className={`seg seg--${s.kind}`} style={{ left: pct(s.startMin), width: pct(s.endMin - s.startMin) }} title={`${S.segments[s.kind]} ${spanLabel(s)} · ${s.origin.label}`} />
      ))}
    </div>
  )
}

export function Legend() {
  const items: { kind: DaySegment['kind']; label: string }[] = [
    { kind: 'work', label: S.segments.work },
    { kind: 'break', label: S.segments.break },
    { kind: 'timeoff', label: S.segments.timeoff },
    { kind: 'nonwork', label: S.segments.nonwork },
    { kind: 'closure', label: S.segments.closure },
  ]
  return (
    <div className="legend" aria-label={S.calendar.legend}>
      {items.map((i) => (
        <span key={i.kind} className="legend__item">
          <span className={`legend__swatch seg--${i.kind}`} />
          {i.label}
        </span>
      ))}
    </div>
  )
}
