import { useState, type ReactNode } from 'react'
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
import type { ExplorerItem, ExplorerTree } from '../../utils/designerTree'
import type { StateCounts } from '../../utils/gaps'
import { coverageOf, gapsOf } from '../../utils/labelIndex'
import { S } from '../../strings'
import { targetKey, type DesignerTarget } from './context'

interface ExplorerProps {
  tree: ExplorerTree
  /** Counts per table (all labels of the table) in the canvas language. */
  tableCounts: ReadonlyMap<string, StateCounts>
  /** Counts per form/view/app id, as far as their definitions are loaded. */
  itemCounts: ReadonlyMap<string, StateCounts>
  target: DesignerTarget
  onSelect: (t: DesignerTarget) => void
  onShowOther: () => void
}

/** Navigation of the designer: apps, tables with forms and views, dashboards — with progress per entry. */
export function Explorer({ tree, tableCounts, itemCounts, target, onSelect, onShowOther }: ExplorerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const q = query.trim().toLowerCase()
  const hit = (s: string) => s.toLowerCase().includes(q)
  const activeTable = 'table' in target ? target.table : ''
  const current = targetKey(target)

  const isOpen = (table: string, hasHits: boolean) => !closed.has(table) && (open.has(table) || table === activeTable || (q !== '' && hasHits))
  const toggle = (table: string, expanded: boolean) => {
    const without = (s: ReadonlySet<string>) => new Set([...s].filter((x) => x !== table))
    setOpen((s) => (expanded ? without(s) : new Set([...s, table])))
    setClosed((s) => (expanded ? new Set([...s, table]) : without(s)))
  }

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
      <button key={key} type="button" className={`ex__item${key === current ? ' ex__item--active' : ''}`} onClick={() => onSelect(t)} title={name}>
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
    <aside className="ex" aria-label={S.designer.explorer}>
      <div className="ex__search">
        <Input size="small" contentBefore={<SearchRegular />} placeholder={S.designer.search} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={S.designer.search} />
      </div>
      <div className="ex__scroll">
        {item({ kind: 'home' }, <HomeRegular aria-hidden />, S.designer.home, undefined)}

        {apps.length > 0 || (tree.sitemaps.length > 0 && !q) ? (
          <div className="ex__group">
            <div className="ex__grouptitle">{S.designer.apps}</div>
            {apps.map((a) => item({ kind: 'app', id: a.id }, <AppsListRegular aria-hidden />, a.name, itemCounts.get(`app:${a.id}`)))}
            {apps.length === 0 && tree.sitemaps.length > 0
              ? tree.sitemaps.map((id) => item({ kind: 'app', id, sitemapOnly: true }, <AppsListRegular aria-hidden />, S.designer.sitemapOnly, itemCounts.get(`app:${id}`)))
              : null}
          </div>
        ) : null}

        <div className="ex__group">
          <div className="ex__grouptitle">
            {S.designer.tables} <span className="muted">{tree.tables.length}</span>
          </div>
          {tables.map(({ t, forms, views }) => {
            const expanded = isOpen(t.table, forms.length > 0 || views.length > 0)
            const counts = tableCounts.get(t.table)
            return (
              <div key={t.table} className={`ex__table${t.table === activeTable ? ' ex__table--active' : ''}`}>
                <div className="ex__tablerow">
                  <button type="button" className="ex__chevron" aria-label={expanded ? S.designer.collapse : S.designer.expand} aria-expanded={expanded} onClick={() => toggle(t.table, expanded)}>
                    {expanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
                  </button>
                  <button type="button" className={`ex__item ex__item--table${current === `table:${t.table}` ? ' ex__item--active' : ''}`} onClick={() => {
                      setClosed((s) => new Set([...s].filter((x) => x !== t.table)))
                      onSelect({ kind: 'table', table: t.table })
                    }} title={`${t.label} (${t.table})`}>
                    <Ring pct={counts ? coverageOf(counts) : 100} />
                    <span className="ex__name">
                      {t.label}
                      <span className="ex__sub">{t.table}</span>
                    </span>
                    <Badge counts={counts} />
                  </button>
                </div>
                {expanded ? (
                  <div className="ex__children">
                    {item({ kind: 'table', table: t.table }, <TableRegular aria-hidden />, S.designer.tableAndColumns, undefined)}
                    {forms.length > 0 ? <div className="ex__childtitle">{S.designer.forms}</div> : null}
                    {forms.map((f) => item({ kind: 'form', table: t.table, id: f.id }, <DocumentRegular aria-hidden />, f.name, itemCounts.get(`form:${f.id}`), formType(f)))}
                    {views.length > 0 ? <div className="ex__childtitle">{S.designer.views}</div> : null}
                    {views.map((v) => item({ kind: 'view', table: t.table, id: v.id }, <TableSimpleRegular aria-hidden />, v.name, itemCounts.get(`view:${v.id}`)))}
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
            {dashboards.map((b) => item({ kind: 'dashboard', id: b.id }, <BoardRegular aria-hidden />, b.name, itemCounts.get(`form:${b.id}`)))}
          </div>
        ) : null}

        {tree.other.length > 0 ? (
          <button type="button" className="ex__other" onClick={onShowOther}>
            <TextBulletListSquareRegular aria-hidden /> {S.designer.otherLabels(tree.other.length)}
          </button>
        ) : null}
      </div>
    </aside>
  )
}

const formType = (f: ExplorerItem) => (f.type !== undefined ? S.preview.formTypes[f.type] : undefined)

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
