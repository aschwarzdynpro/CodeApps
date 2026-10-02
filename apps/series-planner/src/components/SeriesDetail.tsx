import { useCallback, useState } from 'react'
import { Button, Input, Menu, MenuDivider, MenuItem, MenuList, MenuPopover, MenuTrigger } from '@fluentui/react-components'
import { MoreHorizontalRegular, OpenRegular } from '@fluentui/react-icons'
import type { Notify, OccurrenceRecord, PlannedOccurrence, Ref, Series, SeriesDefinition } from '../types/series'
import type { SeriesService } from '../services/seriesService'
import { useLoad } from '../hooks/useLoad'
import { useAvailability } from '../hooks/seriesData'
import { formatDate, formatDateWithDay, todayIn, utcToZoned, timeRange } from '../utils/dates'
import { endSeriesAfter, serializeDefinition, setOverride, setSkip } from '../utils/definition'
import { expandSeries, describeSeries } from '../utils/recurrence'
import { closureDays, issuesFor, suggestAlternatives } from '../utils/availability'
import { countActions, planSeries, recordMatches, type PlanAction } from '../utils/planner'
import { recordUrl } from '../config'
import { ApplyDialog } from './ApplyDialog'
import { CalendarOverview, type CalendarItem } from './CalendarOverview'
import { Modal } from './Modal'
import { DateCell, IssueList, MoveDialog, ReasonDialog, ResourceDialog, StatusChip, type RowStatus } from './parts'
import type { EditorScope } from './SeriesEditor'
import { Btn } from './ui'

interface Loaded {
  series: Series
  records: OccurrenceRecord[]
  names: Ref[]
}

interface Row {
  key: string
  /** What the series wants (skipped ones too, for display). */
  occ: PlannedOccurrence
  skipped: string | null
  record: OccurrenceRecord | null
  status: RowStatus
  /** Date and time as they really are (booking), else as planned. */
  shown: { date: string; startTime: string; durationMinutes: number; resourceId: string | null }
}

type Dialog =
  | { kind: 'move' | 'resource' | 'cancel'; row: Row }
  | { kind: 'end' }
  | { kind: 'apply'; title: string; actions: PlanAction[]; definition: SeriesDefinition }
  | null

