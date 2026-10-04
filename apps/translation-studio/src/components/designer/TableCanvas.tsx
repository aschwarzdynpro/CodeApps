import { memo, useMemo, useRef, useState, type RefObject } from 'react'
import { Input, Switch } from '@fluentui/react-components'
import { CheckmarkCircleFilled, DocumentRegular, SearchRegular, TableSimpleRegular } from '@fluentui/react-icons'
import type { ChoiceGroup, LabelRow } from '../../types/translation'
import { kindOf } from '../../utils/gaps'
import { tableCanvasRows, type ExplorerItem } from '../../utils/designerTree'
import { columnRow, countLive, gapsOf } from '../../utils/labelIndex'
import { S } from '../../strings'
import { liveRow, liveState, useDesigner, useLiveValue, type DesignerTarget, type LabelRef, type Live } from './context'
import { LabelText } from './LabelText'
import { CanvasHeader } from './CanvasHeader'

interface TableCanvasProps {
  table: string
  label: string
  /** Every label row of the table (structure rows). */
  rows: LabelRow[]
  /** Options per choice column; null while loading or when the metadata isn't readable. */
  choices: ChoiceGroup[] | null
  forms: ExplorerItem[]
  views: ExplorerItem[]
  /** File rows per loaded form/view (`form:id`, `view:id`), for their counters. */
  itemRows: ReadonlyMap<string, readonly (LabelRow | null)[]>
  onSelect: (t: DesignerTarget) => void
}

interface ColumnEntry {
  id: string
  logical: string
  display?: LabelRow
  description?: LabelRow
}

interface ChoiceEntry {
  display?: LabelRow
  description?: LabelRow
}

