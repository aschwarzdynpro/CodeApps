import { useContext, type ReactNode } from 'react'
import { ArrowDownRegular, ArrowUpRegular, CheckmarkCircleFilled, LightbulbRegular, SparkleFilled } from '@fluentui/react-icons'
import { cellId, type LabelRow } from '../../types/translation'
import { countLive, coverageOf, gapsOf } from '../../utils/labelIndex'
import { languageName } from '../../utils/languages'
import { S } from '../../strings'
import { liveRow, useDesigner, useLiveStore, useLiveValue, type Live } from './context'
import { CanvasNav, currentLabel, jumpToGap } from './nav'
import { Breadcrumb } from './Breadcrumb'

interface CanvasHeaderProps {
  /** What the canvas is — shown when there is no breadcrumb. */
  kicker: string
  title: ReactNode
  /** Every file row on the canvas (structure rows); counts and suggestions follow the live data. */
  rows: readonly (LabelRow | null | undefined)[]
  /** Extra line under the title (description …). */
  sub?: ReactNode
  /** Note next to the counters (e.g. read-only sitemap titles). */
  note?: ReactNode
  /** A row under the head, e.g. jump links to the sections of a long canvas. */
  nav?: ReactNode
}

/**
 * Head of a canvas: what it is, how far the translation is, and the way to
 * the next gap. When nothing is left the head says so — with a small
 * celebration once there are changes waiting to be applied.
 */
export function CanvasHeader({ kicker, title, rows, sub, note, nav }: CanvasHeaderProps) {
  const d = useDesigner()
  const store = useLiveStore()
  const onExhausted = useContext(CanvasNav)

  /** Suggestions on this canvas that differ from the current text. */
  const offersOf = (live: Live) => {
    const out: { row: LabelRow; value: string }[] = []
    if (d.readOnly) return out
    const seen = new Set<string>()
    for (const r of rows) {
      if (!r || seen.has(r.key)) continue
      seen.add(r.key)
      const s = live.suggestions.get(cellId(r.key, d.lcid))
      if (s && s.value !== (liveRow(live, d.pos, r).values[d.lcid] ?? '')) out.push({ row: r, value: s.value })
    }
    return out
  }
  const sig = useLiveValue((live) => {
    const c = countLive(live.gaps, d.pos, rows, d.lcid)
    return `${c.missing}|${c.untranslated}|${c.changed}|${c.ok}|${offersOf(live).length}`
  })
  const [missing, untranslated, changed, ok, offers] = sig.split('|').map(Number)
  const counts = { missing, untranslated, changed, ok }
  const gaps = gapsOf(counts)
  const pct = coverageOf(counts)

  const jump = (dir: 1 | -1, button: HTMLElement) => {
    const root = button.closest('[data-canvas]')
    if (root) jumpToGap(currentLabel(root), dir, root, onExhausted)
  }
  const takeAll = () => {
    for (const o of offersOf(store.get())) d.onAccept(o.row, d.lcid, o.value, false)
  }

  return (
    <header className={`canvas__head${gaps === 0 ? ' canvas__head--done' : ''}`}>
      <div className="canvas__titles">
        <Breadcrumb fallback={kicker} />
        <div className="canvas__title">{title}</div>
        {sub ? <div className="canvas__sub">{sub}</div> : null}
      </div>
      <div className="canvas__status">
        <div className="canvas__progress" role="img" aria-label={S.kpi.coverage(pct)}>
          <span className="canvas__bar">
            <span className="canvas__fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="canvas__pct">
            {Math.floor(pct)} % · {languageName(d.lcid)}
          </span>
        </div>
        {gaps > 0 ? (
          <div className="canvas__counts">
            {missing > 0 ? <span className="state state--missing">{S.designer.missing(missing)}</span> : null}
            {untranslated > 0 ? <span className="state state--untranslated">{S.designer.untranslated(untranslated)}</span> : null}
            {changed > 0 ? <span className="state state--changed">{S.designer.changed(changed)}</span> : null}
            {offers > 0 ? (
              <button type="button" className="canvas__navbtn canvas__navbtn--suggest" title={S.designer.takeAllTitle} onClick={takeAll}>
                <LightbulbRegular /> {S.designer.takeAll(offers)}
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
        ) : changed > 0 ? (
          <div className="canvas__done canvas__done--party" role="status">
            <SparkleFilled aria-hidden className="canvas__sparkle" />
            {S.designer.doneWithChanges(changed)}
          </div>
        ) : (
          <div className="canvas__done" role="status">
            <CheckmarkCircleFilled aria-hidden /> {S.designer.done}
          </div>
        )}
        {note ? <div className="canvas__note">{note}</div> : null}
      </div>
      {nav ? <div className="canvas__jump">{nav}</div> : null}
    </header>
  )
}
