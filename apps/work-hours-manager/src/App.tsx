import { Toast, ToastTitle, Toaster, useId, useToastController, type TableRowId } from '@fluentui/react-components'
import { useMemo, useState } from 'react'
import './App.css'
import { usePower } from './PowerProvider'
import { DEFAULT_USE_V2 } from './config'
import { useCalendarData } from './hooks/calendarData'
import { useFullTrees } from './hooks/useFullTrees'
import { AppNav, type View } from './components/shell/AppNav'
import { TopToolbar } from './components/shell/TopToolbar'
import { ResourcesView } from './components/resources/ResourcesView'
import { RuleInspector } from './components/rules/RuleInspector'
import { RuleEditorDialog, type EditorRequest } from './components/rules/RuleEditorDialog'
import type { DayActions } from './components/calendar/DayPopover'
import { getCalendarService, PrivilegeError } from './services/calendarService'
import { toRequests, type EditIntent, type EditTarget } from './utils/intents'
import { findBlock, isRecurrence, observesClosures } from './utils/rules'
import { DiagnosticsView } from './components/diagnostics/DiagnosticsView'
import { TemplatesView } from './components/views/TemplatesView'
import { HolidaysView } from './components/views/HolidaysView'
import { RunsView } from './components/views/RunsView'
import { RunWizardDrawer, type WizardMode } from './components/runs/RunWizardDrawer'
import { listRuns } from './utils/runHistory'
import { HelpPanel } from './help/HelpPanel'
import { HELP_FOR } from './help/helpContent'
import type { CalendarTree, Closure, Resource, RunRecord, TimeOffRequest } from './types/calendar'
import type { RunTargetInput } from './utils/plan'
import { SetupView } from './components/views/SetupView'
import { useLoad } from './hooks/useLoad'
import { S } from './strings'
import type { Notify } from './types/calendar'
import { localTimeZone, todayIn, zonedToUtc } from './utils/dates'
import { diagnose, findingsByResource } from './utils/diagnostics'
import { visibleRange, type RangeState } from './utils/range'
import { timeZoneLabel, viewerTimeZoneCode } from './utils/timezones'

const SETTINGS_KEY = 'whm.settings'

// Stable fallbacks: a fresh `[]` per render would defeat the memoized list and diagnostics.
const NO_RESOURCES: Resource[] = []
const NO_CLOSURES: Closure[] = []
const NO_TIME_OFF: TimeOffRequest[] = []
const NO_COUNTS: Record<string, number> = {}

function readSettings(): { useV2: boolean; viewerTz: string } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<{ useV2: boolean; viewerTz: string }>) : {}
    return { useV2: parsed.useV2 ?? DEFAULT_USE_V2, viewerTz: parsed.viewerTz ?? localTimeZone() }
  } catch {
    return { useV2: DEFAULT_USE_V2, viewerTz: localTimeZone() }
  }
}

function writeSettings(s: { useV2: boolean; viewerTz: string }) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // storage unavailable — settings live for the session only
  }
}