/** Table profile: names, columns (display name + description) and choice values grouped by their column. */
export const TableCanvas = memo(function TableCanvas({ table, label, rows, choices, forms, views, itemRows, onSelect }: TableCanvasProps) {
  const d = useDesigner()
  const [search, setSearch] = useState('')
  const [gapsOnly, setGapsOnly] = useState(false)
  const base = d.baseLanguage

  const model = useMemo(() => {
    const onCanvas = tableCanvasRows(rows, d.components, d.resolving)
    const columns = new Map<string, ColumnEntry>()
    const choiceRows = new Map<string, ChoiceEntry>()
    const other: LabelRow[] = []
    for (const r of onCanvas) {
      const kind = kindOf(r, d.components)
      if (kind === 'table') continue
      if (kind === 'column') {
        const c = columns.get(r.objectId) ?? { id: r.objectId, logical: d.components.get(r.objectId)?.name ?? '' }
        if (r.column === 'DisplayName') c.display = r
        else if (r.column === 'Description') c.description = r
        columns.set(r.objectId, c)
      } else if (kind === 'choice') {
        const c = choiceRows.get(r.objectId) ?? {}
        if (r.column === 'DisplayName') c.display = r
        else c.description = r
        choiceRows.set(r.objectId, c)
      } else other.push(r)
    }
    // Group choice values under their column: by option MetadataId, else by unique base text.
    const groups: { attribute: string; entries: ChoiceEntry[] }[] = []
    const used = new Set<string>()
    if (choices) {
      const byText = new Map<string, string[]>()
      for (const [id, c] of choiceRows) {
        const t = c.display?.values[base] ?? ''
        byText.set(t, [...(byText.get(t) ?? []), id])
      }
      for (const g of choices) {
        const entries: ChoiceEntry[] = []
        for (const o of g.options) {
          let id = o.metadataId && choiceRows.has(o.metadataId) ? o.metadataId : ''
          if (!id) {
            const candidates = (byText.get(o.label) ?? []).filter((x) => !used.has(x))
            if (candidates.length === 1) id = candidates[0]
          }
          if (id && !used.has(id)) {
            used.add(id)
            entries.push(choiceRows.get(id)!)
          }
        }
        if (entries.length > 0) groups.push({ attribute: g.attribute, entries })
      }
    }
    const rest = [...choiceRows].filter(([id]) => !used.has(id)).map(([, c]) => c)
    const sortKey = (c: ColumnEntry) => (c.display?.values[base] || c.logical).toLowerCase()
    const names = d.index.tableNames.get(table) ?? {}
    const canvasSet = new Set(onCanvas.map((r) => r.key))
    return {
      names,
      columns: [...columns.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
      groups,
      rest,
      other,
      onCanvas,
      // Labels of this table that live on its form and view canvases.
      elsewhere: rows.filter((r) => !canvasSet.has(r.key)),
    }
  }, [rows, choices, d.components, d.resolving, d.index, table, base])

  const ref = (row: LabelRow | undefined, role: string, context = label): LabelRef => ({ row: row ?? null, fallback: {}, role, context })
  // Sections of a long canvas (account: 260+ columns) and the jump bar in the sticky head.
  const namesRef = useRef<HTMLElement>(null)
  const elsewhereRef = useRef<HTMLElement>(null)
  const columnsRef = useRef<HTMLElement>(null)
  const choicesRef = useRef<HTMLElement>(null)
  const otherRef = useRef<HTMLElement>(null)
  const choiceCount = model.groups.reduce((n, g) => n + g.entries.length, 0) + model.rest.length
  const showElsewhere = forms.length > 0 || views.length > 0 || model.elsewhere.length > 0
  const jump = (target: RefObject<HTMLElement | null>) => target.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  const jumpBar = (
    <nav className="tc__jumps" aria-label={S.designer.jumpTo}>
      <button type="button" onClick={() => jump(namesRef)}>
        {S.designer.jumpNames}
      </button>
      {showElsewhere ? (
        <button type="button" onClick={() => jump(elsewhereRef)}>
          {S.designer.formsAndViews} <span>{forms.length + views.length}</span>
        </button>
      ) : null}
      <button type="button" onClick={() => jump(columnsRef)}>
        {S.designer.columns} <span>{model.columns.length}</span>
      </button>
      {choiceCount > 0 ? (
        <button type="button" onClick={() => jump(choicesRef)}>
          {S.designer.choices} <span>{choiceCount}</span>
        </button>
      ) : null}
      {model.other.length > 0 ? (
        <button type="button" onClick={() => jump(otherRef)}>
          {S.designer.jumpOther} <span>{model.other.length}</span>
        </button>
      ) : null}
    </nav>
  )
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  // With a filter, which columns show depends on the current texts and states.
  const filterSig = useLiveValue((live) => {
    if (!gapsOnly && words.length === 0) return ''
    const isGap = (r?: LabelRow) => {
      const s = r ? liveState(live, d.pos, r, d.lcid) : undefined
      return s === 'missing' || s === 'untranslated' || s === 'changed'
    }
    const text = (live2: Live, r?: LabelRow) => (r ? Object.values(liveRow(live2, d.pos, r).values).join(' ') : '')
    const hits = model.columns.filter((c) => {
      if (gapsOnly && !isGap(c.display) && !isGap(c.description)) return false
      if (words.length === 0) return true
      const hay = `${c.logical} ${text(live, c.display)} ${text(live, c.description)}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    return hits.map((c) => c.id).join(',') || '-'
  })
  const visibleColumns = useMemo(() => {
    if (filterSig === '') return model.columns
    const ids = new Set(filterSig.split(','))
    return model.columns.filter((c) => ids.has(c.id))
  }, [filterSig, model.columns])

  const choiceList = (entries: ChoiceEntry[], context: string) => (
    <div className="tc__choices">
      {entries.map((e, i) => (
        <span key={e.display?.key ?? e.description?.key ?? i} className="tc__choice">
          <LabelText labelRef={ref(e.display, S.designer.roles.choice, context)} />
          {e.description ? (
            <span className="tc__choicedesc small">
              <LabelText labelRef={ref(e.description, S.designer.roles.choiceDescription, context)} />
            </span>
          ) : null}
        </span>
      ))}
    </div>
  )

  return (
    <div className="canvas" data-canvas="1">
      <CanvasHeader
        kicker={`${S.designer.kinds.table} · ${table}`}
        title={<LabelText labelRef={ref(model.names.one, S.designer.roles.tableOne)} className="lt--title" empty={table} echo />}
        rows={model.onCanvas}
        nav={jumpBar}
      />
      <div className="tc">
        <section className="tc__card" ref={namesRef}>
          <h4 className="tc__cardtitle">{S.designer.tableNames}</h4>
          <div className="tc__names">
            <span className="tc__key">{S.designer.roles.tableOne}</span>
            <LabelText labelRef={ref(model.names.one, S.designer.roles.tableOne)} empty={table} />
            <span className="tc__key">{S.designer.roles.tableMany}</span>
            <LabelText labelRef={ref(model.names.many, S.designer.roles.tableMany)} empty="—" />
            <span className="tc__key">{S.designer.roles.tableDescription}</span>
            <LabelText labelRef={ref(model.names.description, S.designer.roles.tableDescription)} empty="—" />
          </div>
        </section>

        {showElsewhere ? <Elsewhere sectionRef={elsewhereRef} table={table} rows={model.elsewhere} forms={forms} views={views} itemRows={itemRows} onSelect={onSelect} /> : null}

        <section className="tc__card" ref={columnsRef}>
          <div className="tc__cardhead">
            <h4 className="tc__cardtitle">
              {S.designer.columns} <span className="muted small">{model.columns.length}</span>
            </h4>
            <Input size="small" contentBefore={<SearchRegular />} placeholder={S.designer.searchColumns} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={S.designer.searchColumns} />
            <Switch label={S.designer.gapsOnly} checked={gapsOnly} onChange={(_, v) => setGapsOnly(v.checked)} />
          </div>
          {visibleColumns.length === 0 ? (
            <div className="muted small tc__none">{model.columns.length === 0 ? S.designer.noColumnsInFile : S.designer.noMatch}</div>
          ) : (
            <div className="tc__columns" role="list">
              {visibleColumns.map((c) => {
                const context = `${label} › ${c.logical || c.display?.values[base] || c.id}`
                return (
                  <div key={c.id} className="tc__column" role="listitem">
                    <div className="tc__colname">
                      <LabelText labelRef={ref(c.display, S.designer.roles.columnName, context)} empty={c.logical} />
                      {c.logical ? <span className="tc__logical">{c.logical}</span> : null}
                    </div>
                    <div className="tc__coldesc small">
                      {c.description ? <LabelText labelRef={ref(c.description, S.designer.roles.columnDescription, context)} /> : <span className="muted">—</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {model.groups.length > 0 || model.rest.length > 0 ? (
          <section className="tc__card" ref={choicesRef}>
            <h4 className="tc__cardtitle">{S.designer.choices}</h4>
            {choices === null ? <p className="muted small">{S.designer.choicesUngrouped}</p> : null}
            {model.groups.map((g) => {
              const column = columnRow(d.index, table, g.attribute)
              return (
                <div key={g.attribute} className="tc__group">
                  <div className="tc__grouphead">
                    {/* The column name is edited in the list above; here it only heads the group. */}
                    <LabelText labelRef={ref(column, S.designer.roles.columnName, `${label} › ${g.attribute}`)} empty={g.attribute} echo />
                    <span className="tc__logical">{g.attribute}</span>
                  </div>
                  {choiceList(g.entries, `${label} › ${g.attribute}`)}
                </div>
              )
            })}
            {model.rest.length > 0 ? (
              <div className="tc__group">
                {model.groups.length > 0 ? <div className="tc__grouphead muted">{S.designer.moreChoices}</div> : null}
                {choiceList(model.rest, label)}
              </div>
            ) : null}
          </section>
        ) : null}

        {model.other.length > 0 ? (
          <section className="tc__card" ref={otherRef}>
            <h4 className="tc__cardtitle">{S.designer.moreLabels}</h4>
            <div className="tc__names">
              {model.other.map((r) => (
                <OtherRow key={r.key} row={r} labelRef={ref(r, r.column, label)} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
})

const ELSEWHERE_LIMIT = 12

interface ElsewhereProps {
  sectionRef: RefObject<HTMLElement | null>
  table: string
  rows: LabelRow[]
  forms: ExplorerItem[]
  views: ExplorerItem[]
  itemRows: ReadonlyMap<string, readonly (LabelRow | null)[]>
  onSelect: (t: DesignerTarget) => void
}

/** Forms and views of the table with their open labels — the ones with work first, the rest on request. */
function Elsewhere({ sectionRef, table, rows, forms, views, itemRows, onSelect }: ElsewhereProps) {
  const d = useDesigner()
  const [all, setAll] = useState(false)
  const items = [
    ...forms.map((f) => ({ key: `form:${f.id}`, name: f.name, target: { kind: 'form', table, id: f.id } as DesignerTarget, icon: <DocumentRegular aria-hidden /> })),
    ...views.map((v) => ({ key: `view:${v.id}`, name: v.name, target: { kind: 'view', table, id: v.id } as DesignerTarget, icon: <TableSimpleRegular aria-hidden /> })),
  ]
  // Total of the table's form/view labels, then the open labels per item (-1: definition not loaded).
  const sig = useLiveValue((live) => {
    const per = items.map((it) => {
      const r = itemRows.get(it.key)
      return r ? gapsOf(countLive(live.gaps, d.pos, r, d.lcid)) : -1
    })
    return `${gapsOf(countLive(live.gaps, d.pos, rows, d.lcid))}|${per.join(',')}`
  })
  const [totalText, perText] = sig.split('|')
  const total = Number(totalText)
  const per = perText ? perText.split(',').map(Number) : []
  const ranked = items.map((it, i) => ({ ...it, gaps: per[i] ?? -1 })).sort((a, b) => Math.max(b.gaps, 0) - Math.max(a.gaps, 0))
  const shown = all ? ranked : ranked.slice(0, ELSEWHERE_LIMIT)
  return (
    <section className="tc__card tc__elsewhere" ref={sectionRef}>
      <h4 className="tc__cardtitle">
        {S.designer.formsAndViews} <span className="muted small">{items.length}</span>
        {total > 0 ? <span className="ex__badge">{total.toLocaleString('de-DE')}</span> : null}
      </h4>
      <p className="muted small">{total > 0 ? S.designer.elsewhereGaps(total) : S.designer.elsewhereNote}</p>
      <div className="tc__links">
        {shown.map((it) => (
          <button key={it.key} type="button" className="tc__link" onClick={() => onSelect(it.target)} title={it.name}>
            {it.icon}
            <span className="tc__linkname">{it.name}</span>
            {it.gaps > 0 ? <span className="ex__badge">{it.gaps}</span> : it.gaps === 0 ? <CheckmarkCircleFilled className="ex__ok" aria-label={S.designer.done} /> : null}
          </button>
        ))}
        {ranked.length > ELSEWHERE_LIMIT ? (
          <button type="button" className="tc__more" onClick={() => setAll(!all)}>
            {all ? S.designer.showLess : S.designer.showAll(ranked.length)}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function OtherRow({ row, labelRef }: { row: LabelRow; labelRef: LabelRef }) {
  return (
    <>
      <span className="tc__key tc__logical" title={row.objectId}>
        {row.column}
      </span>
      <LabelText labelRef={labelRef} />
    </>
  )
}
