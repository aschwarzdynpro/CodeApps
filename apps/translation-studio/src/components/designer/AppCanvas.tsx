import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AppsRegular, ChevronDownRegular, NavigationRegular, SearchRegular, TableSimpleRegular } from '@fluentui/react-icons'
import type { AppRecord } from '../../types/translation'
import { countLive, gapsOf, labelKey } from '../../utils/labelIndex'
import type { SiteMapArea, SiteMapNode, SiteMapSubArea } from '../../utils/sitemapXml'
import { S } from '../../strings'
import { useDesigner, useLiveStore, type LabelRef } from './context'
import { LabelText } from './LabelText'
import { appRows, tableNameRow } from './refs'
import { CanvasHeader } from './CanvasHeader'
import { CanvasNav, jumpAfterRender } from './nav'

interface AppCanvasProps {
  /** Id of the `AppModule` rows in the file ('' when only a sitemap is known). */
  appId: string
  appName: string
  app: AppRecord | null
  areas: SiteMapArea[]
}

/**
 * The app as users see it: top bar with the app name, navigation from the
 * sitemap. Subareas of a table show the table's plural name (editable, it is
 * in the export); own sitemap titles are shown read only — the translation
 * export doesn't carry them.
 */
export const AppCanvas = memo(function AppCanvas({ appId, appName, app, areas }: AppCanvasProps) {
  const d = useDesigner()
  const store = useLiveStore()
  const [areaIndex, setAreaIndex] = useState(0)
  const [subId, setSubId] = useState<string | null>(null)
  const area = areas[Math.min(areaIndex, Math.max(0, areas.length - 1))] as SiteMapArea | undefined

  const nameRow = d.index.byId.get(labelKey(appId, 'name')) ?? null
  const descRow = d.index.byId.get(labelKey(appId, 'description')) ?? null
  const mapRow = app?.sitemap ? (d.index.byId.get(labelKey(app.sitemap.id, 'sitemapname')) ?? null) : null

  const nodeRef = (n: SiteMapNode, role: string, context: string): LabelRef => ({
    row: null,
    fallback: { ...n.titles, ...(n.title && !n.titles[d.baseLanguage] ? { [d.baseLanguage]: n.title } : {}) },
    role,
    context,
    id: n.id,
  })
  const subRef = (s: SiteMapSubArea, context: string): LabelRef => {
    const own = Object.keys(s.titles).length > 0 || s.title
    if (!own && s.entity) {
      const plural = tableNameRow(d.index, s.entity, 'LocalizedCollectionName')
      if (plural) return { row: plural, fallback: {}, fromColumn: true, role: S.designer.roles.tableMany, context }
      return { row: null, fallback: { [d.baseLanguage]: s.entity }, role: S.designer.roles.tableNotInSolution, context, id: s.id }
    }
    return nodeRef(s, S.designer.roles.subarea, context)
  }

  // Editable rows come from appRows (same source as the explorer); read-only sitemap titles are only reported.
  const rows = useMemo(() => appRows(d.index, appId, app?.sitemap?.id ?? '', areas), [d.index, appId, app, areas])
  const missingTitle = (n: SiteMapNode) => !!(n.titles[d.baseLanguage] || n.title) && !n.titles[d.lcid]
  const roMissing = areas.reduce(
    (sum, a) => sum + (missingTitle(a) ? 1 : 0) + a.groups.reduce((s2, g) => s2 + (missingTitle(g) ? 1 : 0) + g.subareas.filter((s) => (Object.keys(s.titles).length > 0 || s.title) && missingTitle(s)).length, 0),
    0,
  )
  const areaRows = useMemo(() => areas.map((a) => appRows(d.index, '', '', [a])), [areas, d.index])
  const root = useRef<HTMLDivElement>(null)
  const currentArea = area ? areas.indexOf(area) : 0
  // The visible area is done: go to the next area with gaps (cyclic), by the counts of now.
  const onExhausted = useCallback(
    (dir: 1 | -1) => {
      const live = store.get()
      const n = areas.length
      for (let step = 1; step < n; step++) {
        const i = (currentArea + dir * step + n) % n
        if (gapsOf(countLive(live.gaps, d.pos, areaRows[i], d.lcid)) > 0) {
          setAreaIndex(i)
          setSubId(null)
          jumpAfterRender(() => root.current?.querySelector('.app__nav'), dir)
          return true
        }
      }
      return false
    },
    [store, areas.length, currentArea, areaRows, d.pos, d.lcid],
  )
  const onAreaKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const n = areas.length
    const next = (currentArea + (e.key === 'ArrowRight' ? 1 : -1) + n) % n
    setAreaIndex(next)
    setSubId(null)
    ;(e.currentTarget.children[next] as HTMLElement | undefined)?.focus()
  }

  const appRef: LabelRef = { row: nameRow, fallback: { [d.baseLanguage]: app?.name || appName }, role: S.designer.roles.appName, context: appName }
  const selectedSub = area?.groups.flatMap((g) => g.subareas).find((s) => s.id === subId) ?? area?.groups[0]?.subareas[0]
  const areaTitle = (a: SiteMapArea) => a.titles[d.lcid] || a.titles[d.baseLanguage] || a.title || a.id

  return (
    <CanvasNav.Provider value={onExhausted}>
      <div className="canvas" data-canvas="1" ref={root}>
        <CanvasHeader
          kicker={`${S.designer.kinds.app}${app?.uniqueName ? ` · ${app.uniqueName}` : ''}`}
          title={<LabelText labelRef={appRef} className="lt--title" empty={appName} echo />}
          sub={descRow ? <LabelText labelRef={{ row: descRow, fallback: {}, role: S.designer.roles.appDescription, context: appName }} /> : null}
          rows={rows}
          note={roMissing > 0 ? S.designer.sitemapNote(roMissing) : S.designer.sitemapNoteNone}
        />
        <div className="app">
          <div className="app__bar">
            <NavigationRegular aria-hidden />
            <span className="app__name">
              <LabelText labelRef={appRef} empty={appName} />
            </span>
            <span className="app__search">
              <SearchRegular aria-hidden />
            </span>
          </div>
          <div className="app__body">
            <nav className="app__nav" aria-label={S.designer.navigation}>
              {area ? (
                area.groups.map((g) => {
                  const context = `${appName} › ${areaTitle(area)}`
                  return (
                    <div key={g.id} className="app__group">
                      <div className="app__grouptitle">
                        <LabelText labelRef={nodeRef(g, S.designer.roles.group, context)} empty={g.id} />
                      </div>
                      {g.subareas.map((s) => (
                        <div
                          key={s.id}
                          className={`app__sub${s === selectedSub ? ' app__sub--active' : ''}`}
                          onClickCapture={() => setSubId(s.id)}
                          onKeyDownCapture={(e) => {
                            if (e.key === 'Enter' || e.key === 'F2' || e.key === ' ') setSubId(s.id)
                          }}
                        >
                          {s.entity ? <TableSimpleRegular aria-hidden /> : <AppsRegular aria-hidden />}
                          <LabelText labelRef={subRef(s, `${context} › ${g.titles[d.baseLanguage] || g.id}`)} empty={s.id} />
                        </div>
                      ))}
                    </div>
                  )
                })
              ) : (
                <div className="muted small app__empty">{S.designer.noSitemap}</div>
              )}
              {areas.length > 0 ? (
                <div className="app__areas">
                  {areas.length > 1 ? (
                    <div className="app__areapick" role="tablist" aria-label={S.designer.areas} onKeyDown={onAreaKey}>
                      {areas.map((a, i) => (
                        <button
                          key={a.id}
                          type="button"
                          role="tab"
                          tabIndex={a === area ? 0 : -1}
                          aria-selected={a === area}
                          className={`app__area${a === area ? ' app__area--active' : ''}`}
                          onClick={() => {
                            setAreaIndex(i)
                            setSubId(null)
                          }}
                        >
                          {areaTitle(a)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {area ? (
                    <div className="app__areacurrent">
                      <LabelText labelRef={nodeRef(area, S.designer.roles.area, appName)} empty={area.id} />
                      <ChevronDownRegular aria-hidden />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </nav>
            <main className="app__main">
              {selectedSub ? (
                <>
                  <div className="app__pagehead">
                    <LabelText labelRef={subRef(selectedSub, `${appName} › ${area ? areaTitle(area) : ''}`)} className="lt--title" empty={selectedSub.id} echo />
                    <ChevronDownRegular aria-hidden />
                  </div>
                  <div className="app__rows" aria-hidden>
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className="app__rowbar" style={{ width: `${55 + ((i * 29) % 40)}%` }} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="muted">{S.designer.noSubareas}</div>
              )}
              {mapRow ? (
                <p className="muted small app__mapname">
                  {S.designer.sitemapName}: <LabelText labelRef={{ row: mapRow, fallback: {}, role: S.designer.roles.sitemapName, context: appName }} />
                </p>
              ) : null}
            </main>
          </div>
        </div>
      </div>
    </CanvasNav.Provider>
  )
})
