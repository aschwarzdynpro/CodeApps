import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Input } from '@fluentui/react-components'
import {
  AppsListRegular,
  BoardRegular,
  CheckmarkCircleFilled,
  ChevronDownRegular,
  ChevronRightRegular,
  DocumentRegular,
  HomeRegular,
  SearchRegular,
  TableRegular,
  TableSimpleRegular,
  TextBulletListSquareRegular,
} from '@fluentui/react-icons'
import type { LabelRow } from '../../types/translation'
import type { ExplorerTable, ExplorerTree } from '../../utils/designerTree'
import type { StateCounts } from '../../utils/gaps'
import { countLive, coverageOf, gapsOf } from '../../utils/labelIndex'
import { S } from '../../strings'
import { targetKey, useDesigner, useLiveState, type DesignerTarget } from './context'
import { formType, viewType } from './itemTypes'

interface ExplorerProps {
  tree: ExplorerTree
  /** Sitemap ids listed as entries of their own (no app of the file uses them). */
  loneSitemaps: readonly string[]
  /** File rows per form/view/app (`form:id`, `view:id`, `app:id`), as far as their definitions are loaded. */
  itemRows: ReadonlyMap<string, readonly (LabelRow | null)[]>
  /** `querytype` per view whose definition is loaded. */
  viewTypes: ReadonlyMap<string, number>
  /** File rows the table canvas shows, per table. */
  canvasRows: ReadonlyMap<string, readonly LabelRow[]>
  target: DesignerTarget
  onSelect: (t: DesignerTarget) => void
  onShowOther: () => void
}

/** Navigation of the designer: apps, tables with forms and views, dashboards — with progress per entry. */
export const Explorer = memo(function Explorer({ tree, loneSitemaps, itemRows, viewTypes, canvasRows, target, onSelect, onShowOther }: ExplorerProps) {
  const d = useDesigner()
  const live = useLiveState()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const q = query.trim().toLowerCase()
  const hit = (s: string) => s.toLowerCase().includes(q)
  const activeTable = 'table' in target ? target.table : ''
  const current = targetKey(target)
  const root = useRef<HTMLElement>(null)
  // Coming from the breadcrumb or the home page: bring the entry into view.
  useEffect(() => {
    window.requestAnimationFrame(() => root.current?.querySelector('.ex__item--active')?.scrollIntoView({ block: 'nearest' }))
  }, [current])

  // Per edit: one pass over the precomputed states, then only the table entries whose numbers changed re-render.
  const tableCounts = useMemo(() => new Map(tree.tables.map((t) => [t.table, countLive(live.gaps, d.pos, t.rows, d.lcid)])), [tree, live.gaps, d.pos, d.lcid])
  const countOf = (rows: readonly (LabelRow | null)[] | undefined) => (rows ? countLive(live.gaps, d.pos, rows, d.lcid) : undefined)

  const isOpen = (table: string, hasHits: boolean) => !closed.has(table) && (open.has(table) || table === activeTable || (q !== '' && hasHits))
  // Stable, so the memoized table lines don't re-render for nothing.
  const toggle = useCallback((table: string, expanded: boolean) => {
    const without = (s: ReadonlySet<string>) => new Set([...s].filter((x) => x !== table))
    setOpen((s) => (expanded ? without(s) : new Set([...s, table])))
    setClosed((s) => (expanded ? new Set([...s, table]) : without(s)))
  }, [])
  const selectTable = useCallback(
    (table: string) => {
      setClosed((s) => new Set([...s].filter((x) => x !== table)))
      onSelect({ kind: 'table', table })
    },
    [onSelect],
  )

  const tables = tree.tables
    .map((t) => {
      if (!q) return { t, forms: t.forms, views: t.views }
      const own = hit(t.label) || hit(t.table)
      return { t, forms: own ? t.forms : t.forms.filter((f) => hit(f.name)), views: own ? t.views : t.views.filter((v) => hit(v.name)), own }
    })
    .filter((x) => !q || x.own || x.forms.length > 0 || x.views.length > 0)
  const apps = tree.apps.filter((a) => !q || hit(a.name))
  const dashboards = tree.dashboards.filter((a) => !q || hit(a.name))

  const item = (t: DesignerTarget, icon: ReactNode, name: string, counts: StateCounts | undefined, sub?: string) => {
    const key = targetKey(t)
    return (
      <button key={key} type="button" className={`ex__item${key === current ? ' ex__item--active' : ''}`} aria-current={key === current ? 'page' : undefined} onClick={() => onSelect(t)} title={name}>
        {icon}
        <span className="ex__name">
          {name}
          {sub ? <span className="ex__sub">{sub}</span> : null}
        </span>
        <Badge counts={counts} />
      </button>
    )
  }

  return (
    <aside className="ex" aria-label={S.designer.explorer} ref={root}>
      <div className="ex__search">
        <Input size="small" contentBefore={<SearchRegular />} placeholder={S.designer.search} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={S.designer.search} />
      </div>
      <div className="ex__scroll">
        {item({ kind: 'home' }, <HomeRegular aria-hidden />, S.designer.home, undefined)}

        {apps.length > 0 || (loneSitemaps.length > 0 && !q) ? (
          <div className="ex__group">
            <div className="ex__grouptitle">{S.designer.apps}</div>
            {apps.map((a) => item({ kind: 'app', id: a.id }, <AppsListRegular aria-hidden />, a.name, countOf(itemRows.get(`app:${a.id}`))))}
            {!q ? loneSitemaps.map((id) => item({ kind: 'app', id, sitemapOnly: true }, <AppsListRegular aria-hidden />, S.designer.sitemapOnly, countOf(itemRows.get(`app:${id}`)))) : null}
          </div>
        ) : null}

        <div className="ex__group">
          <div className="ex__grouptitle">
            {S.designer.tables} <span className="muted">{tree.tables.length}</span>
          </div>
          {tables.map(({ t, forms, views }) => {
            const expanded = isOpen(t.table, forms.length > 0 || views.length > 0)
            const c = tableCounts.get(t.table)
            return (
              <div key={t.table} className={`ex__table${t.table === activeTable ? ' ex__table--active' : ''}`}>
                <TableHead
                  t={t}
                  expanded={expanded}
                  active={current === `table:${t.table}`}
                  missing={c?.missing ?? 0}
                  untranslated={c?.untranslated ?? 0}
                  changed={c?.changed ?? 0}
                  ok={c?.ok ?? 0}
                  onToggle={toggle}
                  onSelect={selectTable}
                />
                {expanded ? (
                  <div className="ex__children">
                    {item({ kind: 'table', table: t.table }, <TableRegular aria-hidden />, S.designer.tableAndColumns, countOf(canvasRows.get(t.table)))}
                    {forms.length > 0 ? <div className="ex__childtitle">{S.designer.forms}</div> : null}
                    {forms.map((f) => item({ kind: 'form', table: t.table, id: f.id }, <DocumentRegular aria-hidden />, f.name, countOf(itemRows.get(`form:${f.id}`)), formType(f)))}
                    {views.length > 0 ? <div className="ex__childtitle">{S.designer.views}</div> : null}
                    {views.map((v) => item({ kind: 'view', table: t.table, id: v.id }, <TableSimpleRegular aria-hidden />, v.name, countOf(itemRows.get(`view:${v.id}`)), viewType(viewTypes, v.id)))}
                    {forms.length === 0 && views.length === 0 ? <div className="ex__none">{S.designer.noFormsViews}</div> : null}
                  </div>
                ) : null}
              </div>
            )
          })}
          {tables.length === 0 ? <div className="ex__none">{S.designer.noMatch}</div> : null}
        </div>

        {dashboards.length > 0 ? (
          <div className="ex__group">
            <div className="ex__grouptitle">{S.preview.dashboards}</div>
            {dashboards.map((b) => item({ kind: 'dashboard', id: b.id }, <BoardRegular aria-hidden />, b.name, countOf(itemRows.get(`form:${b.id}`))))}
          </div>
        ) : null}

        {tree.otherCount > 0 ? (
          <button type="button" className="ex__other" onClick={onShowOther}>
            <TextBulletListSquareRegular aria-hidden /> {S.designer.otherLabels(tree.otherCount)}
          </button>
        ) : null}
      </div>
    </aside>
  )
})

