import { useCallback, useState } from 'react'
import { Checkbox, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Textarea } from '@fluentui/react-components'
import { MoreHorizontalRegular } from '@fluentui/react-icons'
import type { Notify, OccurrenceOverride, OccurrenceRecord, Ref, Series, SeriesDefinition, SeriesSettings } from '../types/series'
import { getSeriesService, type SeriesService } from '../services/seriesService'
import { useLoad } from '../hooks/useLoad'
import { useAvailability } from '../hooks/seriesData'
import { formatDate, formatTime, isValidDate, localTimeZone, parseTime, todayIn, weekday, timeRange } from '../utils/dates'
import { editFrom, editWholeSeries, segmentIndexAt, setOverride, setSkip, validateDefinition, type SegmentValues } from '../utils/definition'
import { describeRule, expandSeries } from '../utils/recurrence'
import { closureDays, isBlocking, issueText, issuesFor, suggestAlternatives } from '../utils/availability'
import { planSeries, type PlanAction } from '../utils/planner'
import { ApplyDialog } from './ApplyDialog'
import { CalendarOverview, type CalendarItem } from './CalendarOverview'
import { LookupPicker } from './LookupPicker'
import { RecurrenceFields, type PatternForm } from './RecurrenceFields'
import { DateCell, IssueList, MoveDialog, ResourceDialog, StatusChip, type RowStatus } from './parts'
import { Btn } from './ui'

export type EditorScope = { kind: 'create' } | { kind: 'all'; seriesId: string } | { kind: 'from'; seriesId: string; from: string }

interface Loaded {
  series: Series
  records: OccurrenceRecord[]
  names: Ref[]
}

/** Loads the series for an edit scope, then hands over to the form (which initializes its state once). */
export function SeriesEditor({ scope, notify, onDone, onCancel }: { scope: EditorScope; notify: Notify; onDone: (seriesId: string) => void; onCancel: () => void }) {
  const seriesId = scope.kind === 'create' ? null : scope.seriesId
  const load = useCallback(
    async (svc: SeriesService): Promise<Loaded> => {
      const [series, records] = await Promise.all([svc.getSeries(seriesId!), svc.listOccurrences(seriesId!)])
      const ids = [...series.definition.segments.map((s) => s.resourceId), ...Object.values(series.definition.overrides).map((o) => o.resourceId)]
      const names = await svc.resolveRefs('resource', [...new Set(ids.filter((i): i is string => !!i))])
      return { series, records, names }
    },
    [seriesId],
  )
  const loaded = useLoad(seriesId ? `edit:${seriesId}` : null, load)
  const defaultStatus = useLoad('defaultStatus', loadDefaultStatus).data ?? null

  if (seriesId) {
    if (loaded.error) return <div className="notice notice--error">Serienplan konnte nicht geladen werden: {loaded.error}</div>
    if (!loaded.data) return <div className="loading">Lade Serienplan …</div>
  }
  return (
    <EditorForm
      key={seriesId ?? 'new'}
      scope={scope}
      loaded={loaded.data ?? null}
      defaultStatus={defaultStatus}
      notify={notify}
      onDone={onDone}
      onCancel={onCancel}
    />
  )
}

const loadDefaultStatus = (svc: SeriesService) => svc.defaultBookingStatus()

const EMPTY_SETTINGS: SeriesSettings = {
  name: '',
  project: null,
  projectTask: null,
  serviceAccount: null,
  workOrderType: null,
  incidentType: null,
  priceList: null,
  bookingStatus: null,
  instructions: '',
}

/** A dispatcher's decision for one occurrence in the preview. */
interface Decision {
  include?: true
  skip?: string
  override?: OccurrenceOverride
}

type Dialog = { kind: 'move'; key: string } | { kind: 'resource'; key: string } | { kind: 'apply' } | null

