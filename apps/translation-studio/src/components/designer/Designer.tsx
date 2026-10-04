import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Popover, PopoverSurface, PopoverTrigger, ToggleButton } from '@fluentui/react-components'
import {
  HighlightRegular,
  KeyboardRegular,
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
  PanelRightContractRegular,
  PanelRightExpandRegular,
  SubtitlesRegular,
} from '@fluentui/react-icons'
import type { TranslationService } from '../../services/translationService'
import { useLoad, type LoadCache } from '../../hooks/useLoad'
import type { AppRecord, ComponentInfo, LabelRow, Lcid, TranslationFile } from '../../types/translation'
import { rowPositions, type Derived } from '../../utils/derive'
import { buildExplorer, tableCanvasRows } from '../../utils/designerTree'
import { parseFormXml, type FormLayout } from '../../utils/formXml'
import { buildIndex, coverageOf } from '../../utils/labelIndex'
import { languageName, languageTag } from '../../utils/languages'
import { parseSitemap, type SiteMapArea } from '../../utils/sitemapXml'
import { DEFAULT_PANES, loadDetailsOpen, loadPanes, saveDetailsOpen, savePanes, type Panes } from '../../utils/storage'
import { parseView, type ViewLayout } from '../../utils/viewXml'
import { S } from '../../strings'
import { DesignerContext, LiveContext, LiveStore, refKey, targetKey, useLiveValue, type DesignerApi, type DesignerTarget, type LabelRef, type Live } from './context'
import { appRows, formRefs, rowsOf, viewRefs } from './refs'
import { Explorer } from './Explorer'
import { Inspector, KeyList } from './Inspector'
import { HomeCanvas } from './HomeCanvas'
import { TableCanvas } from './TableCanvas'
import { FormCanvas } from './FormCanvas'
import { ViewCanvas } from './ViewCanvas'
import { AppCanvas } from './AppCanvas'
import { Splitter } from './Splitter'
import { CrumbContext, crumbsFor, parentOf, type CrumbNav } from './crumbs'
import './designer.css'

export interface DesignerProps {
  /** The loaded file without edits: the structure every canvas builds on. */
  origin: TranslationFile
  /** States, counts and suggestions of the edited file (incremental, from the studio). */
  derived: Derived
  components: ReadonlyMap<string, ComponentInfo>
  targets: Lcid[]
  readOnly: boolean
  /** Component names are still being resolved (forms/views not known yet). */
  resolving: boolean
  /** Remembers where the user was (per solution) across reloads and view switches. */
  memoryKey: string
  onEdit: (rowKey: string, lcid: Lcid, value: string) => void
  onRevert: (rowKey: string, lcid: Lcid) => void
  onAccept: (row: LabelRow, lcid: Lcid, value: string, all: boolean) => void
  onAcknowledge: (rowKey: string, lcid: Lcid, on: boolean) => void
  onRefused: (message: string) => void
  /** Switch to the table view with the labels the designer has no canvas for. */
  onShowOther: () => void
}

type Parsed<T> = { layout: T; error?: undefined } | { layout?: undefined; error: string }