interface TableHeadProps {
  t: ExplorerTable
  expanded: boolean
  active: boolean
  missing: number
  untranslated: number
  changed: number
  ok: number
  onToggle: (table: string, expanded: boolean) => void
  onSelect: (table: string) => void
}

/** One table line; re-renders only when its own numbers or flags change. */
const TableHead = memo(function TableHead({ t, expanded, active, missing, untranslated, changed, ok, onToggle, onSelect }: TableHeadProps) {
  const counts = { missing, untranslated, changed, ok }
  return (
    <div className="ex__tablerow">
      <button type="button" className="ex__chevron" aria-label={expanded ? S.designer.collapse : S.designer.expand} aria-expanded={expanded} onClick={() => onToggle(t.table, expanded)}>
        {expanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
      </button>
      <button type="button" className={`ex__item ex__item--table${active ? ' ex__item--active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => onSelect(t.table)} title={`${t.label} (${t.table})`}>
        <Ring pct={coverageOf(counts)} />
        <span className="ex__name">
          {t.label}
          <span className="ex__sub">{t.table}</span>
        </span>
        <Badge counts={counts} />
      </button>
    </div>
  )
})


function Badge({ counts }: { counts: StateCounts | undefined }) {
  if (!counts) return null
  const gaps = gapsOf(counts)
  if (gaps > 0) return <span className="ex__badge">{gaps.toLocaleString('de-DE')}</span>
  if (counts.changed > 0) return <span className="ex__badge ex__badge--changed" title={S.designer.changed(counts.changed)}>{counts.changed}</span>
  return <CheckmarkCircleFilled className="ex__ok" aria-label={S.designer.done} />
}

/** Small progress ring (share translated). */
function Ring({ pct }: { pct: number }) {
  const r = 7
  const c = 2 * Math.PI * r
  return (
    <svg className={`ring${pct >= 100 ? ' ring--full' : ''}`} width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r={r} className="ring__bg" />
      <circle cx="9" cy="9" r={r} className="ring__fg" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 9 9)" />
    </svg>
  )
}