export default function App() {
  const { ready, mode } = usePower()
  const [settings, setSettingsState] = useState(readSettings)
  const setSettings = (s: typeof settings) => {
    setSettingsState(s)
    writeSettings(s)
  }
  const today = todayIn(settings.viewerTz)
  const [view, setView] = useState<View>('resources')
  const [range, setRange] = useState<RangeState>({ mode: 'week', anchor: today })
  const [tab, setTab] = useState<'list' | 'calendar'>('list')
  const [selected, setSelected] = useState<Set<TableRowId>>(new Set())
  const [focus, setFocus] = useState<{ kind: 'resource' | 'template'; id: string; blockId: string | null } | null>(null)
  const [holidayYear, setHolidayYear] = useState(Number(today.slice(0, 4)))
  const [treeVersion, setTreeVersion] = useState(0)
  /** Calendars written in this session — they stay loaded as full trees, so the list shows their new state without reloading all roots. */
  const [touched, setTouched] = useState<string[]>([])
  const touch = (ids: (string | null | undefined)[]) => setTouched((prev) => [...new Set([...prev, ...ids.filter((id): id is string => !!id).map((id) => id.toLowerCase())])])
  const [readOnly, setReadOnly] = useState(false)
  const [editor, setEditor] = useState<{ kind: 'resource' | 'template'; id: string; request: EditorRequest; epoch: number } | null>(null)
  const [runs, setRuns] = useState<RunRecord[]>(listRuns)
  const [help, setHelp] = useState<{ open: boolean; section: string | null }>({ open: false, section: null })
  const [wizard, setWizard] = useState<{ mode: WizardMode; epoch: number } | null>(null)

  const visible = visibleRange(range)
  const data = useCalendarData(ready, visible.from, visible.to, settings.viewerTz, today, treeVersion)

  const toasterId = useId('toaster')
  const { dispatchToast } = useToastController(toasterId)
  const notify: Notify = (text, kind = 'ok') =>
    dispatchToast(
      <Toast>
        <ToastTitle>{text}</ToastTitle>
      </Toast>,
      { intent: kind === 'ok' ? 'success' : 'error', timeout: kind === 'ok' ? 4500 : 9000 },
    )

  const yearStart = zonedToUtc(`${holidayYear}-01-01`, '00:00', settings.viewerTz)
  const yearEnd = zonedToUtc(`${holidayYear + 1}-01-01`, '00:00', settings.viewerTz)
  const yearClosures = useLoad(ready && view === 'holidays' ? `closures-year:${yearStart}|${yearEnd}|${treeVersion}` : null, (svc) => svc.loadClosures(yearStart, yearEnd))

  const resources = data.resources.data ?? NO_RESOURCES
  const closures = data.closures.data ?? NO_CLOSURES
  const timeOff = data.timeOff.data ?? NO_TIME_OFF
  const slotsData = data.slots.error ? null : (data.slots.data ?? null)

  const focusedResource = focus?.kind === 'resource' ? (resources.find((r) => r.id === focus.id) ?? null) : null
  const focusedTemplate = focus?.kind === 'template' ? (data.templates.data?.find((t) => t.id === focus.id) ?? null) : null
  const focusCalendarId = focusedResource?.calendarId ?? focusedTemplate?.calendarId ?? null

  // The list works on root rules; whatever is opened (inspector, editor, run targets, templates) gets its full tree.
  const calendarOfResource = (id: string) => resources.find((r) => r.id === id)?.calendarId ?? null
  const calendarOfEditor = editor ? (editor.kind === 'resource' ? calendarOfResource(editor.id) : (data.templates.data?.find((t) => t.id === editor.id)?.calendarId ?? null)) : null
  const wizardCalendars = !wizard ? [] : wizard.mode.kind === 'undo' ? wizard.mode.record.steps.map((s) => s.calendarId) : [...selected].map((id) => calendarOfResource(String(id)))
  const templateCalendars = (data.templates.data ?? []).map((t) => t.calendarId)
  const fullIds = [focusCalendarId, calendarOfEditor, ...wizardCalendars, ...templateCalendars, ...touched].filter((c): c is string => !!c)
  const full = useFullTrees(fullIds, treeVersion)
  const rootTrees = data.trees.data?.trees
  const trees = useMemo<Record<string, CalendarTree>>(() => ({ ...rootTrees, ...full.trees }), [rootTrees, full.trees])
  const unreadable = Object.values(data.trees.data?.errors ?? {})
  const fullTreeOf = (calendarId: string | null | undefined): CalendarTree | null => (calendarId ? (full.trees[calendarId.toLowerCase()] ?? null) : null)

  // 5.1 looks from today over the diagnostics window — never at the slots of the week on screen (browsing back flagged everyone).
  const diagSlots = data.diagSlots.error ? null : (data.diagSlots.data ?? null)
  const bookings = data.bookings.data ?? NO_COUNTS
  // Memoized: every toast, focus change or dialog keystroke re-renders App — the diagnostics over all resources must not run each time.
  const findings = useMemo(() => (data.ready && rootTrees ? diagnose({ resources, trees, today, slots: diagSlots, bookingsAfterToday: bookings }) : null), [data.ready, rootTrees, resources, trees, today, diagSlots, bookings])
  const findingsMap = useMemo(() => findingsByResource(findings ?? []), [findings])
  const inspectorTree = fullTreeOf(focusCalendarId)
  const inspectorError = focusCalendarId ? (full.errors[focusCalendarId.toLowerCase()] ?? null) : null

  const showResourceRule = (resourceId: string, innerCalendarId: string | null) => {
    setView('resources')
    setFocus({ kind: 'resource', id: resourceId, blockId: innerCalendarId })
  }

  // ---- editing (Phase 3): every write goes through intents → Work Hours actions
  const targetFor = (kind: 'resource' | 'template', id: string): { name: string; target: EditTarget; tree: typeof inspectorTree } | null => {
    if (kind === 'resource') {
      const r = resources.find((x) => x.id === id)
      if (!r?.calendarId) return null
      const tree = fullTreeOf(r.calendarId)
      return { name: r.name, target: { entity: 'bookableresource', calendarId: r.calendarId, resourceId: r.type === 'user' ? r.userId : null, timeZoneCode: r.timeZoneCode, useV2: settings.useV2, closuresObserved: observesClosures(tree, today) }, tree }
    }
    const t = data.templates.data?.find((x) => x.id === id)
    if (!t?.calendarId) return null
    const tree = fullTreeOf(t.calendarId)
    return { name: t.name, target: { entity: 'msdyn_workhourtemplate', calendarId: t.calendarId, resourceId: null, timeZoneCode: viewerTimeZoneCode(settings.viewerTz), useV2: settings.useV2, closuresObserved: observesClosures(tree, today) }, tree }
  }
  const openEditor = (kind: 'resource' | 'template', id: string, request: EditorRequest) => setEditor({ kind, id, request, epoch: Date.now() })
  const editorContext = editor ? targetFor(editor.kind, editor.id) : null
  // A request from the list or calendar carries a root-only block; the editor works on the same block of the full tree.
  const editorRequest: EditorRequest | null = !editor || !editorContext?.tree ? null : editor.request.op === 'create' ? editor.request : refreshRequest(editor.request, editorContext.tree)

  const saveIntent = async (intent: EditIntent) => {
    const svc = await getCalendarService()
    const requests = toRequests(intent)
    try {
      for (const r of requests) {
        if (r.action === 'msdyn_SaveCalendar') await svc.saveCalendar(r.info)
        else await svc.deleteCalendar(r.info)
      }
    } catch (err) {
      if (err instanceof PrivilegeError) setReadOnly(true)
      notify(err instanceof Error ? err.message : String(err), 'error')
      throw err
    }
    notify(intent.op === 'delete' ? S.editor.deleted : S.editor.saved(requests.length))
    touch([intent.target.calendarId])
    setTreeVersion((v) => v + 1)
  }

  const runTargets: RunTargetInput[] = [...selected].map((id) => resources.find((r) => r.id === String(id))).filter((r): r is NonNullable<typeof r> => !!r).map((r) => ({ resource: r, tree: fullTreeOf(r.calendarId) }))
  const openWizard = (mode: WizardMode) => {
    if (mode.kind === 'new' && runTargets.length === 0) {
      notify(S.runs.noTargets, 'error')
      setView('resources')
      return
    }
    setWizard({ mode, epoch: Date.now() })
  }
  const onRunFinished = (record: RunRecord) => {
    setRuns(listRuns())
    touch(record.steps.map((s) => s.calendarId))
    setTreeVersion((v) => v + 1)
    const done = record.steps.filter((s) => s.status === 'done').length
    const failed = record.steps.find((s) => s.status === 'failed')
    notify(failed ? S.runs.resultFailed(failed.resourceName) : S.runs.resultOk(done), failed ? 'error' : 'ok')
  }

  const dayActionsFor = (resourceId: string): DayActions | null => {
    if (readOnly) return null
    const calendarId = calendarOfResource(resourceId)
    const tree = calendarId ? trees[calendarId.toLowerCase()] : undefined
    if (!tree) return null
    return {
      editDay: (innerCalendarId, date) => {
        const block = findBlock(tree, innerCalendarId)
        if (!block) return
        openEditor('resource', resourceId, isRecurrence(block) ? { op: 'editDay', block, date } : { op: 'edit', block })
      },
      create: (kind, date) => openEditor('resource', resourceId, { op: 'create', kind, date }),
    }
  }

  const errors = [
    data.resources.error && S.app.loadError('Ressourcen', data.resources.error),
    data.trees.error && S.app.loadError('Kalenderregeln', data.trees.error),
    data.closures.error && S.app.loadError('Geschäftsschließungen', data.closures.error),
    data.timeOff.error && S.app.loadError('Abwesenheitsanträge', data.timeOff.error),
  ].filter((e): e is string => !!e)

  return (
    <div className="app">
      <AppNav view={view} onChange={setView} badges={{ diagnostics: findings?.length || undefined, runs: runs.length || undefined }} />
      <div className="app__main">
        <TopToolbar
          range={range}
          onRange={setRange}
          showRange={view === 'resources'}
          viewerTz={settings.viewerTz}
          onViewerTz={(viewerTz) => setSettings({ ...settings, viewerTz })}
          useV2={settings.useV2}
          onUseV2={(useV2) => setSettings({ ...settings, useV2 })}
          mode={mode}
          ready={ready}
          readOnly={readOnly}
          onHelp={() => setHelp({ open: true, section: HELP_FOR[view] ?? null })}
          onReload={data.reloadAll}
        />
        {errors.map((e) => (
          <div key={e} className="notice notice--error">
            {e}
          </div>
        ))}
        {data.slots.error ? <div className="notice notice--warn">{S.app.slotsUnavailable(data.slots.error)}</div> : null}
        {unreadable.length ? <div className="notice notice--warn">{S.app.treesPartial(unreadable.length, unreadable[0])}</div> : null}
        {data.ready && data.trees.loading && !data.trees.data ? <div className="notice">{S.app.treesLoading(resources.filter((r) => r.calendarId).length)}</div> : null}
        <div className="app__content">
          <main className="app__view">
            {!ready || (!data.ready && !data.resources.error) ? (
              <p className="loading">{S.app.loading}</p>
            ) : view === 'resources' ? (
              <ResourcesView
                resources={resources}
                trees={trees}
                slots={slotsData}
                closures={closures}
                timeOff={timeOff}
                findings={findingsMap}
                range={visible}
                mode={range.mode}
                viewerTz={settings.viewerTz}
                today={today}
                useV2={settings.useV2}
                selected={selected}
                onSelect={setSelected}
                focusedId={focusedResource?.id ?? null}
                onFocus={(id) => setFocus({ kind: 'resource', id, blockId: null })}
                onShowRule={showResourceRule}
                tab={tab}
                onTab={setTab}
                dayActionsFor={dayActionsFor}
                onRun={readOnly ? null : () => openWizard({ kind: 'new' })}
              />
            ) : view === 'templates' ? (
              <TemplatesView templates={data.templates.data} trees={trees} focusedId={focusedTemplate?.id ?? null} onFocus={(id) => setFocus({ kind: 'template', id, blockId: null })} onApply={readOnly ? null : (templateId) => openWizard({ kind: 'new', templateId })} />
            ) : view === 'holidays' ? (
              <HolidaysView
                year={holidayYear}
                onYear={setHolidayYear}
                closures={yearClosures.data}
                error={yearClosures.error}
                viewerTz={settings.viewerTz}
                readOnly={readOnly}
                today={today}
                notify={notify}
                onChanged={() => setTreeVersion((v) => v + 1)}
                onPrivilegeError={() => setReadOnly(true)}
              />
            ) : view === 'diagnostics' ? (
              <DiagnosticsView findings={findings} fromSlots={diagSlots !== null} onShowResource={showResourceRule} />
            ) : view === 'runs' ? (
              <RunsView runs={runs} readOnly={readOnly} onUndo={(record) => openWizard({ kind: 'undo', record })} />
            ) : (
              <SetupView />
            )}
          </main>
          <RuleInspector
            open={(view === 'resources' && !!focusedResource) || (view === 'templates' && !!focusedTemplate)}
            title={focusedResource?.name ?? focusedTemplate?.name ?? ''}
            subtitle={focusedResource ? `${S.resourceTypes[focusedResource.type]} · ${timeZoneLabel(focusedResource.timeZoneCode)}${focusedResource.orgUnit ? ` · ${focusedResource.orgUnit.name}` : ''}` : undefined}
            tree={inspectorTree}
            loading={!!focusCalendarId && !inspectorTree && !inspectorError}
            error={inspectorError}
            resourceTimeZoneCode={focusedResource?.timeZoneCode ?? (focusedTemplate ? viewerTimeZoneCode(settings.viewerTz) : undefined)}
            focusBlockId={focus?.blockId ?? null}
            onClose={() => setFocus(null)}
            today={today}
            onEdit={!readOnly && focus && inspectorTree ? (request) => openEditor(focus.kind, focus.id, request) : null}
          />
          {wizard ? (
            <RunWizardDrawer
              key={wizard.epoch}
              mode={wizard.mode}
              targets={runTargets}
              resources={resources}
              templates={data.templates.data ?? []}
              trees={trees}
              treesLoading={full.loading}
              today={today}
              useV2={settings.useV2}
              onFinished={onRunFinished}
              onPrivilegeError={() => setReadOnly(true)}
              onClose={() => setWizard(null)}
            />
          ) : null}
          {editor && editorContext?.tree && editorRequest ? (
            <RuleEditorDialog
              key={editor.epoch}
              request={editorRequest}
              targetName={editorContext.name}
              target={editorContext.target}
              tree={editorContext.tree}
              closures={closures}
              viewerTz={settings.viewerTz}
              today={today}
              onSave={saveIntent}
              onClose={() => setEditor(null)}
            />
          ) : null}
        </div>
      </div>
      <HelpPanel open={help.open} section={help.section} onClose={() => setHelp({ open: false, section: null })} />
      <Toaster toasterId={toasterId} position="bottom-end" />
    </div>
  )
}

/** The same request on the full tree's block (matched by root rule id); unchanged when the block is gone. */
function refreshRequest(request: Exclude<EditorRequest, { op: 'create' }>, tree: CalendarTree): EditorRequest {
  const block = tree.blocks.find((b) => b.rootRuleId === request.block.rootRuleId) ?? request.block
  return { ...request, block }
}
