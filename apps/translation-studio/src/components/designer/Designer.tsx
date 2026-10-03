import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Popover, PopoverSurface, PopoverTrigger, Switch, ToggleButton } from '@fluentui/react-components'
import { KeyboardRegular, PanelRightContractRegular, PanelRightExpandRegular } from '@fluentui/react-icons'
import type { TranslationService } from '../../services/translationService'
import { useLoad } from '../../hooks/useLoad'
import type { AppRecord, ComponentInfo, LabelRow, Lcid, TranslationFile } from '../../types/translation'
import { buildExplorer } from '../../utils/designerTree'
import { parseFormXml, type FormLayout } from '../../utils/formXml'
import type { StateCounts } from '../../utils/gaps'
import type { Suggestion } from '../../utils/glossary'
import { buildIndex, countRows, coverageOf } from '../../utils/labelIndex'
import { languageName, languageTag } from '../../utils/languages'
import { parseSitemap, type SiteMapArea } from '../../utils/sitemapXml'
import { loadDetailsOpen, saveDetailsOpen } from '../../utils/storage'
import { parseView, type ViewLayout } from '../../utils/viewXml'
import { S } from '../../strings'
import { DesignerContext, refKey, targetKey, type DesignerApi, type DesignerTarget, type LabelRef } from './context'
import { appRows, formRefs, rowsOf, viewRefs } from './refs'
import { Explorer } from './Explorer'
import { Inspector, KeyList } from './Inspector'
import { HomeCanvas } from './HomeCanvas'
import { TableCanvas } from './TableCanvas'
import { FormCanvas } from './FormCanvas'
import { ViewCanvas } from './ViewCanvas'
import { AppCanvas } from './AppCanvas'
import './designer.css'

