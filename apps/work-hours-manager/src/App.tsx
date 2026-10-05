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
import { DiagnosticsView } from './components/diagnostics/DiagnosticsView'
import { TemplatesView } from './components/views/TemplatesView'
import { HolidaysView } from './components/views/HolidaysView'
import { RunsView } from './components/views/RunsView'
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
  const [treeVersion] = useState(0)
  const [readOnly] = useState(false)

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
  void notify

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

  const errors = [
    data.resources.error && S.app.loadError('Ressourcen', data.resources.error),
    data.trees.error && S.app.loadError('Kalenderregeln', data.trees.error),
    data.closures.error && S.app.loadError('Geschäftsschließungen', data.closures.error),
    data.timeOff.error && S.app.loadError('Abwesenheitsanträge', data.timeOff.error),
  ].filter((e): e is string => !!e)

  return (
    <div className="app">
      <AppNav view={view} onChange={setView} badges={{ diagnostics: findings?.length || undefined }} />
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
          onHelp={() => notify('Hilfe folgt in Phase 5.')}
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
              />
            ) : view === 'templates' ? (
              <TemplatesView templates={data.templates.data} trees={trees} focusedId={focusedTemplate?.id ?? null} onFocus={(id) => setFocus({ kind: 'template', id, blockId: null })} />
            ) : view === 'holidays' ? (
              <HolidaysView year={holidayYear} onYear={setHolidayYear} closures={yearClosures.data} error={yearClosures.error} viewerTz={settings.viewerTz} />
            ) : view === 'diagnostics' ? (
              <DiagnosticsView findings={findings} fromSlots={slotsData !== null} onShowResource={showResourceRule} />
            ) : view === 'runs' ? (
              <RunsView />
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
          />
        </div>
      </div>
      <Toaster toasterId={toasterId} position="bottom-end" />
    </div>
  )
}
