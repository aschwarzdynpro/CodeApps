import { useMemo } from 'react'
import { ChevronDownRegular, LinkRegular } from '@fluentui/react-icons'
import { countRows } from '../../utils/labelIndex'
import type { ViewLayout } from '../../utils/viewXml'
import { S } from '../../strings'
import { useDesigner } from './context'
import { LabelText } from './LabelText'
import { columnHeaderRef, rowsOf, tableNameRow, viewRefs } from './refs'
import { CanvasHeader } from './CanvasHeader'

interface ViewCanvasProps {
  viewId: string
  viewName: string
  table: string
  layout: ViewLayout
}

const SKELETON_ROWS = 6
/** Deterministic bar widths for the placeholder rows. */
const barWidth = (row: number, col: number) => 35 + ((row * 37 + col * 53) % 55)

/** The view as a list: view switcher with its name, column headers (= column display names), placeholder rows. */
export function ViewCanvas({ viewId, viewName, table, layout }: ViewCanvasProps) {
  const d = useDesigner()
  const refs = useMemo(() => viewRefs(d.index, viewId, viewName, layout), [d.index, viewId, viewName, layout])
  const counts = useMemo(() => countRows(rowsOf(refs), d.lcid, d.baseLanguage, d.acknowledged), [refs, d.lcid, d.baseLanguage, d.acknowledged])
  const nameRef = refs[0]
  const descRef = refs[1]?.role === S.designer.roles.viewDescription ? refs[1] : null
  const linkedLabel = (t: string) => tableNameRow(d.index, t, 'LocalizedName')?.values[d.baseLanguage] || t
  const columns = `36px ${layout.columns.map((c) => `minmax(${Math.round(c.width * 0.8)}px, ${c.width}fr)`).join(' ')}`

  return (
    <div className="canvas" data-canvas="1">
      <CanvasHeader
        kicker={`${S.designer.kinds.view} · ${table}`}
        title={<LabelText labelRef={nameRef} className="lt--title" empty={viewName} echo />}
        sub={descRef ? <LabelText labelRef={descRef} /> : null}
        counts={counts}
        rows={rowsOf(refs)}
        note={S.designer.viewNote}
      />
      <div className="mda mda--list">
        <div className="mda__viewbar">
          <span className="mda__viewname">
            <LabelText labelRef={nameRef} empty={viewName} />
            <ChevronDownRegular aria-hidden />
          </span>
        </div>
        <div className="mda__gridview" role="table" aria-label={viewName}>
          <div className="mda__gridhead" role="row" style={{ gridTemplateColumns: columns }}>
            <span className="mda__check" aria-hidden />
            {layout.columns.map((c) => (
              <span key={c.name} className="mda__colhead" role="columnheader">
                <LabelText labelRef={columnHeaderRef(d.index, viewName, c.table, c.attribute)} empty={c.attribute} />
                {c.alias ? (
                  <span className="mda__linked" title={S.designer.linkedColumn(c.table)}>
                    <LinkRegular aria-hidden /> {linkedLabel(c.table)}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          {Array.from({ length: SKELETON_ROWS }, (_, r) => (
            <div key={r} className="mda__gridrow" role="row" style={{ gridTemplateColumns: columns }}>
              <span className="mda__check" aria-hidden />
              {layout.columns.map((c, ci) => (
                <span key={c.name} className="mda__cellbar" role="cell">
                  <span style={{ width: `${barWidth(r, ci)}%` }} />
                </span>
              ))}
            </div>
          ))}
        </div>
        {layout.columns.length === 0 ? <div className="empty">{S.designer.noColumns}</div> : null}
      </div>
    </div>
  )
}