export function SeriesDetail({
  seriesId,
  notify,
  onEdit,
  onChanged,
}: {
  seriesId: string
  notify: Notify
  onEdit: (scope: EditorScope) => void
  onChanged: () => void
}) {
  const load = useCallback(
    async (svc: SeriesService): Promise<Loaded> => {
      const [series, records] = await Promise.all([svc.getSeries(seriesId), svc.listOccurrences(seriesId)])
      const ids = [
        ...series.definition.segments.map((s) => s.resourceId),
        ...Object.values(series.definition.overrides).map((o) => o.resourceId),
        ...records.map((r) => r.resource?.id),
      ]
      const names = await svc.resolveRefs('resource', [...new Set(ids.filter((i): i is string => !!i).map((i) => i.toLowerCase()))])
      return { series, records, names }
    },
    [seriesId],
  )
  const { data, error, loading, reload } = useLoad(`detail:${seriesId}`, load)
  const [dialog, setDialog] = useState<Dialog>(null)
  // Names of resources picked in a dialog, until the reload brings them.
  const [picked, setPicked] = useState<Ref[]>([])

  const series = data?.series ?? null
  const def = series?.definition ?? null
  const records = data?.records ?? []
  const tz = def?.timeZone ?? 'Europe/Berlin'
  const today = todayIn(tz)
  const now = new Date().toISOString()
  const names = new Map((data?.names ?? []).map((n) => [n.id.toLowerCase(), n.name]))
  for (const r of records) if (r.resource?.name) names.set(r.resource.id.toLowerCase(), r.resource.name)
  for (const r of picked) names.set(r.id.toLowerCase(), r.name)
  const resourceName = (id: string | null) => (id ? (names.get(id.toLowerCase()) ?? 'Ressource') : '—')

  // ---- rows: pattern entries merged with the work orders ----------------------
  const entries = def ? expandSeries(def) : []
  const active = new Map<string, OccurrenceRecord>()
  const canceled = new Map<string, OccurrenceRecord>()
  for (const r of records) {
    const map = r.state === 'canceled' ? canceled : active
    if (!map.has(r.key)) map.set(r.key, r)
  }
  const keys = new Set(entries.map((e) => e.key))
  const nowMs = Date.parse(now)

  const rows: Row[] = entries.map((e) => {
    const rec = active.get(e.key) ?? canceled.get(e.key) ?? null
    let status: RowStatus
    if (rec && rec.state !== 'canceled') {
      if (rec.state === 'completed' || rec.state === 'inProgress') status = rec.state
      else if (e.skipped) status = 'orphan'
      else if (rec.state === 'unscheduled') status = 'unscheduled'
      else if (recordMatches(rec, e.occurrence)) status = 'scheduled'
      else status = rec.start && Date.parse(rec.start) < nowMs ? 'past' : 'deviates'
    } else if (e.skipped) status = 'skipped'
    else if (rec) status = 'canceled'
    else status = Date.parse(e.occurrence.start) < nowMs ? 'past' : 'missing'
    const live = rec && rec.state !== 'canceled' && rec.start && rec.end
    const shown = live
      ? {
          date: utcToZoned(rec.start!, tz).date,
          startTime: utcToZoned(rec.start!, tz).time,
          durationMinutes: Math.round((Date.parse(rec.end!) - Date.parse(rec.start!)) / 60_000),
          resourceId: rec.resource?.id ?? null,
        }
      : { date: e.occurrence.date, startTime: e.occurrence.startTime, durationMinutes: e.occurrence.durationMinutes, resourceId: e.occurrence.resourceId }
    return { key: e.key, occ: e.occurrence, skipped: e.skipped, record: rec, status, shown }
  })
  // Work orders of the series whose date is no longer in the pattern.
  for (const r of active.values()) {
    if (keys.has(r.key)) continue
    const start = r.start ? utcToZoned(r.start, tz) : { date: r.key, time: '00:00' }
    const occ: PlannedOccurrence = { key: r.key, date: start.date, startTime: start.time, durationMinutes: 0, resourceId: r.resource?.id ?? null, start: r.start ?? now, end: r.end ?? now, moved: false, segmentIndex: 0 }
    rows.push({ key: r.key, occ, skipped: null, record: r, status: r.state === 'completed' ? 'completed' : 'orphan', shown: { date: start.date, startTime: start.time, durationMinutes: r.start && r.end ? Math.round((Date.parse(r.end) - Date.parse(r.start)) / 60_000) : 0, resourceId: r.resource?.id ?? null } })
  }
  rows.sort((a, b) => a.key.localeCompare(b.key))

  const upcoming = rows.filter((r) => ['scheduled', 'deviates', 'unscheduled', 'missing'].includes(r.status))
  const avail = useAvailability(
    upcoming.map((r) => r.shown.resourceId),
    upcoming.map((r) => r.shown.date),
  )
  const ownWorkOrders = new Set(records.map((r) => r.workOrderId))
  const issuesOf = (r: Row) => {
    if (!upcoming.includes(r)) return []
    const start = r.record?.start && r.status !== 'missing' ? r.record.start : r.occ.start
    const end = r.record?.end && r.status !== 'missing' ? r.record.end : r.occ.end
    return issuesFor({ start, end, resourceId: r.shown.resourceId }, avail.data ?? null, { ignoreWorkOrderIds: ownWorkOrders })
  }

  const sync = def ? planSeries(def, records, { now, previous: def, overwriteDeviations: false }) : []
  const syncCount = sync.filter((a) => a.kind !== 'keep').length

  if (error) return <div className="notice notice--error">Serienplan konnte nicht geladen werden: {error}</div>
  if (!series || !def) return <div className="loading">Lade Serienplan …</div>

  /** Plans `next` for the given keys and opens the preview. */
  const propose = (title: string, next: SeriesDefinition, opts: { onlyKeys?: string[]; recreate?: string[]; overwrite?: boolean } = {}) => {
    const actions = planSeries(next, records, {
      now,
      previous: def,
      overwriteDeviations: opts.overwrite ?? false,
      onlyKeys: opts.onlyKeys ? new Set(opts.onlyKeys) : undefined,
      recreate: opts.recreate ? new Set(opts.recreate) : undefined,
    })
    setDialog({ kind: 'apply', title, actions, definition: next })
  }

  const counts = {
    total: rows.filter((r) => r.status !== 'orphan').length,
    open: rows.filter((r) => ['scheduled', 'deviates', 'unscheduled', 'missing'].includes(r.status)).length,
    done: rows.filter((r) => r.status === 'completed').length,
    skipped: rows.filter((r) => r.status === 'skipped' || r.status === 'canceled').length,
  }
  const settings = series.settings
  const calendarItems: CalendarItem[] = rows.map((r) => ({
    date: r.status === 'skipped' ? r.key : r.shown.date,
    status: r.status,
    label: `${r.record?.workOrderName ?? 'ohne Arbeitsauftrag'} · ${timeRange(r.shown.startTime, r.shown.durationMinutes)} · ${resourceName(r.shown.resourceId)}`,
  }))

  return (
    <section className="detail">
      <header className="detail__header">
        <div>
          <h1 className="detail__title">
            {series.name}
            {loading ? <span className="muted small"> · aktualisiere …</span> : null}
          </h1>
          <div className="detail__meta">
            <span className={`badge ${series.active ? 'badge--ok' : 'badge--inactive'}`}>{series.active ? 'Aktiv' : 'Inaktiv'}</span>
            <span>{describeSeries(def)}</span>
          </div>
          <div className="detail__meta">
            <span>Projekt: {settings.project?.name ?? '—'}</span>
            {settings.projectTask ? <span>Aufgabe: {settings.projectTask.name}</span> : null}
            <span>Dienstkonto: {settings.serviceAccount?.name ?? '—'}</span>
            <span>Typ: {settings.workOrderType?.name ?? '—'}</span>
          </div>
        </div>
        <div className="detail__actions">
          <Btn kind="primary" onClick={() => onEdit({ kind: 'all', seriesId })}>
            Serie bearbeiten
          </Btn>
          <Btn onClick={() => propose('Mit der Serie abgleichen', def)} disabled={syncCount === 0} title="Fehlende Termine anlegen, offene buchen, Termine außerhalb des Musters absagen">
            Abgleichen{syncCount ? ` (${syncCount})` : ''}
          </Btn>
          <Btn kind="ghost" onClick={() => setDialog({ kind: 'end' })}>
            Serie beenden …
          </Btn>
        </div>
      </header>

      <div className="stats">
        <span>
          <strong>{counts.total}</strong> Termine
        </span>
        <span>
          <strong>{counts.open}</strong> offen
        </span>
        <span>
          <strong>{counts.done}</strong> erledigt
        </span>
        <span>
          <strong>{counts.skipped}</strong> ausgefallen
        </span>
        {countActions(sync).deviates ? (
          <span className="warn">
            <strong>{countActions(sync).deviates}</strong> auf dem Board geändert
          </span>
        ) : null}
      </div>

      {avail.error ? <div className="notice notice--warn">Verfügbarkeit nicht prüfbar: {avail.error}</div> : null}
      {(avail.data?.unavailable ?? []).map((u) => (
        <div key={u} className="notice notice--warn">
          {u}
        </div>
      ))}

      <CalendarOverview items={calendarItems} holidays={closureDays(avail.data?.closures, tz)} today={today} />

      <div className="table-wrap">
        <table className="grid occ-table">
          <thead>
            <tr>
              <th>Termin</th>
              <th>Zeit</th>
              <th>Ressource</th>
              <th>Arbeitsauftrag</th>
              <th>Status</th>
              <th>Hinweise</th>
              <th aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const url = r.record ? recordUrl('msdyn_workorder', r.record.workOrderId) : null
              const future = Date.parse(r.occ.start) >= nowMs || (r.record?.start ? Date.parse(r.record.start) >= nowMs : false)
              return (
                <tr key={`${r.key}-${r.record?.workOrderId ?? ''}`} className={r.status === 'skipped' || r.status === 'canceled' ? 'row--skipped' : undefined}>
                  <td>
                    <DateCell date={r.status === 'skipped' ? r.key : r.shown.date} original={r.status === 'skipped' ? undefined : r.key} />
                  </td>
                  <td>{r.shown.durationMinutes ? timeRange(r.shown.startTime, r.shown.durationMinutes) : '—'}</td>
                  <td>{resourceName(r.shown.resourceId)}</td>
                  <td>
                    {r.record ? (
                      url ? (
                        <Button as="a" appearance="transparent" size="small" href={url} target="_blank" rel="noreferrer" icon={<OpenRegular />} iconPosition="after">
                          {r.record.workOrderName}
                        </Button>
                      ) : (
                        r.record.workOrderName
                      )
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <StatusChip status={r.status} moved={r.status === 'scheduled' && r.occ.moved} />
                    {r.skipped ? <div className="small muted">{r.skipped}</div> : null}
                  </td>
                  <td>
                    <IssueList issues={issuesOf(r)} />
                  </td>
                  <td className="row-actions">
                    <RowMenu
                      row={r}
                      future={future}
                      onMove={() => setDialog({ kind: 'move', row: r })}
                      onResource={() => setDialog({ kind: 'resource', row: r })}
                      onCancel={() => setDialog({ kind: 'cancel', row: r })}
                      onRestore={() => propose(`Termin ${formatDate(r.key)} wiederherstellen`, setSkip(def, r.key, null), { onlyKeys: [r.key], recreate: [r.key] })}
                      onAlign={() => propose(`Termin ${formatDate(r.key)} an die Serie angleichen`, def, { onlyKeys: [r.key], overwrite: true })}
                      onAccept={() => {
                        const s = r.shown
                        propose(
                          `Änderung am ${formatDate(r.key)} in die Serie übernehmen`,
                          setOverride(def, r.key, { date: s.date === r.key ? undefined : s.date, startTime: s.startTime, durationMinutes: s.durationMinutes, resourceId: s.resourceId }),
                          { onlyKeys: [r.key] },
                        )
                      }}
                      onBook={() => propose(`Termin ${formatDate(r.key)} anlegen`, def, { onlyKeys: [r.key] })}
                      onFromHere={() => onEdit({ kind: 'from', seriesId, from: r.key })}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {dialog?.kind === 'move' ? (
        <MoveDialog
          title={`Termin ${formatDate(dialog.row.key)} verschieben`}
          initial={dialog.row.shown}
          suggestions={suggestAlternatives({ ...dialog.row.shown }, avail.data ?? null, tz, today, { ignoreWorkOrderIds: ownWorkOrders })}
          hint="Nur dieser Termin — wie „Nur dieses Vorkommen“ in Outlook."
          onClose={() => setDialog(null)}
          onConfirm={(v) =>
            propose(
              `Termin ${formatDate(dialog.row.key)} verschieben`,
              setOverride(def, dialog.row.key, { ...def.overrides[dialog.row.key], date: v.date === dialog.row.key ? undefined : v.date, startTime: v.startTime, durationMinutes: v.durationMinutes }),
              { onlyKeys: [dialog.row.key], overwrite: true },
            )
          }
        />
      ) : null}
      {dialog?.kind === 'resource' ? (
        <ResourceDialog
          title={`Ressource am ${formatDate(dialog.row.shown.date)}`}
          initial={dialog.row.shown.resourceId ? { id: dialog.row.shown.resourceId, name: resourceName(dialog.row.shown.resourceId) } : null}
          onClose={() => setDialog(null)}
          onConfirm={(res) => {
            setPicked([...picked, res])
            propose(`Ressource am ${formatDate(dialog.row.key)} ändern`, setOverride(def, dialog.row.key, { ...def.overrides[dialog.row.key], resourceId: res.id }), {
              onlyKeys: [dialog.row.key],
              overwrite: true,
            })
          }}
        />
      ) : null}
      {dialog?.kind === 'cancel' ? (
        <ReasonDialog
          title={`Termin ${formatDate(dialog.row.key)} absagen`}
          message="Arbeitsauftrag und Buchung werden abgesagt (nicht gelöscht). Die Serie merkt sich den Ausfall; „Wiederherstellen“ legt den Termin neu an."
          initial="Abgesagt"
          confirmLabel="Weiter"
          onClose={() => setDialog(null)}
          onConfirm={(reason) => propose(`Termin ${formatDate(dialog.row.key)} absagen`, setSkip(def, dialog.row.key, reason), { onlyKeys: [dialog.row.key] })}
        />
      ) : null}
      {dialog?.kind === 'end' ? (
        <EndDialog
          today={today}
          onClose={() => setDialog(null)}
          onConfirm={(last) => propose(`Serie nach dem ${formatDate(last)} beenden`, endSeriesAfter(def, last))}
        />
      ) : null}
      {dialog?.kind === 'apply' ? (
        <ApplyDialog
          title={dialog.title}
          actions={dialog.actions}
          resourceName={resourceName}
          confirmLabel="Anwenden"
          save={async (svc) =>
            serializeDefinition(dialog.definition) === serializeDefinition(def) ? series : svc.updateSeries(series, { settings: series.settings, definition: dialog.definition })
          }
          onClose={(changed) => {
            setDialog(null)
            if (changed) {
              notify('Serie aktualisiert.')
              reload()
              onChanged()
            }
          }}
        />
      ) : null}
    </section>
  )
}

function RowMenu({
  row,
  future,
  onMove,
  onResource,
  onCancel,
  onRestore,
  onAlign,
  onAccept,
  onBook,
  onFromHere,
}: {
  row: Row
  future: boolean
  onMove: () => void
  onResource: () => void
  onCancel: () => void
  onRestore: () => void
  onAlign: () => void
  onAccept: () => void
  onBook: () => void
  onFromHere: () => void
}) {
  const s = row.status
  if (!future || s === 'completed' || s === 'inProgress' || s === 'past') return null
  const editable = s === 'scheduled' || s === 'deviates' || s === 'unscheduled' || s === 'missing'
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Btn small kind="ghost" icon={<MoreHorizontalRegular />} aria-label={`Aktionen ${formatDateWithDay(row.key)}`} />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {s === 'missing' ? <MenuItem onClick={onBook}>Jetzt anlegen und buchen</MenuItem> : null}
          {s === 'unscheduled' ? <MenuItem onClick={onBook}>Jetzt buchen</MenuItem> : null}
          {s === 'deviates' ? <MenuItem onClick={onAlign}>An Serie angleichen</MenuItem> : null}
          {s === 'deviates' ? <MenuItem onClick={onAccept}>Änderung in die Serie übernehmen</MenuItem> : null}
          {editable ? <MenuItem onClick={onMove}>Nur diesen Termin verschieben …</MenuItem> : null}
          {editable ? <MenuItem onClick={onResource}>Nur für diesen Termin andere Ressource …</MenuItem> : null}
          {editable || s === 'orphan' ? <MenuItem onClick={onCancel}>Termin absagen …</MenuItem> : null}
          {s === 'skipped' || s === 'canceled' ? <MenuItem onClick={onRestore}>Wiederherstellen</MenuItem> : null}
          {s !== 'orphan' ? (
            <>
              <MenuDivider />
              <MenuItem onClick={onFromHere}>Diesen und alle folgenden ändern …</MenuItem>
            </>
          ) : null}
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}

function EndDialog({ today, onClose, onConfirm }: { today: string; onClose: () => void; onConfirm: (lastDate: string) => void }) {
  const [last, setLast] = useState(today)
  return (
    <Modal
      title="Serie beenden"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Abbrechen</Btn>
          <Btn kind="danger" disabled={!last} onClick={() => onConfirm(last)}>
            Weiter
          </Btn>
        </>
      }
    >
      <p className="small">Termine nach diesem Datum werden abgesagt, frühere bleiben. Die Vorschau zeigt, was passiert.</p>
      <label className="form-row">
        <span>Letzter Termin am oder vor</span>
        <Input type="date" value={last} onChange={(e) => setLast(e.target.value)} />
      </label>
    </Modal>
  )
}