function initialForm(scope: EditorScope, loaded: Loaded | null, today: string): PatternForm {
  if (!loaded) {
    return { start: today, rule: { kind: 'weekly', interval: 1, weekdays: [weekday(today)] }, startTime: '08:00', endTime: '12:00', end: { kind: 'count', count: 10 }, resource: null }
  }
  const def = loaded.series.definition
  const at = scope.kind === 'from' ? scope.from : today
  const seg = def.segments[segmentIndexAt(def, at)]
  const name = loaded.names.find((n) => n.id.toLowerCase() === seg.resourceId?.toLowerCase())?.name
  return {
    start: scope.kind === 'from' ? scope.from : def.segments[0].from,
    rule: seg.rule,
    startTime: seg.startTime,
    endTime: formatTime(parseTime(seg.startTime) + seg.durationMinutes),
    end: def.end,
    resource: seg.resourceId ? { id: seg.resourceId, name: name ?? 'Ressource' } : null,
  }
}

function EditorForm({
  scope,
  loaded,
  defaultStatus,
  notify,
  onDone,
  onCancel,
}: {
  scope: EditorScope
  loaded: Loaded | null
  defaultStatus: Ref | null
  notify: Notify
  onDone: (seriesId: string) => void
  onCancel: () => void
}) {
  const series = loaded?.series ?? null
  const records = loaded?.records ?? []
  const tz = series?.definition.timeZone ?? localTimeZone()
  const today = todayIn(tz)

  const [settings, setSettings] = useState<SeriesSettings>(series?.settings ?? EMPTY_SETTINGS)
  const [form, setForm] = useState<PatternForm>(() => initialForm(scope, loaded, today))
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [keepOverrides, setKeepOverrides] = useState(true)
  const [overwriteDeviations, setOverwriteDeviations] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [known, setKnown] = useState<Map<string, string>>(() => new Map((loaded?.names ?? []).map((n) => [n.id.toLowerCase(), n.name])))

  const remember = (r: Ref | null) => {
    if (r && !known.has(r.id.toLowerCase())) setKnown(new Map(known).set(r.id.toLowerCase(), r.name))
  }
  const resourceName = (id: string | null) => (id ? (known.get(id.toLowerCase()) ?? (form.resource?.id === id ? form.resource.name : 'Ressource')) : '—')

  // ---- definition from the form --------------------------------------------
  const values: SegmentValues = {
    rule: form.rule,
    startTime: form.startTime,
    durationMinutes: parseTime(form.endTime) - parseTime(form.startTime),
    resourceId: form.resource?.id ?? null,
  }
  const startValid = isValidDate(form.start)
  const base: SeriesDefinition | null = !startValid
    ? null
    : !series
      ? { version: 1, timeZone: tz, end: form.end, segments: [{ ...values, from: form.start }], overrides: {}, skips: {} }
      : scope.kind === 'from'
        ? editFrom(series.definition, scope.from, values, form.end, { keepOverrides })
        : editWholeSeries(series.definition, form.start, values, form.end, { keepOverrides })

  const effectiveSettings: SeriesSettings = { ...settings, name: settings.name.trim() || settings.project?.name || '', bookingStatus: settings.bookingStatus ?? defaultStatus }
  const problems = [
    ...(startValid ? [] : ['Ungültiges Startdatum.']),
    ...(base ? validateDefinition(base) : []),
    ...(form.resource ? [] : ['Eine Ressource wählen.']),
    ...(effectiveSettings.name ? [] : ['Einen Namen vergeben.']),
    ...(settings.project ? [] : ['Ein Projekt wählen.']),
    ...(settings.serviceAccount ? [] : ['Ein Dienstkonto wählen.']),
    ...(settings.workOrderType ? [] : ['Einen Arbeitsauftragstyp wählen.']),
  ]
  const patternOk = base !== null && validateDefinition(base).length === 0

  // ---- dispatcher decisions, availability, automatic skips -------------------
  const inScope = (key: string) => scope.kind === 'create' || key >= (scope.kind === 'from' ? scope.from : today)
  let decided = base
  if (decided && patternOk) {
    const keys = new Set(expandSeries(decided).map((e) => e.key))
    for (const [key, d] of Object.entries(decisions)) {
      if (!keys.has(key)) continue
      if (d.override) decided = setOverride(decided, key, { ...decided.overrides[key], ...d.override })
      if (d.skip) decided = setSkip(decided, key, d.skip)
      else if (d.include) decided = setSkip(decided, key, null)
    }
  }
  const entries = decided && patternOk ? expandSeries(decided).filter((e) => inScope(e.key)) : []
  const avail = useAvailability(
    entries.map((e) => e.occurrence.resourceId),
    entries.map((e) => e.occurrence.date),
  )
  const ownWorkOrders = new Set(records.map((r) => r.workOrderId))
  const activeKeys = new Set(records.filter((r) => r.state !== 'canceled').map((r) => r.key))
  const issuesOf = new Map(entries.map((e) => [e.key, issuesFor(e.occurrence, avail.data ?? null, { ignoreWorkOrderIds: ownWorkOrders })]))

  let finalDef = decided
  const autoSkipped = new Set<string>()
  if (finalDef) {
    for (const e of entries) {
      const blocking = (issuesOf.get(e.key) ?? []).find(isBlocking)
      if (!e.skipped && blocking && blocking.kind !== 'noResource' && !decisions[e.key] && !activeKeys.has(e.key)) {
        finalDef = setSkip(finalDef, e.key, issueText(blocking))
        autoSkipped.add(e.key)
      }
    }
  }

  const now = new Date().toISOString()
  const plan: PlanAction[] = finalDef && patternOk ? planSeries(finalDef, records, { now, previous: series?.definition ?? null, overwriteDeviations }) : []
  const planByKey = new Map(plan.map((a) => [a.key, a]))
  const rows = finalDef && patternOk ? expandSeries(finalDef).filter((e) => inScope(e.key)) : []
  const writes = plan.filter((a) => a.kind !== 'keep')

  // ---- row status -------------------------------------------------------------
  const statusOf = (key: string, skipped: string | null): RowStatus => {
    const a = planByKey.get(key)
    if (skipped) return 'skipped'
    if (!a) return 'planned'
    if (a.kind === 'create') return 'new'
    if (a.kind === 'update') return 'planned'
    if (a.kind === 'cancel') return 'skipped'
    switch (a.why) {
      case 'locked':
        return a.record?.state === 'completed' ? 'completed' : a.record?.state === 'inProgress' ? 'inProgress' : 'past'
      case 'deviates':
        return 'deviates'
      case 'canceled':
        return 'canceled'
      case 'past':
        return 'past'
      default:
        return 'scheduled'
    }
  }

  const decide = (key: string, d: Decision | null) => {
    const next = { ...decisions }
    if (d) next[key] = d
    else delete next[key]
    setDecisions(next)
  }

  const pickProject = async (p: Ref | null) => {
    setSettings((s) => ({ ...s, project: p, projectTask: s.project?.id === p?.id ? s.projectTask : null }))
    if (!p) return
    try {
      const d = await (await getSeriesService()).projectDefaults(p.id)
      if (d.serviceAccount) setSettings((s) => (s.serviceAccount ? s : { ...s, serviceAccount: d.serviceAccount }))
    } catch {
      // Suggestion only.
    }
  }

  const calendarItems: CalendarItem[] = rows.map((r) => ({
    date: r.skipped ? r.key : r.occurrence.date,
    status: statusOf(r.key, r.skipped),
    label: r.skipped ? `fällt aus: ${r.skipped}` : `${timeRange(r.occurrence.startTime, r.occurrence.durationMinutes)} · ${resourceName(r.occurrence.resourceId)}`,
  }))
  const holidays = closureDays(avail.data?.closures, tz)
  const counted = rows.filter((r) => !r.skipped).length
  const title = scope.kind === 'create' ? 'Neue Serie' : scope.kind === 'from' ? `„${series?.name}“ ab ${formatDate(scope.from)} ändern` : `„${series?.name}“ bearbeiten`
  const dialogRow = dialog && (dialog.kind === 'move' || dialog.kind === 'resource') ? rows.find((r) => r.key === dialog.key) : undefined

  return (
    <div className="editor">
      <header className="editor__head">
        <div>
          <h1>{title}</h1>
          <p className="muted small">
            {scope.kind === 'from'
              ? 'Wie „Dieser und alle folgenden“ in Outlook: frühere Termine bleiben, ab diesem Termin gilt das neue Muster.'
              : scope.kind === 'all'
                ? 'Wie „Ganze Serie“ in Outlook. Vergangene, begonnene und erledigte Termine bleiben unverändert.'
                : 'Ein Arbeitsauftrag mit Buchung je Termin, verknüpft mit dem Projekt.'}
          </p>
        </div>
        <Btn onClick={onCancel}>Abbrechen</Btn>
      </header>

      <div className="editor__cols">
        <section className="card">
          <h2>Auftrag</h2>
          <div className="form-grid form-grid--2">
            <label className="form-row form-row--wide">
              <span>Name der Serie</span>
              <Input value={settings.name} placeholder={settings.project?.name ?? 'z. B. Wartung Lüftung Halle 3'} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
            </label>
            <div className="form-row">
              <span>Projekt</span>
              <LookupPicker kind="project" aria-label="Projekt" value={settings.project} onChange={(p) => void pickProject(p)} />
            </div>
            <div className="form-row">
              <span>Projektaufgabe (optional)</span>
              <LookupPicker
                kind="projectTask"
                aria-label="Projektaufgabe"
                value={settings.projectTask}
                projectId={settings.project?.id}
                disabled={!settings.project}
                onChange={(t) => setSettings({ ...settings, projectTask: t })}
              />
            </div>
            <div className="form-row">
              <span>Dienstkonto</span>
              <LookupPicker kind="account" aria-label="Dienstkonto" value={settings.serviceAccount} onChange={(a) => setSettings({ ...settings, serviceAccount: a })} />
            </div>
            <div className="form-row">
              <span>Arbeitsauftragstyp</span>
              <LookupPicker kind="workOrderType" aria-label="Arbeitsauftragstyp" value={settings.workOrderType} onChange={(t) => setSettings({ ...settings, workOrderType: t })} />
            </div>
            <div className="form-row">
              <span>Vorfalltyp (optional)</span>
              <LookupPicker kind="incidentType" aria-label="Vorfalltyp" value={settings.incidentType} onChange={(t) => setSettings({ ...settings, incidentType: t })} />
            </div>
            <div className="form-row">
              <span>Preisliste (optional)</span>
              <LookupPicker kind="priceList" aria-label="Preisliste" value={settings.priceList} onChange={(t) => setSettings({ ...settings, priceList: t })} />
            </div>
            <div className="form-row">
              <span>Buchungsstatus</span>
              <LookupPicker
                kind="bookingStatus"
                aria-label="Buchungsstatus"
                value={settings.bookingStatus}
                placeholder={defaultStatus ? `Standard: ${defaultStatus.name}` : 'Suchen …'}
                onChange={(t) => setSettings({ ...settings, bookingStatus: t })}
              />
            </div>
            <label className="form-row form-row--wide">
              <span>Anweisungen am Arbeitsauftrag</span>
              <Textarea value={settings.instructions} rows={2} onChange={(e) => setSettings({ ...settings, instructions: e.target.value })} />
            </label>
          </div>
        </section>

        <section className="card">
          <h2>Termine</h2>
          <RecurrenceFields
            value={form}
            lockStart={scope.kind === 'from'}
            startLabel={scope.kind === 'from' ? 'Gilt ab' : 'Beginn'}
            onChange={(next) => {
              remember(next.resource)
              setForm(next)
            }}
          />
          {series ? (
            <div className="editor__options">
              <Checkbox
                checked={keepOverrides}
                onChange={(e) => setKeepOverrides(!!e.target.checked)}
                label="Einzeln geänderte Termine beibehalten (verschoben, andere Ressource)"
              />
              <Checkbox
                checked={overwriteDeviations}
                onChange={(e) => setOverwriteDeviations(!!e.target.checked)}
                label="Auf dem Board geänderte Buchungen an die Serie angleichen"
              />
            </div>
          ) : null}
        </section>
      </div>

      <section className="card">
        <div className="preview__head">
          <h2>Vorschau</h2>
          <span className="muted small">
            {patternOk ? `${describeRule(form.rule)} · ${counted} Termin${counted === 1 ? '' : 'e'}` : ''}
            {avail.loading ? ' · prüfe Feiertage und Abwesenheiten …' : ''}
          </span>
        </div>
        {avail.error ? <div className="notice notice--warn">Verfügbarkeit nicht prüfbar: {avail.error}</div> : null}
        {(avail.data?.unavailable ?? []).map((u) => (
          <div key={u} className="notice notice--warn">
            {u}
          </div>
        ))}
        {autoSkipped.size ? (
          <div className="notice">
            {autoSkipped.size} Termin{autoSkipped.size === 1 ? ' fällt' : 'e fallen'} wegen Feiertag oder Abwesenheit aus. Über „…“ lassen sie sich verschieben oder
            trotzdem einplanen.
          </div>
        ) : null}
        {!patternOk ? (
          <p className="muted">Muster unvollständig — {problems.filter((p) => !p.includes('wählen') && !p.includes('Namen')).join(' ') || 'Angaben prüfen.'}</p>
        ) : (
          <>
            <CalendarOverview items={calendarItems} holidays={holidays} today={today} />
            <div className="table-wrap">
              <table className="grid occ-table">
                <thead>
                  <tr>
                    <th>Termin</th>
                    <th>Zeit</th>
                    <th>Ressource</th>
                    <th>Status</th>
                    <th>Hinweise</th>
                    <th aria-label="Aktionen" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const o = r.occurrence
                    const status = statusOf(r.key, r.skipped)
                    const locked = ['completed', 'inProgress', 'past', 'canceled'].includes(status)
                    const d = decisions[r.key]
                    return (
                      <tr key={r.key} className={r.skipped ? 'row--skipped' : undefined}>
                        <td>
                          <DateCell date={r.skipped ? r.key : o.date} original={r.skipped ? undefined : r.key} />
                        </td>
                        <td>{timeRange(o.startTime, o.durationMinutes)}</td>
                        <td>{resourceName(o.resourceId)}</td>
                        <td>
                          <StatusChip status={status} moved={!r.skipped && o.moved} />
                          {r.skipped ? <div className="small muted">{r.skipped}</div> : null}
                        </td>
                        <td>
                          <IssueList issues={issuesOf.get(r.key) ?? []} muted={!!r.skipped} />
                        </td>
                        <td className="row-actions">
                          {locked ? null : (
                            <Menu>
                              <MenuTrigger disableButtonEnhancement>
                                <Btn small kind="ghost" icon={<MoreHorizontalRegular />} aria-label={`Aktionen ${formatDate(r.key)}`} />
                              </MenuTrigger>
                              <MenuPopover>
                                <MenuList>
                                  <MenuItem onClick={() => setDialog({ kind: 'move', key: r.key })}>Verschieben …</MenuItem>
                                  {r.skipped ? (
                                    <MenuItem onClick={() => decide(r.key, { ...d, skip: undefined, include: true })}>Doch einplanen</MenuItem>
                                  ) : (
                                    <>
                                      <MenuItem onClick={() => setDialog({ kind: 'resource', key: r.key })}>Andere Ressource …</MenuItem>
                                      <MenuItem onClick={() => decide(r.key, { skip: 'In der Planung ausgelassen' })}>Auslassen</MenuItem>
                                    </>
                                  )}
                                  {d ? <MenuItem onClick={() => decide(r.key, null)}>Zurücksetzen</MenuItem> : null}
                                </MenuList>
                              </MenuPopover>
                            </Menu>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="savebar">
        <span className={problems.length ? 'warn' : undefined}>
          {problems.length
            ? problems.join(' ')
            : series
              ? `${writes.length} Termin${writes.length === 1 ? '' : 'e'} zu ändern`
              : `${writes.length} Termin${writes.length === 1 ? '' : 'e'} anzulegen`}
        </span>
        <Btn onClick={onCancel}>Abbrechen</Btn>
        <Btn kind="primary" disabled={problems.length > 0} onClick={() => setDialog({ kind: 'apply' })}>
          {series ? 'Änderungen prüfen …' : 'Serie anlegen …'}
        </Btn>
      </div>

      {dialog?.kind === 'move' && dialogRow ? (
        <MoveDialog
          title={`Termin ${formatDate(dialogRow.key)} verschieben`}
          initial={{ date: dialogRow.occurrence.date, startTime: dialogRow.occurrence.startTime, durationMinutes: dialogRow.occurrence.durationMinutes }}
          suggestions={suggestAlternatives(dialogRow.occurrence, avail.data ?? null, tz, today, { ignoreWorkOrderIds: ownWorkOrders })}
          hint={(issuesOf.get(dialogRow.key) ?? []).map(issueText).join(' · ') || undefined}
          onClose={() => setDialog(null)}
          onConfirm={(v) => {
            const d = decisions[dialogRow.key]
            decide(dialogRow.key, { include: true, override: { ...d?.override, date: v.date === dialogRow.key ? undefined : v.date, startTime: v.startTime, durationMinutes: v.durationMinutes } })
            setDialog(null)
          }}
        />
      ) : null}
      {dialog?.kind === 'resource' && dialogRow ? (
        <ResourceDialog
          title={`Ressource am ${formatDate(dialogRow.occurrence.date)}`}
          initial={dialogRow.occurrence.resourceId ? { id: dialogRow.occurrence.resourceId, name: resourceName(dialogRow.occurrence.resourceId) } : null}
          onClose={() => setDialog(null)}
          onConfirm={(res) => {
            remember(res)
            const d = decisions[dialogRow.key]
            decide(dialogRow.key, { ...d, override: { ...d?.override, resourceId: res.id } })
            setDialog(null)
          }}
        />
      ) : null}
      {dialog?.kind === 'apply' && finalDef ? (
        <ApplyDialog
          title={series ? `Änderungen an „${series.name}“` : `Serie „${effectiveSettings.name}“ anlegen`}
          description={
            <p className="small muted">
              {series
                ? 'Erst wird der Serienplan gespeichert, dann werden die Termine geschrieben.'
                : 'Erst wird der Serienplan angelegt, dann je Termin ein Arbeitsauftrag mit Buchung.'}
            </p>
          }
          actions={plan}
          resourceName={resourceName}
          confirmLabel={series ? 'Anwenden' : 'Anlegen'}
          save={async (svc) => {
            const draft = { settings: effectiveSettings, definition: finalDef! }
            if (series) return svc.updateSeries(series, draft)
            return svc.getSeries(await svc.createSeries(draft))
          }}
          onClose={(changed, id) => {
            setDialog(null)
            if (changed && id) {
              notify(series ? 'Serie aktualisiert.' : 'Serie angelegt.')
              onDone(id)
            }
          }}
        />
      ) : null}
    </div>
  )
}
