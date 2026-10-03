import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { EyeOffRegular, GridRegular, TableSimpleRegular } from '@fluentui/react-icons'
import type { LabelRow } from '../../types/translation'
import { columnBasis, type FormCell, type FormLayout, type FormSection } from '../../utils/formXml'
import { countLive, gapsOf } from '../../utils/labelIndex'
import { S } from '../../strings'
import { liveRow, useDesigner, useLiveStore, useLiveValue, type LabelRef } from './context'
import { LabelText } from './LabelText'
import { cellRole, elementRef, formRefs, rowsOf, tabRefs } from './refs'
import { CanvasHeader } from './CanvasHeader'
import { CanvasNav, jumpAfterRender } from './nav'

interface FormCanvasProps {
  formId: string
  formName: string
  table: string
  type?: number
  layout: FormLayout
}

/** The form as users see it: header fields, tabs, sections in their columns, fields with labels. */
export const FormCanvas = memo(function FormCanvas({ formId, formName, table, type, layout }: FormCanvasProps) {
  const d = useDesigner()
  const store = useLiveStore()
  const [tab, setTab] = useState(0)
  const base = d.baseLanguage
  const refs = useMemo(() => formRefs(d.index, formId, table, formName, layout, base), [d.index, formId, table, formName, layout, base])
  const rows = useMemo(() => rowsOf(refs), [refs])
  const tabRows = useMemo(() => layout.tabs.map((t) => rowsOf(tabRefs(d.index, table, formName, t, base))), [layout, d.index, table, formName, base])
  // Form texts the export doesn't carry and that lack the canvas language: shown read only, explained in the head.
  const roMissing = useMemo(() => refs.filter((r) => !r.row && r.fallback[base] && !r.fallback[d.lcid]).length, [refs, base, d.lcid])
  const current = layout.tabs[Math.min(tab, layout.tabs.length - 1)]
  const currentIndex = current ? layout.tabs.indexOf(current) : 0
  const root = useRef<HTMLDivElement>(null)
  // The visible tab is done in the direction of travel: go to the next tab with gaps (cyclic), by the counts of now.
  const onExhausted = useCallback(
    (dir: 1 | -1) => {
      const live = store.get()
      const n = layout.tabs.length
      for (let step = 1; step < n; step++) {
        const i = (currentIndex + dir * step + n) % n
        if (gapsOf(countLive(live.gaps, d.pos, tabRows[i], d.lcid)) > 0) {
          setTab(i)
          jumpAfterRender(() => root.current?.querySelector('.mda__tabbody'), dir)
          return true
        }
      }
      return false
    },
    [store, layout.tabs.length, currentIndex, tabRows, d.pos, d.lcid],
  )
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const n = layout.tabs.length
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (currentIndex + (e.key === 'ArrowRight' ? 1 : -1) + n) % n
    setTab(next)
    ;(e.currentTarget.children[next] as HTMLElement | undefined)?.focus()
  }
  const description = refs.find((r) => r.role === S.designer.roles.formDescription) ?? null
  const sectionContext = (t: FormLayout['tabs'][number]) => `${formName} › ${t.labels[base] || t.name}`

  return (
    <CanvasNav.Provider value={onExhausted}>
      <div className="canvas" data-canvas="1" ref={root}>
        <CanvasHeader
          kicker={`${S.preview.formTypes[type ?? -1] ?? S.preview.formTypeOther}${table ? ` · ${table}` : ''}`}
          title={<LabelText labelRef={refs[0]} className="lt--title" empty={formName} />}
          sub={description ? <LabelText labelRef={description} /> : null}
          rows={rows}
          note={roMissing > 0 ? S.designer.formRoNote(roMissing) : undefined}
        />
        <div className="mda">
          {layout.header.length > 0 ? (
            <div className="mda__header">
              {layout.header.map((c, i) => (
                <div key={c.id || i} className="mda__headerfield">
                  <span className="small">
                    <LabelText labelRef={elementRef(d.index, table, c.id, c.labels, c.field, cellRole(c), `${formName} › ${S.designer.header}`, base)} empty={c.field} />
                  </span>
                  <span className="mda__value mda__value--small">—</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mda__tabs" role="tablist" aria-label={formName} onKeyDown={onTabKey}>
            {layout.tabs.map((t, i) => (
              <button
                key={t.id || i}
                type="button"
                role="tab"
                tabIndex={t === current ? 0 : -1}
                aria-selected={t === current}
                className={`mda__tab${t === current ? ' mda__tab--active' : ''}${t.visible ? '' : ' mda__tab--hidden'}`}
                onClick={() => setTab(i)}
              >
                <TabLabel labelRef={elementRef(d.index, table, t.id, t.labels, '', S.designer.roles.tab, formName, base)} text={t.labels[d.lcid] || t.labels[base] || t.name} rows={tabRows[i]} />
              </button>
            ))}
          </div>

          {current ? (
            <div className="mda__tabbody" role="tabpanel">
              <h3 className="mda__tabtitle">
                <LabelText labelRef={elementRef(d.index, table, current.id, current.labels, '', S.designer.roles.tab, formName, base)} hidden={!current.showLabel} empty={current.name} />
                {!current.visible ? <Hidden /> : null}
              </h3>
              <div className="mda__columns">
                {current.columns.map((col, ci) => (
                  <div key={ci} className="mda__column" style={{ flexBasis: columnBasis(col.width, current.columns.length) }}>
                    {col.sections.map((s) => (
                      <Section key={s.id || s.name} section={s} table={table} context={sectionContext(current)} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty">{S.preview.noTabs}</div>
          )}

          {layout.footer.length > 0 ? (
            <div className="mda__header mda__footer">
              {layout.footer.map((c, i) => (
                <div key={c.id || i} className="mda__headerfield">
                  <span className="small">
                    <LabelText labelRef={elementRef(d.index, table, c.id, c.labels, c.field, cellRole(c), `${formName} › ${S.designer.footer}`, base)} empty={c.field} />
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </CanvasNav.Provider>
  )
})

/** Tab caption with its open labels — both follow edits. */
function TabLabel({ labelRef, text, rows }: { labelRef: LabelRef; text: string; rows: readonly (LabelRow | null)[] }) {
  const d = useDesigner()
  const sig = useLiveValue((live) => {
    const own = labelRef.row ? (liveRow(live, d.pos, labelRef.row).values[d.lcid] ?? '') : ''
    return `${own}\u0001${gapsOf(countLive(live.gaps, d.pos, rows, d.lcid))}`
  })
  const [own, gaps] = sig.split('\u0001')
  const missing = labelRef.row !== null && !own
  const shown = labelRef.row ? own || labelRef.row.values[d.baseLanguage] || text : text
  return (
    <>
      {missing ? <em>{shown}</em> : shown}
      {Number(gaps) > 0 ? <span className="mda__count">{gaps}</span> : null}
    </>
  )
}

function Hidden() {
  return (
    <span className="badge mda__hidden" title={S.preview.hidden}>
      <EyeOffRegular aria-hidden /> {S.preview.hidden}
    </span>
  )
}

function Section({ section, table, context }: { section: FormSection; table: string; context: string }) {
  const d = useDesigner()
  const sectionContext = `${context} › ${section.labels[d.baseLanguage] || section.name}`
  return (
    <div className={`mda__section${section.visible ? '' : ' mda__section--hidden'}`}>
      <div className="mda__sectiontitle">
        <LabelText labelRef={elementRef(d.index, table, section.id, section.labels, '', S.designer.roles.section, context, d.baseLanguage)} hidden={!section.showLabel} empty={section.name} />
        {!section.visible ? <Hidden /> : null}
      </div>
      <div className="mda__grid" style={{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }}>
        {section.rows.flat().map((c, i) =>
          c.control === 'spacer' && Object.keys(c.labels).length === 0 ? (
            <div key={c.id || i} className="mda__cell mda__cell--spacer" style={{ gridColumn: `span ${Math.min(c.colspan, section.columns)}` }} />
          ) : (
            <div key={c.id || i} className={`mda__cell${c.visible ? '' : ' mda__cell--hidden'}`} style={{ gridColumn: `span ${Math.min(c.colspan, section.columns)}` }}>
              <div className="mda__label">
                <LabelText labelRef={elementRef(d.index, table, c.id, c.labels, c.field, cellRole(c), sectionContext, d.baseLanguage)} hidden={!c.showLabel} empty={c.field || c.controlId} />
              </div>
              <Control cell={c} />
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function Control({ cell }: { cell: FormCell }) {
  if (cell.control === 'field') return <span className="mda__value mda__mono">{cell.field}</span>
  const icon = cell.control === 'subgrid' ? <TableSimpleRegular aria-hidden /> : <GridRegular aria-hidden />
  return (
    <span className="mda__value mda__value--block">
      {icon} {S.preview.controls[cell.control]} <span className="mda__mono">{cell.controlId}</span>
    </span>
  )
}