export interface DesignerProps {
  /** The file with the current edits applied. */
  file: TranslationFile
  components: ReadonlyMap<string, ComponentInfo>
  targets: Lcid[]
  acknowledged: ReadonlySet<string>
  readOnly: boolean
  /** Component names are still being resolved (forms/views not known yet). */
  resolving: boolean
  suggestions: ReadonlyMap<string, Suggestion>
  sameBase: ReadonlyMap<string, number>
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

/**
 * The translation designer: explorer (apps, tables, forms, views,
 * dashboards) on the left, the component as users see it in the middle,
 * the selected label in every language on the right. Edits go into the same
 * change list as the table view and out with the same import.
 */
export function Designer(props: DesignerProps) {
  const { file, components, targets, acknowledged } = props
  const base = file.baseLanguage
  const [target, setTarget] = useState<DesignerTarget>({ kind: 'home' })
  const [lcidChoice, setLcid] = useState<Lcid | null>(null)
  const [showBase, setShowBase] = useState(false)
  const [focusGaps, setFocusGaps] = useState(false)
  const [selected, setSelected] = useState<LabelRef | null>(null)
  // Details panel: the user's last choice, else open only where the canvas still has room.
  const [details, setDetailsState] = useState(() => loadDetailsOpen() ?? window.innerWidth >= 1600)
  const setDetails = (open: boolean) => {
    setDetailsState(open)
    saveDetailsOpen(open)
  }
  const rootRef = useRef<HTMLDivElement>(null)
  const lcid = lcidChoice !== null && targets.includes(lcidChoice) ? lcidChoice : targets[0]

  const index = useMemo(() => buildIndex(file, components), [file, components])
  const tree = useMemo(() => buildExplorer(file, components), [file, components])
  const tableCounts = useMemo(() => new Map(tree.tables.map((t) => [t.table, countRows(t.rows, lcid, base, acknowledged)])), [tree, lcid, base, acknowledged])

  // ---- data of the selected table: forms, views, choice groups ------------
  const tableName = 'table' in target ? target.table : ''
  const tableEntry = tree.tables.find((t) => t.table === tableName)
  const formIds = tableEntry?.forms.map((f) => f.id).join(',') ?? ''
  const viewIds = tableEntry?.views.map((v) => v.id).join(',') ?? ''
  const loadTable = useCallback(
    async (svc: TranslationService) => {
      const [forms, views, choices] = await Promise.all([
        svc.getForms(formIds ? formIds.split(',') : []),
        svc.getViews(viewIds ? viewIds.split(',') : []),
        svc.getChoiceGroups(tableName, base).catch((err: unknown) => {
          console.warn('[translation] choice groups not readable', err)
          return null
        }),
      ])
      return { forms, views, choices }
    },
    [tableName, formIds, viewIds, base],
  )
  const tableRes = useLoad(tableName ? `table:${tableName}|${formIds}|${viewIds}` : null, loadTable)

  const dashId = target.kind === 'dashboard' ? target.id : ''
  const loadDash = useCallback((svc: TranslationService) => svc.getForms([dashId]), [dashId])
  const dashRes = useLoad(dashId ? `dash:${dashId}` : null, loadDash)

  const appIds = tree.apps.map((a) => a.id).join(',')
  const sitemapIds = tree.sitemaps.join(',')
  const loadApps = useCallback((svc: TranslationService) => svc.getApps(appIds ? appIds.split(',') : [], sitemapIds ? sitemapIds.split(',') : []), [appIds, sitemapIds])
  const appsRes = useLoad(appIds || sitemapIds ? `apps:${appIds}|${sitemapIds}` : null, loadApps)

  const forms = useMemo(() => {
    const m = new Map<string, Parsed<FormLayout> & { name: string; table: string; type: number }>()
    for (const f of [...(tableRes.data?.forms ?? []), ...(dashRes.data ?? [])]) m.set(f.id, { ...safely(() => parseFormXml(f.formxml)), name: f.name, table: f.table, type: f.type })
    return m
  }, [tableRes.data, dashRes.data])
  const views = useMemo(() => {
    const m = new Map<string, Parsed<ViewLayout> & { name: string; table: string }>()
    for (const v of tableRes.data?.views ?? []) m.set(v.id, { ...safely(() => parseView(v.layoutxml, v.fetchxml, v.table)), name: v.name, table: v.table })
    return m
  }, [tableRes.data])
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

  const itemCounts = useMemo(() => {
    const m = new Map<string, StateCounts>()
    const count = (rows: (LabelRow | null)[]) => countRows(rows, lcid, base, acknowledged)
    for (const [id, f] of forms) if (f.layout) m.set(`form:${id}`, count(rowsOf(formRefs(index, id, f.table, f.name, f.layout, base))))
    for (const [id, v] of views) if (v.layout) m.set(`view:${id}`, count(rowsOf(viewRefs(index, id, v.name, v.layout))))
    for (const [id, a] of apps) m.set(`app:${id}`, count(appRows(index, a.app.id, a.app.sitemap?.id ?? '', a.areas)))
    return m
  }, [forms, views, apps, index, lcid, base, acknowledged])

  const languageCoverage = useMemo(() => new Map(targets.map((l) => [l, coverageOf(countRows(file.rows, l, base, acknowledged))])), [file, targets, base, acknowledged])

  const select = useCallback((t: DesignerTarget) => {
    setTarget(t)
    setSelected(null)
  }, [])

  const api: DesignerApi = useMemo(
    () => ({
      file,
      index,
      components,
      lcid,
      targets,
      baseLanguage: base,
      acknowledged,
      readOnly: props.readOnly,
      showBase,
      focusGaps,
      resolving: props.resolving,
      suggestions: props.suggestions,
      sameBase: props.sameBase,
      selectedKey: selected ? refKey(selected) : null,
      select: setSelected,
      onEdit: props.onEdit,
      onRevert: props.onRevert,
      onAccept: props.onAccept,
      onAcknowledge: props.onAcknowledge,
      onRefused: props.onRefused,
    }),
    [file, index, components, lcid, targets, base, acknowledged, props.readOnly, showBase, focusGaps, props.resolving, props.suggestions, props.sameBase, selected, props.onEdit, props.onRevert, props.onAccept, props.onAcknowledge, props.onRefused],
  )

  // F8 / Shift+F8 anywhere while the designer is shown (focus may be on the page body after an edit).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'F8') return
      const button = rootRef.current?.querySelector<HTMLButtonElement>(`[data-canvas] [data-nav="${e.shiftKey ? 'prev' : 'next'}"]`)
      if (!button) return
      e.preventDefault()
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
        return <HomeCanvas tree={tree} tableCounts={tableCounts} onSelect={select} onLanguage={setLcid} />
      case 'table':
        return tableEntry ? <TableCanvas table={tableEntry.table} label={tableEntry.label} rows={tableEntry.rows} choices={tableRes.data?.choices ?? null} /> : problem(S.designer.gone)
      case 'form':
      case 'dashboard': {
        const res = target.kind === 'form' ? tableRes : dashRes
        if (res.error) return problem(S.preview.loadError(res.error))
        const f = forms.get(target.id)
        if (!f) return res.loading ? loading(S.preview.loading) : problem(S.preview.notFound)
        if (f.error) return problem(f.error)
        return <FormCanvas formId={target.id} formName={f.name} table={f.table} type={target.kind === 'dashboard' ? 0 : f.type} layout={f.layout!} />
      }
      case 'view': {
        if (tableRes.error) return problem(S.preview.loadError(tableRes.error))
        const v = views.get(target.id)
        if (!v) return tableRes.loading ? loading(S.designer.loadingView) : problem(S.designer.viewNotFound)
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

  return (
    <DesignerContext.Provider value={api}>
      <div className={`designer${details ? '' : ' designer--nodetails'}`} ref={rootRef}>
        <Explorer tree={tree} tableCounts={tableCounts} itemCounts={itemCounts} target={target} onSelect={select} onShowOther={props.onShowOther} />
        <div className="designer__bar">
          {targets.length > 1 ? (
            <div className="designer__langs" role="radiogroup" aria-label={S.preview.language}>
              {targets.map((l) => (
                <button key={l} type="button" role="radio" aria-checked={l === lcid} className={`pill${l === lcid ? ' pill--active' : ''}`} onClick={() => setLcid(l)}>
                  {languageName(l)} <span className="pill__pct">{Math.floor(languageCoverage.get(l) ?? 0)} %</span>
                </button>
              ))}
            </div>
          ) : (
            <span className="designer__lang">{languageName(lcid)}</span>
          )}
          <span className="designer__spacer" />
          {props.resolving ? <span className="muted small">{S.scope.resolving}</span> : null}
          <Switch label={S.preview.showBase(languageName(base))} checked={showBase} onChange={(_, v) => setShowBase(v.checked)} />
          <Switch label={S.designer.focusGaps} checked={focusGaps} onChange={(_, v) => setFocusGaps(v.checked)} />
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
            onClick={() => setDetails(!details)}
          >
            {S.designer.details}
          </ToggleButton>
        </div>
        <div className="designer__canvas" key={`${targetKey(target)}|${lcid}`} lang={languageTag(lcid)}>
          {canvas}
        </div>
        {details ? <Inspector labelRef={selected} onClose={() => setDetails(false)} /> : null}
      </div>
    </DesignerContext.Provider>
  )
}
