import { Toast, ToastTitle, Toaster, useId, useToastController, type TableRowId } from '@fluentui/react-components'
import { useState } from 'react'
import './App.css'
import { usePower } from './PowerProvider'
import { DEFAULT_USE_V2 } from './config'
import { useCalendarData } from './hooks/calendarData'
import { AppNav, type View } from './components/shell/AppNav'
import { TopToolbar } from './components/shell/TopToolbar'
import { ResourcesView } from './components/resources/ResourcesView'
import { RuleInspector } from './components/rules/RuleInspector'
import { RuleEditorDialog, type EditorRequest } from './components/rules/RuleEditorDialog'
import type { DayActions } from './components/calendar/DayPopover'
import { getCalendarService, PrivilegeError } from './services/calendarService'
import { toRequests, type EditIntent, type EditTarget } from './utils/intents'
import { findBlock, isRecurrence } from './utils/rules'
import { DiagnosticsView } from './components/diagnostics/DiagnosticsView'
import { TemplatesView } from './components/views/TemplatesView'
import { HolidaysView } from './components/views/HolidaysView'
import { RunsView } from './components/views/RunsView'
import { RunWizardDrawer, type WizardMode } from './components/runs/RunWizardDrawer'
import { listRuns } from './utils/runHistory'
import { HelpPanel } from './help/HelpPanel'
import { HELP_FOR } from './help/helpContent'
import type { RunRecord } from './types/calendar'
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

  const resources = data.resources.data ?? []
  const trees = data.trees.data ?? {}
  const slotsData = data.slots.error ? null : (data.slots.data ?? null)
  const findings = data.ready ? diagnose({ resources, trees, today, slots: slotsData, bookingsAfterToday: data.bookings.data ?? {} }) : null
  const findingsMap = findingsByResource(findings ?? [])

  const focusedResource = focus?.kind === 'resource' ? (resources.find((r) => r.id === focus.id) ?? null) : null
  const focusedTemplate = focus?.kind === 'template' ? (data.templates.data?.find((t) => t.id === focus.id) ?? null) : null
  const inspectorTree = focusedResource?.calendarId ? trees[focusedResource.calendarId.toLowerCase()] : focusedTemplate?.calendarId ? trees[focusedTemplate.calendarId.toLowerCase()] : null

  const showResourceRule = (resourceId: string, innerCalendarId: string | null) => {
    setView('resources')
    setFocus({ kind: 'resource', id: resourceId, blockId: innerCalendarId })
  }

  // ---- editing (Phase 3): every write goes through intents → Work Hours actions
  const targetFor = (kind: 'resource' | 'template', id: string): { name: string; target: EditTarget; tree: typeof inspectorTree } | null => {
    if (kind === 'resource') {
      const r = resources.find((x) => x.id === id)
      if (!r?.calendarId) return null
      return { name: r.name, target: { entity: 'bookableresource', calendarId: r.calendarId, resourceId: r.type === 'user' ? r.userId : null, timeZoneCode: r.timeZoneCode, useV2: settings.useV2 }, tree: trees[r.calendarId.toLowerCase()] }
    }
    const t = data.templates.data?.find((x) => x.id === id)
    if (!t?.calendarId) return null
    return { name: t.name, target: { entity: 'msdyn_workhourtemplate', calendarId: t.calendarId, resourceId: null, timeZoneCode: viewerTimeZoneCode(settings.viewerTz), useV2: settings.useV2 }, tree: trees[t.calendarId.toLowerCase()] }
  }
  const openEditor = (kind: 'resource' | 'template', id: string, request: EditorRequest) => setEditor({ kind, id, request, epoch: Date.now() })
  const editorContext = editor ? targetFor(editor.kind, editor.id) : null

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
    setTreeVersion((v) => v + 1)
  }

  const runTargets: RunTargetInput[] = [...selected].map((id) => resources.find((r) => r.id === String(id))).filter((r): r is NonNullable<typeof r> => !!r).map((r) => ({ resource: r, tree: r.calendarId ? (trees[r.calendarId.toLowerCase()] ?? null) : null }))
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
    setTreeVersion((v) => v + 1)
    const done = record.steps.filter((s) => s.status === 'done').length
    const failed = record.steps.find((s) => s.status === 'failed')
    notify(failed ? S.runs.resultFailed(failed.resourceName) : S.runs.resultOk(done), failed ? 'error' : 'ok')
  }

  const dayActionsFor = (resourceId: string): DayActions | null => {
    if (readOnly) return null
    const ctx = targetFor('resource', resourceId)
    if (!ctx?.tree) return null
    const tree = ctx.tree
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
        <div className="app__content">
          <main className="app__view">
            {!ready || (!data.ready && !data.resources.error && !data.trees.error) ? (
              <p className="loading">{S.app.loading}</p>
            ) : view === 'resources' ? (
              <ResourcesView
                resources={resources}
                trees={trees}
                slots={slotsData}
                closures={data.closures.data ?? []}
                timeOff={data.timeOff.data ?? []}
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
              <DiagnosticsView findings={findings} fromSlots={slotsData !== null} onShowResource={showResourceRule} />
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
            resourceTimeZoneCode={focusedResource?.timeZoneCode ?? (focusedTemplate ? viewerTimeZoneCode(settings.viewerTz) : undefined)}
            focusBlockId={focus?.blockId ?? null}
            onClose={() => setFocus(null)}
            today={today}
            onEdit={!readOnly && focus && targetFor(focus.kind, focus.id)?.tree ? (request) => openEditor(focus.kind, focus.id, request) : null}
          />
          {wizard ? (
            <RunWizardDrawer
              key={wizard.epoch}
              mode={wizard.mode}
              targets={runTargets}
              resources={resources}
              templates={data.templates.data ?? []}
              trees={trees}
              today={today}
              useV2={settings.useV2}
              onFinished={onRunFinished}
              onPrivilegeError={() => setReadOnly(true)}
              onClose={() => setWizard(null)}
            />
          ) : null}
          {editor && editorContext?.tree ? (
            <RuleEditorDialog
              key={editor.epoch}
              request={editor.request}
              targetName={editorContext.name}
              target={editorContext.target}
              tree={editorContext.tree}
              closures={data.closures.data ?? []}
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