function safely<T>(fn: () => T): Parsed<T> {
  try {
    return { layout: fn() }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Where the user was, per solution: survives a reload after an import and a look at the table view. */
const remembered = new Map<string, { target: DesignerTarget; lcid: Lcid | null }>()

/**
 * The translation designer: explorer (apps, tables, forms, views,
 * dashboards) on the left, the component as users see it in the middle,
 * the selected label in every language on the right. Edits go into the same
 * change list as the table view and out with the same import.
 *
 * Structure (index, tree, layouts) comes from the loaded file and stays put
 * while the user edits; texts, states and counts flow through a live store,
 * so an edit re-renders only the labels and counters it touches.
 */
export function Designer(props: DesignerProps) {
  const { origin, derived, components, targets, memoryKey } = props
  const base = origin.baseLanguage
  const [target, setTarget] = useState<DesignerTarget>(() => remembered.get(memoryKey)?.target ?? { kind: 'home' })
  const [lcidChoice, setLcidChoice] = useState<Lcid | null>(() => remembered.get(memoryKey)?.lcid ?? null)
  const [showBase, setShowBase] = useState(false)
  const [focusGaps, setFocusGaps] = useState(false)
  const [selected, setSelected] = useState<LabelRef | null>(null)
  // Details panel: the user's last choice, else open only where the canvas still has room.
  const [details, setDetailsState] = useState(() => loadDetailsOpen() ?? window.innerWidth >= 1600)
  const setDetails = (open: boolean) => {
    setDetailsState(open)
    saveDetailsOpen(open)
  }
  // Explorer shown and pane widths; kept in the browser.
  const [panes, setPanesState] = useState<Panes>(loadPanes)
  const setPanes = (next: Partial<Panes>) => setPanesState((p) => ({ ...p, ...next }))
  useEffect(() => savePanes(panes), [panes])
  const rootRef = useRef<HTMLDivElement>(null)
  /** While a splitter is dragged: set the width on the element only, no re-render of the canvas. */
  const preview = (prop: '--ex-w' | '--insp-w', px: number) => rootRef.current?.style.setProperty(prop, `${px}px`)
  const lcid = lcidChoice !== null && targets.includes(lcidChoice) ? lcidChoice : targets[0]

  // ---- structure: from the loaded file, unchanged by edits -----------------
  const index = useMemo(() => buildIndex(origin, components), [origin, components])
  const tree = useMemo(() => buildExplorer(origin, components, !props.resolving), [origin, components, props.resolving])
  const pos = rowPositions(origin)
  const canvasRows = useMemo(() => new Map(tree.tables.map((t) => [t.table, tableCanvasRows(t.rows, components, props.resolving)])), [tree, components, props.resolving])

  // ---- live data: changes with every edit and click ------------------------
  const selectedKey = selected ? refKey(selected) : null
  const live: Live = useMemo(
    () => ({ gaps: derived.gaps, counts: derived.counts, acknowledged: derived.acknowledged, suggestions: derived.suggestions, sameBase: derived.sameBase, selectedKey }),
    [derived, selectedKey],
  )
  const [store] = useState(() => new LiveStore(live))
  // Before paint: subscribed labels re-render in the same frame as the edit.
  useLayoutEffect(() => store.set(live), [store, live])

  // ---- stable actions: the studio's handlers change every render ------------
  const latest = useRef(props)
  useLayoutEffect(() => {
    latest.current = props
  })
  const actions = useMemo(
    () => ({
      onEdit: (rowKey: string, l: Lcid, value: string) => latest.current.onEdit(rowKey, l, value),
      onRevert: (rowKey: string, l: Lcid) => latest.current.onRevert(rowKey, l),
      onAccept: (row: LabelRow, l: Lcid, value: string, all: boolean) => latest.current.onAccept(row, l, value, all),
      onAcknowledge: (rowKey: string, l: Lcid, on: boolean) => latest.current.onAcknowledge(rowKey, l, on),
      onRefused: (message: string) => latest.current.onRefused(message),
      onShowOther: () => latest.current.onShowOther(),
    }),
    [],
  )

  // ---- definitions of the selected table, dashboard and the apps -----------
  // One cache per loaded file: going back to a table shows it at once.
  const [cache] = useState<LoadCache>(() => new Map())
  const tableName = 'table' in target ? target.table : ''
  const tableEntry = tree.tables.find((t) => t.table === tableName)
  const formIds = tableEntry?.forms.map((f) => f.id).join(',') ?? ''
  const viewIds = tableEntry?.views.map((v) => v.id).join(',') ?? ''
  // Separate loads: a failing view query doesn't hide the forms, the choices don't reload when names resolve.
  const loadForms = useCallback((svc: TranslationService) => svc.getForms(formIds.split(',')), [formIds])
  const formsRes = useLoad(formIds ? `forms:${formIds}` : null, loadForms, cache)
  const loadViews = useCallback((svc: TranslationService) => svc.getViews(viewIds.split(',')), [viewIds])
  const viewsRes = useLoad(viewIds ? `views:${viewIds}` : null, loadViews, cache)
  const loadChoices = useCallback(
    (svc: TranslationService) =>
      svc.getChoiceGroups(tableName, base).catch((err: unknown) => {
        console.warn('[translation] choice groups not readable', err)
        return null
      }),
    [tableName, base],
  )
  const choicesRes = useLoad(tableName ? `choices:${tableName}` : null, loadChoices, cache)

  const dashId = target.kind === 'dashboard' ? target.id : ''
  const loadDash = useCallback((svc: TranslationService) => svc.getForms([dashId]), [dashId])
  const dashRes = useLoad(dashId ? `dash:${dashId}` : null, loadDash, cache)

  const appIds = tree.apps.map((a) => a.id).join(',')
  const sitemapIds = tree.sitemaps.join(',')
  const loadApps = useCallback((svc: TranslationService) => svc.getApps(appIds ? appIds.split(',') : [], sitemapIds ? sitemapIds.split(',') : []), [appIds, sitemapIds])
  const appsRes = useLoad(appIds || sitemapIds ? `apps:${appIds}|${sitemapIds}` : null, loadApps, cache)

  const forms = useMemo(() => {
    const m = new Map<string, Parsed<FormLayout> & { name: string; table: string; type: number }>()
    for (const f of [...(formsRes.data ?? []), ...(dashRes.data ?? [])]) m.set(f.id, { ...safely(() => parseFormXml(f.formxml)), name: f.name, table: f.table, type: f.type })
    return m
  }, [formsRes.data, dashRes.data])
  const views = useMemo(() => {
    const m = new Map<string, Parsed<ViewLayout> & { name: string; table: string }>()
    for (const v of viewsRes.data ?? []) m.set(v.id, { ...safely(() => parseView(v.layoutxml, v.fetchxml, v.table)), name: v.name, table: v.table })
    return m
  }, [viewsRes.data])
  const apps = useMemo(() => {
    const m = new Map<string, { app: AppRecord; areas: SiteMapArea[]; error?: string }>()
    for (const a of appsRes.data ?? []) {
      const parsed = a.sitemap ? safely(() => parseSitemap(a.sitemap!.xml)) : { layout: [] as SiteMapArea[] }
      const entry = { app: a, areas: parsed.layout ?? [], error: parsed.error }
      if (a.id) m.set(a.id, entry)
      if (a.sitemap) m.set(a.sitemap.id, entry)
    }
    return m
  }, [appsRes.data])

  /** Sitemaps the explorer lists on their own: all of them without apps, else those no app of the file uses. */
  const loneSitemaps = useMemo(
    () => (tree.apps.length === 0 ? tree.sitemaps : (appsRes.data ?? []).filter((a) => !a.id && a.sitemap && tree.sitemaps.includes(a.sitemap.id)).map((a) => a.sitemap!.id)),
    [tree, appsRes.data],
  )

  /** File rows per loaded form/view/app (structure), for the explorer's counters. */
  const itemRows = useMemo(() => {
    const m = new Map<string, (LabelRow | null)[]>()
    for (const [id, f] of forms) if (f.layout) m.set(`form:${id}`, rowsOf(formRefs(index, id, f.table, f.name, f.layout, base)))
    for (const [id, v] of views) if (v.layout) m.set(`view:${id}`, rowsOf(viewRefs(index, id, v.name, v.layout)))
    for (const [id, a] of apps) m.set(`app:${id}`, appRows(index, a.app.id, a.app.sitemap?.id ?? '', a.areas))
    return m
  }, [forms, views, apps, index, base])

  const select = useCallback(
    (t: DesignerTarget) => {
      setTarget(t)
      setSelected(null)
      remembered.set(memoryKey, { target: t, lcid: remembered.get(memoryKey)?.lcid ?? null })
    },
    [memoryKey],
  )
  const setLcid = useCallback(
    (l: Lcid) => {
      setLcidChoice(l)
      remembered.set(memoryKey, { target: remembered.get(memoryKey)?.target ?? { kind: 'home' }, lcid: l })
    },
    [memoryKey],
  )

  // Breadcrumb in the canvas head: the way back up (and Alt+↑).
  const crumbNav: CrumbNav = useMemo(() => ({ trail: crumbsFor(target, tree), onSelect: select }), [target, tree, select])
  const crumbRef = useRef(crumbNav)
  useLayoutEffect(() => {
    crumbRef.current = crumbNav
  })

  const api: DesignerApi = useMemo(
    () => ({
      origin,
      index,
      pos,
      components,
      lcid,
      targets,
      baseLanguage: base,
      readOnly: props.readOnly,
      showBase,
      focusGaps,
      resolving: props.resolving,
      select: setSelected,
      onEdit: actions.onEdit,
      onRevert: actions.onRevert,
      onAccept: actions.onAccept,
      onAcknowledge: actions.onAcknowledge,
      onRefused: actions.onRefused,
    }),
    [origin, index, pos, components, lcid, targets, base, props.readOnly, showBase, focusGaps, props.resolving, actions],
  )

  // F8 / Shift+F8 anywhere while the designer is shown (focus may be on the page body after an edit); Ctrl+K searches.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const root = rootRef.current
      // Not while hidden behind the table view or under a dialog.
      if (!root || root.closest('[hidden]') || document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPanesState((p) => (p.explorer ? p : { ...p, explorer: true }))
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLInputElement>('.ex__search input')?.select()))
        return
      }
      if (e.altKey && e.key === 'ArrowUp') {
        // Not while typing: the editor would vanish without its blur.
        const tag = document.activeElement?.tagName
        const up = parentOf(crumbRef.current.trail)
        if (!up || tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        crumbRef.current.onSelect(up)
        return
      }
      if (e.key !== 'F8' || e.defaultPrevented) return
      const button = root.querySelector<HTMLButtonElement>(`[data-canvas] [data-nav="${e.shiftKey ? 'prev' : 'next'}"]`)
      if (!button) return
      e.preventDefault()
      // Let an open editor (details panel) commit before the selection moves on.
      if (document.activeElement instanceof HTMLElement && document.activeElement.tagName === 'TEXTAREA') document.activeElement.blur()
      button.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const loading = (what: string) => (
    <div className="canvas canvas--loading">
      <div className="skeleton skeleton--title" />
      <div className="skeleton" />
      <div className="skeleton skeleton--block" />
      <span className="muted small">{what}</span>
    </div>
  )
  const problem = (msg: string) => <div className="notice notice--error">{msg}</div>

  const canvas = (() => {
    switch (target.kind) {
      case 'home':
        return <HomeCanvas tree={tree} onSelect={select} onLanguage={setLcid} />
      case 'table':
        return tableEntry ? (
          <TableCanvas
            table={tableEntry.table}
            label={tableEntry.label}
            rows={tableEntry.rows}
            choices={choicesRes.data ?? null}
            forms={tableEntry.forms}
            views={tableEntry.views}
            itemRows={itemRows}
            onSelect={select}
          />
        ) : (
          problem(S.designer.gone)
        )
      case 'form':
      case 'dashboard': {
        const res = target.kind === 'form' ? formsRes : dashRes
        if (res.error) return problem(S.preview.loadError(res.error))
        const f = forms.get(target.id)
        if (!f) return res.loading || props.resolving ? loading(S.preview.loading) : problem(S.preview.notFound)
        if (f.error) return problem(f.error)
        return <FormCanvas formId={target.id} formName={f.name} table={f.table} type={target.kind === 'dashboard' ? 0 : f.type} layout={f.layout!} />
      }
      case 'view': {
        if (viewsRes.error) return problem(S.preview.loadError(viewsRes.error))
        const v = views.get(target.id)
        if (!v) return viewsRes.loading || props.resolving ? loading(S.designer.loadingView) : problem(S.designer.viewNotFound)
        if (v.error) return problem(v.error)
        return <ViewCanvas viewId={target.id} viewName={v.name} table={v.table} layout={v.layout!} />
      }
      case 'app': {
        if (appsRes.error) return problem(S.preview.loadError(appsRes.error))
        const a = apps.get(target.id)
        const item = tree.apps.find((x) => x.id === target.id)
        if (!a) return appsRes.loading ? loading(S.designer.loadingApp) : problem(S.designer.appNotFound)
        return (
          <>
            {a.error ? problem(a.error) : null}
            <AppCanvas appId={a.app.id} appName={item?.name || a.app.name} app={a.app} areas={a.areas} />
          </>
        )
      }
    }
  })()

  const cls = ['designer', panes.explorer ? '' : 'designer--noex', details ? '' : 'designer--nodetails'].filter(Boolean).join(' ')
  const sizes = { '--ex-w': `${panes.explorerWidth}px`, '--insp-w': `${panes.detailsWidth}px` } as CSSProperties

  return (
    <DesignerContext.Provider value={api}>
      <LiveContext.Provider value={store}>
        <CrumbContext.Provider value={crumbNav}>
          <div className={cls} ref={rootRef} style={sizes}>
            {panes.explorer ? (
              <>
                <Explorer tree={tree} loneSitemaps={loneSitemaps} itemRows={itemRows} canvasRows={canvasRows} target={target} onSelect={select} onShowOther={actions.onShowOther} />
                <Splitter
                  side="left"
                  className="split--ex"
                  value={panes.explorerWidth}
                  min={200}
                  max={480}
                  label={S.designer.explorerResize}
                  onPreview={(px) => preview('--ex-w', px)}
                  onCommit={(w) => setPanes({ explorerWidth: w })}
                  onReset={() => setPanes({ explorerWidth: DEFAULT_PANES.explorerWidth })}
                />
              </>
            ) : null}
            <div className="designer__bar">
              <button
                type="button"
                className="designer__iconbtn"
                title={panes.explorer ? S.designer.explorerHide : S.designer.explorerShow}
                aria-label={panes.explorer ? S.designer.explorerHide : S.designer.explorerShow}
                aria-pressed={panes.explorer}
                onClick={() => setPanes({ explorer: !panes.explorer })}
              >
                {panes.explorer ? <PanelLeftContractRegular /> : <PanelLeftExpandRegular />}
              </button>
              {targets.length > 1 ? (
                <div className="designer__langs" role="radiogroup" aria-label={S.preview.language}>
                  {targets.map((l) => (
                    <LanguagePill key={l} lcid={l} active={l === lcid} onPick={setLcid} />
                  ))}
                </div>
              ) : (
                <span className="designer__lang">{languageName(lcid)}</span>
              )}
              <span className="designer__spacer" />
              <ToggleButton
                size="small"
                appearance="subtle"
                icon={<SubtitlesRegular />}
                checked={showBase}
                title={S.preview.showBase(languageName(base))}
                aria-label={S.preview.showBase(languageName(base))}
                onClick={() => setShowBase(!showBase)}
              >
                <span className="designer__tlabel">{S.designer.showBaseShort(languageName(base))}</span>
              </ToggleButton>
              <ToggleButton size="small" appearance="subtle" icon={<HighlightRegular />} checked={focusGaps} title={S.designer.focusGaps} aria-label={S.designer.focusGaps} onClick={() => setFocusGaps(!focusGaps)}>
                <span className="designer__tlabel">{S.designer.focusGaps}</span>
              </ToggleButton>
              <Popover withArrow positioning="below-end">
                <PopoverTrigger disableButtonEnhancement>
                  <button type="button" className="designer__iconbtn" title={S.designer.keysButton} aria-label={S.designer.keysButton}>
                    <KeyboardRegular />
                  </button>
                </PopoverTrigger>
                <PopoverSurface className="designer__keys">
                  <KeyList />
                </PopoverSurface>
              </Popover>
              <ToggleButton
                size="small"
                appearance="subtle"
                checked={details}
                icon={details ? <PanelRightContractRegular /> : <PanelRightExpandRegular />}
                title={details ? S.designer.detailsHide : S.designer.detailsShow}
                aria-label={details ? S.designer.detailsHide : S.designer.detailsShow}
                onClick={() => setDetails(!details)}
              >
                <span className="designer__tlabel">{S.designer.details}</span>
              </ToggleButton>
            </div>
            {/* Keyed by target only: switching the language keeps the tab, area and filters. */}
            <div className="designer__canvas" key={targetKey(target)} lang={languageTag(lcid)}>
              {canvas}
            </div>
            {details ? (
              <>
                <Splitter
                  side="right"
                  className="split--insp"
                  value={panes.detailsWidth}
                  min={260}
                  max={560}
                  label={S.designer.detailsResize}
                  onPreview={(px) => preview('--insp-w', px)}
                  onCommit={(w) => setPanes({ detailsWidth: w })}
                  onReset={() => setPanes({ detailsWidth: DEFAULT_PANES.detailsWidth })}
                />
                <Inspector labelRef={selected} onClose={() => setDetails(false)} />
              </>
            ) : null}
          </div>
        </CrumbContext.Provider>
      </LiveContext.Provider>
    </DesignerContext.Provider>
  )
}

/** Language switch with its coverage, which follows the edits. */
function LanguagePill({ lcid, active, onPick }: { lcid: Lcid; active: boolean; onPick: (l: Lcid) => void }) {
  const pct = useLiveValue((live) => Math.floor(coverageOf(live.counts[lcid] ?? { missing: 0, untranslated: 0, changed: 0, ok: 0 })))
  return (
    <button type="button" role="radio" aria-checked={active} className={`pill${active ? ' pill--active' : ''}`} onClick={() => onPick(lcid)}>
      {languageName(lcid)} <span className="pill__pct">{pct} %</span>
    </button>
  )
}
