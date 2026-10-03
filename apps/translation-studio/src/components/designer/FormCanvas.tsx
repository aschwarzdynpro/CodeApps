import { useCallback, useMemo, useRef, useState } from 'react'
import { EyeOffRegular, GridRegular, TableSimpleRegular } from '@fluentui/react-icons'
import { columnBasis, type FormCell, type FormLayout, type FormSection } from '../../utils/formXml'
import { countRows, gapsOf } from '../../utils/labelIndex'
import { S } from '../../strings'
import { useDesigner } from './context'
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
export function FormCanvas({ formId, formName, table, type, layout }: FormCanvasProps) {
  const d = useDesigner()
  const [tab, setTab] = useState(0)
  const refs = useMemo(() => formRefs(d.index, formId, table, formName, layout, d.baseLanguage), [d.index, formId, table, formName, layout, d.baseLanguage])
  const counts = useMemo(() => countRows(rowsOf(refs), d.lcid, d.baseLanguage, d.acknowledged), [refs, d.lcid, d.baseLanguage, d.acknowledged])
  const tabCounts = useMemo(
    () => layout.tabs.map((t) => gapsOf(countRows(rowsOf(tabRefs(d.index, table, formName, t, d.baseLanguage)), d.lcid, d.baseLanguage, d.acknowledged))),
    [layout, d.index, table, formName, d.lcid, d.baseLanguage, d.acknowledged],
  )
  const current = layout.tabs[Math.min(tab, layout.tabs.length - 1)]
  const currentIndex = current ? layout.tabs.indexOf(current) : 0
  const root = useRef<HTMLDivElement>(null)
  // The visible tab is done in the direction of travel: go to the next tab with gaps (cyclic).
  const onExhausted = useCallback(
    (dir: 1 | -1) => {
      const n = layout.tabs.length
      for (let step = 1; step < n; step++) {
        const i = (currentIndex + dir * step + n) % n
        if (tabCounts[i] > 0) {
          setTab(i)
          jumpAfterRender(() => root.current?.querySelector('.mda__tabbody'), dir)
          return true
        }
      }
      return false
    },
    [layout.tabs.length, currentIndex, tabCounts],
  )
  const description = refs.find((r) => r.role === S.designer.roles.formDescription) ?? null
  const sectionContext = (t: FormLayout['tabs'][number]) => `${formName} › ${t.labels[d.baseLanguage] || t.name}`

  return (
    <CanvasNav.Provider value={onExhausted}>
      <div className="canvas" data-canvas="1" ref={root}>
        <CanvasHeader
          kicker={`${S.preview.formTypes[type ?? -1] ?? S.preview.formTypeOther}${table ? ` · ${table}` : ''}`}
          title={<LabelText labelRef={refs[0]} className="lt--title" empty={formName} />}
          sub={description ? <LabelText labelRef={description} /> : null}
          counts={counts}
          rows={rowsOf(refs)}
        />
        <div className="mda">
          {layout.header.length > 0 ? (
            <div className="mda__header">
              {layout.header.map((c, i) => (
                <div key={c.id || i} className="mda__headerfield">
                  <span className="small">
                    <LabelText labelRef={elementRef(d.index, table, c.id, c.labels, c.field, cellRole(c), `${formName} › ${S.designer.header}`)} empty={c.field} />
                  </span>
                  <span className="mda__value mda__value--small">—</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mda__tabs" role="tablist">
            {layout.tabs.map((t, i) => {
              const r = elementRef(d.index, table, t.id, t.labels, '', S.designer.roles.tab, formName)
              const text = r.row ? r.row.values[d.lcid] || r.row.values[d.baseLanguage] : t.labels[d.lcid] || t.labels[d.baseLanguage] || t.name
              const missing = r.row ? !r.row.values[d.lcid] : false
              return (
                <button
                  key={t.id || i}
                  type="button"
                  role="tab"
                  aria-selected={t === current}
                  className={`mda__tab${t === current ? ' mda__tab--active' : ''}${t.visible ? '' : ' mda__tab--hidden'}`}
                  onClick={() => setTab(i)}
                >
                  {missing ? <em>{text}</em> : text}
                  {tabCounts[i] > 0 ? <span className="mda__count">{tabCounts[i]}</span> : null}
                </button>
              )
            })}
          </div>

          {current ? (
            <div className="mda__tabbody" role="tabpanel">
              <h3 className="mda__tabtitle">
                <LabelText labelRef={elementRef(d.index, table, current.id, current.labels, '', S.designer.roles.tab, formName)} hidden={!current.showLabel} empty={current.name} />
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
                    <LabelText labelRef={elementRef(d.index, table, c.id, c.labels, c.field, cellRole(c), `${formName} › ${S.designer.footer}`)} empty={c.field} />
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </CanvasNav.Provider>
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
        <LabelText labelRef={elementRef(d.index, table, section.id, section.labels, '', S.designer.roles.section, context)} hidden={!section.showLabel} empty={section.name} />
        {!section.visible ? <Hidden /> : null}
      </div>
      <div className="mda__grid" style={{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }}>
        {section.rows.flat().map((c, i) =>
          c.control === 'spacer' && Object.keys(c.labels).length === 0 ? (
            <div key={c.id || i} className="mda__cell mda__cell--spacer" style={{ gridColumn: `span ${Math.min(c.colspan, section.columns)}` }} />
          ) : (
            <div key={c.id || i} className={`mda__cell${c.visible ? '' : ' mda__cell--hidden'}`} style={{ gridColumn: `span ${Math.min(c.colspan, section.columns)}` }}>
              <div className="mda__label">
                <LabelText labelRef={elementRef(d.index, table, c.id, c.labels, c.field, cellRole(c), sectionContext)} hidden={!c.showLabel} empty={c.field || c.controlId} />
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
