import { useContext, type ReactNode } from 'react'
import { ArrowDownRegular, ArrowUpRegular, CheckmarkCircleFilled, LightbulbRegular, SparkleFilled } from '@fluentui/react-icons'
import { cellId, type LabelRow } from '../../types/translation'
import type { StateCounts } from '../../utils/gaps'
import { coverageOf, gapsOf } from '../../utils/labelIndex'
import { languageName } from '../../utils/languages'
import { S } from '../../strings'
import { useDesigner } from './context'
import { CanvasNav, currentLabel, jumpToGap } from './nav'

interface CanvasHeaderProps {
  kicker: string
  title: ReactNode
  /** States of every label on the canvas in the canvas language. */
  counts: StateCounts
  /** Extra line under the title (description …). */
  sub?: ReactNode
  /** Note next to the counters (e.g. read-only sitemap titles). */
  note?: ReactNode
  /** File rows on the canvas, for "take all suggestions". */
  rows?: (LabelRow | null | undefined)[]
}

/**
 * Head of a canvas: what it is, how far the translation is, and the way to
 * the next gap. When nothing is left the head says so — with a small
 * celebration once there are changes waiting to be applied.
 */
export function CanvasHeader({ kicker, title, counts, sub, note, rows }: CanvasHeaderProps) {
  const d = useDesigner()
  const onExhausted = useContext(CanvasNav)
  const gaps = gapsOf(counts)
  const pct = coverageOf(counts)
  const offers: { row: LabelRow; value: string }[] = []
  if (!d.readOnly) {
    const seen = new Set<string>()
    for (const r of rows ?? []) {
      if (!r || seen.has(r.key)) continue
      seen.add(r.key)
      const s = d.suggestions.get(cellId(r.key, d.lcid))
      if (s && s.value !== (r.values[d.lcid] ?? '')) offers.push({ row: r, value: s.value })
    }
  }
  const jump = (dir: 1 | -1, button: HTMLElement) => {
    const root = button.closest('[data-canvas]')
    if (root) jumpToGap(currentLabel(root), dir, root, onExhausted)
  }

  return (
    <header className={`canvas__head${gaps === 0 ? ' canvas__head--done' : ''}`}>
      <div className="canvas__titles">
        <span className="canvas__kicker">{kicker}</span>
        <div className="canvas__title">{title}</div>
        {sub ? <div className="canvas__sub">{sub}</div> : null}
      </div>
      <div className="canvas__status">
        <div className="canvas__progress" aria-label={S.kpi.coverage(pct)}>
          <span className="canvas__bar">
            <span className="canvas__fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="canvas__pct">
            {Math.floor(pct)} % · {languageName(d.lcid)}
          </span>
        </div>
        {gaps > 0 ? (
          <div className="canvas__counts">
            {counts.missing > 0 ? <span className="state state--missing">{S.designer.missing(counts.missing)}</span> : null}
            {counts.untranslated > 0 ? <span className="state state--untranslated">{S.designer.untranslated(counts.untranslated)}</span> : null}
            {counts.changed > 0 ? <span className="state state--changed">{S.designer.changed(counts.changed)}</span> : null}
            {offers.length > 0 ? (
              <button type="button" className="canvas__navbtn canvas__navbtn--suggest" title={S.designer.takeAllTitle} onClick={() => offers.forEach((o) => d.onAccept(o.row, d.lcid, o.value, false))}>
                <LightbulbRegular /> {S.designer.takeAll(offers.length)}
              </button>
            ) : null}
            <span className="canvas__nav">
              <button type="button" className="canvas__navbtn" data-nav="prev" title={S.designer.prevGap} aria-label={S.designer.prevGap} onClick={(e) => jump(-1, e.currentTarget)}>
                <ArrowUpRegular />
              </button>
              <button type="button" className="canvas__navbtn canvas__navbtn--main" data-nav="next" title={S.designer.nextGapTitle} onClick={(e) => jump(1, e.currentTarget)}>
                <ArrowDownRegular /> {S.designer.nextGap}
              </button>
            </span>
          </div>
        ) : counts.changed > 0 ? (
          <div className="canvas__done canvas__done--party" role="status">
            <SparkleFilled aria-hidden className="canvas__sparkle" />
            {S.designer.doneWithChanges(counts.changed)}
          </div>
        ) : (
          <div className="canvas__done" role="status">
            <CheckmarkCircleFilled aria-hidden /> {S.designer.done}
          </div>
        )}
        {note ? <div className="canvas__note">{note}</div> : null}
      </div>
    </header>
  )
}
