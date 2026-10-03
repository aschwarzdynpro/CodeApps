import { memo, useMemo, type ReactElement } from 'react'
import { AppsListRegular, BoardRegular, DocumentRegular, SparkleRegular, TableRegular, TableSimpleRegular } from '@fluentui/react-icons'
import type { ExplorerTree } from '../../utils/designerTree'
import type { Lcid } from '../../types/translation'
import { countLive, coverageOf, gapsOf } from '../../utils/labelIndex'
import { languageName } from '../../utils/languages'
import { S } from '../../strings'
import { useDesigner, useLiveState, type DesignerTarget } from './context'

interface HomeCanvasProps {
  tree: ExplorerTree
  onSelect: (t: DesignerTarget) => void
  onLanguage: (lcid: Lcid) => void
}

/** Start page of the designer: coverage per language, what the solution contains, where the most work is. */
export const HomeCanvas = memo(function HomeCanvas({ tree, onSelect, onLanguage }: HomeCanvasProps) {
  const d = useDesigner()
  const live = useLiveState()
  const perLanguage = d.targets.map((l) => ({ lcid: l, counts: live.counts[l] ?? { missing: 0, untranslated: 0, changed: 0, ok: 0 } }))
  const tableCounts = useMemo(() => new Map(tree.tables.map((t) => [t.table, countLive(live.gaps, d.pos, t.rows, d.lcid)])), [tree, live.gaps, d.pos, d.lcid])
  const worst = tree.tables
    .map((t) => ({ t, gaps: gapsOf(tableCounts.get(t.table) ?? { missing: 0, untranslated: 0, changed: 0, ok: 0 }) }))
    .filter((x) => x.gaps > 0)
    .sort((a, b) => b.gaps - a.gaps)
    .slice(0, 8)
  const doneTables = tree.tables.filter((t) => {
    const c = tableCounts.get(t.table)
    return c !== undefined && gapsOf(c) === 0
  }).length
  const forms = tree.tables.reduce((n, t) => n + t.forms.length, 0)
  const views = tree.tables.reduce((n, t) => n + t.views.length, 0)
  const max = worst[0]?.gaps ?? 1

  return (
    <div className="canvas home">
      <section className="home__hero">
        <div>
          <span className="canvas__kicker">{S.designer.homeKicker}</span>
          <h2 className="home__title">{S.designer.homeTitle}</h2>
          <p className="muted">{S.designer.homeIntro}</p>
        </div>
        <div className="home__langs">
          {perLanguage.map(({ lcid, counts }) => {
            const pct = coverageOf(counts)
            return (
              <button key={lcid} type="button" className={`home__lang${lcid === d.lcid ? ' home__lang--current' : ''}`} onClick={() => onLanguage(lcid)}>
                <BigRing pct={pct} />
                <div>
                  <strong>{languageName(lcid)}</strong>
                  <div className="muted small">{S.designer.langSummary(gapsOf(counts), counts.changed)}</div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="home__stats">
        <Stat icon={<AppsListRegular />} value={tree.apps.length || tree.sitemaps.length} label={S.designer.apps} />
        <Stat icon={<TableRegular />} value={tree.tables.length} label={S.designer.tables} />
        <Stat icon={<DocumentRegular />} value={forms} label={S.designer.forms} />
        <Stat icon={<TableSimpleRegular />} value={views} label={S.designer.views} />
        <Stat icon={<BoardRegular />} value={tree.dashboards.length} label={S.preview.dashboards} />
      </section>

      <section className="home__work">
        <h3>{S.designer.mostWork}</h3>
        {worst.length === 0 ? (
          <p className="home__allgood">
            <SparkleRegular aria-hidden /> {S.designer.allTablesDone(languageName(d.lcid))}
          </p>
        ) : (
          <ul className="home__list">
            {worst.map(({ t, gaps }) => (
              <li key={t.table}>
                <button type="button" className="home__row" onClick={() => onSelect({ kind: 'table', table: t.table })}>
                  <span className="home__rowname">
                    {t.label} <span className="muted small">{t.table}</span>
                  </span>
                  <span className="home__rowbar">
                    <span style={{ width: `${(gaps / max) * 100}%` }} />
                  </span>
                  <span className="home__rowcount">{S.designer.gaps(gaps)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {doneTables > 0 ? <p className="muted small">{S.designer.tablesDone(doneTables, tree.tables.length)}</p> : null}
      </section>
    </div>
  )
})

function Stat({ icon, value, label }: { icon: ReactElement; value: number; label: string }) {
  return (
    <div className="home__stat">
      <span className="home__staticon" aria-hidden>
        {icon}
      </span>
      <strong>{value.toLocaleString('de-DE')}</strong>
      <span className="muted small">{label}</span>
    </div>
  )
}

function BigRing({ pct }: { pct: number }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <svg className={`ring ring--big${pct >= 100 ? ' ring--full' : ''}`} width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r={r} className="ring__bg" />
      <circle cx="28" cy="28" r={r} className="ring__fg" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 28 28)" />
      <text x="28" y="32" textAnchor="middle" className="ring__text">
        {Math.floor(pct)}%
      </text>
    </svg>
  )
}
