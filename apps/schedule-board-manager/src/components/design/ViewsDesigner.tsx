import { useCallback, useState } from 'react'
import type { BoardContent, ColumnValue, TableInfo } from '../../types/board'
import type { BoardService } from '../../services/boardService'
import { useLoad } from '../../hooks/useLoad'
import { useRefData } from '../../hooks/refData'
import { findSlot, slotEntries, slotLabel } from '../../utils/settingsFields'
import { setAt, type Json, type JsonObject } from '../../utils/settingsModel'
import { sampleFor } from '../../utils/templates'
import { viewColumns } from '../../utils/viewLayout'
import { nameById } from '../../utils/format'
import { Field, ViewSelect } from '../fields'
import { Select } from '../ui'

type ViewKind = 'tooltip' | 'details' | 'list'

interface ViewSlot {
  key: string
  group: string
  label: string
  kind: ViewKind
  entity: string
  /** Board column holding the view ID … */
  column?: string
  /** … or field of the selected `SlotMetadataCollection` entry. */
  slotKey?: string
  note: string
}

/** Every place the board shows a view's columns as tooltip, details pane or list (MS field mapping). */
const VIEW_SLOTS: ViewSlot[] = [
  {
    key: 'booking-tooltip',
    group: 'Buchung',
    label: 'Tooltip',
    kind: 'tooltip',
    entity: 'bookableresourcebooking',
    slotKey: 'TooltipViewId',
    note: 'Beim Zeigen auf eine Buchung — nur in der Stundenansicht. Tag, Woche und Monat zeigen einen vereinfachten Tooltip.',
  },
  {
    key: 'booking-details',
    group: 'Buchung',
    label: 'Detailbereich',
    kind: 'details',
    entity: 'bookableresourcebooking',
    slotKey: 'DetailsViewId',
    note: 'Detailbereich nach Auswahl einer Buchung — nur in der Stundenansicht.',
  },
  {
    key: 'req-details',
    group: 'Anforderung',
    label: 'Detailbereich',
    kind: 'details',
    entity: 'msdyn_resourcerequirement',
    slotKey: 'RequirementDetailsViewId',
    note: 'Detailbereich nach Auswahl einer Anforderung im unteren Bereich.',
  },
  {
    key: 'req-pin',
    group: 'Anforderung',
    label: 'Kartenpin-Tooltip',
    kind: 'tooltip',
    entity: 'msdyn_resourcerequirement',
    slotKey: 'UnschReqMapPinTooltipViewId',
    note: 'Beim Zeigen auf den Kartenpin einer Anforderung.',
  },
  {
    key: 'req-sa',
    group: 'Anforderung',
    label: 'Schedule-Assistant-Liste',
    kind: 'list',
    entity: 'msdyn_resourcerequirement',
    slotKey: 'RequirementDetailsPanelViewId',
    note: 'Unterer Bereich, wenn der Schedule Assistant für eine einzelne Anforderung startet.',
  },
  {
    key: 'res-tooltip',
    group: 'Ressource (Karte)',
    label: 'Kartenpin-Tooltip',
    kind: 'tooltip',
    entity: 'bookableresource',
    column: 'msdyn_schedulerresourcetooltipview',
    note: 'Beim Auswählen des Kartenpins einer Ressource.',
  },
  {
    key: 'res-details',
    group: 'Ressource (Karte)',
    label: 'Detailbereich',
    kind: 'details',
    entity: 'bookableresource',
    column: 'msdyn_schedulerresourcedetailsview',
    note: 'Detailbereich nach Auswahl des Kartenpins einer Ressource.',
  },
  {
    key: 'ou-tooltip',
    group: 'Org.-Einheit (Karte)',
    label: 'Kartenpin-Tooltip',
    kind: 'tooltip',
    entity: 'msdyn_organizationalunit',
    column: 'msdyn_organizationalunittooltipsviewid',
    note: 'Beim Auswählen des Kartenpins einer Organisationseinheit.',
  },
  {
    key: 'ou-details',
    group: 'Org.-Einheit (Karte)',
    label: 'Detailbereich',
    kind: 'details',
    entity: 'msdyn_organizationalunit',
    column: 'msdyn_organizationalunitviewid',
    note: 'Detailbereich nach Auswahl des Kartenpins einer Organisationseinheit.',
  },
]

const str = (v: Json | ColumnValue | undefined): string | null => (typeof v === 'string' && v !== '' ? v : null)

interface Props {
  draft: BoardContent
  original: BoardContent
  defaults: BoardContent | null
  settings: JsonObject | null
  origSettings: JsonObject
  defSettings: JsonObject | null
  slotIndex: number
  onSlot: (index: number) => void
  onColumn: (key: string, value: string | null) => void
  onSettings: (next: JsonObject) => void
}

export function ViewsDesigner({ draft, original, defaults, settings, origSettings, defSettings, slotIndex, onSlot, onColumn, onSettings }: Props) {
  const { views, bookingSetups } = useRefData()
  const [selected, setSelected] = useState(VIEW_SLOTS[0].key)
  const entries = slotEntries(settings)
  const entry = entries[Math.min(slotIndex, entries.length - 1)]

  const valueOf = (item: ViewSlot) => {
    if (item.column) {
      return {
        own: str(draft.columns[item.column]),
        saved: str(original.columns[item.column]),
        inherited: str(defaults?.columns[item.column]),
        available: true,
      }
    }
    const key = item.slotKey!
    return {
      own: entry ? str(entry.slot[key]) : null,
      saved: entry ? str(findSlot(origSettings, entry.id)?.[key]) : null,
      inherited: entry ? str(findSlot(defSettings, entry.id)?.[key]) : null,
      available: entry !== undefined && settings !== null,
    }
  }

  const write = (item: ViewSlot, id: string | null) => {
    if (item.column) onColumn(item.column, id)
    else if (entry && settings) onSettings(setAt(settings, ['SlotMetadataCollection', entry.index, item.slotKey!], id ?? undefined))
  }

  const item = VIEW_SLOTS.find((v) => v.key === selected)!
  const current = valueOf(item)
  const effective = current.own ?? current.inherited
  const groups = [...new Set(VIEW_SLOTS.map((v) => v.group))]

  return (
    <div className="views-designer">
      <nav className="views-designer__list" aria-label="Ansichten im Board">
        {entries.length > 0 ? (
          <label className="form-row">
            <span className="small muted">Schedule-Typ (Buchung &amp; Anforderung)</span>
            <Select
              small
              aria-label="Schedule-Typ"
              value={String(entry.index)}
              options={entries.map((e) => ({ value: String(e.index), label: slotLabel(e.id, bookingSetups) }))}
              onChange={(v) => onSlot(entries.findIndex((e) => e.index === Number(v)))}
            />
          </label>
        ) : null}
        {groups.map((g) => (
          <div key={g} className="views-designer__group">
            <h4>{g}</h4>
            {VIEW_SLOTS.filter((v) => v.group === g).map((v) => {
              const val = valueOf(v)
              const id = val.own ?? val.inherited
              return (
                <button
                  key={v.key}
                  type="button"
                  className={`view-slot${v.key === selected ? ' view-slot--active' : ''}${val.own !== val.saved ? ' view-slot--changed' : ''}`}
                  onClick={() => setSelected(v.key)}
                  disabled={!val.available}
                >
                  <span className="view-slot__label">{v.label}</span>
                  <span className="view-slot__value">
                    {!val.available ? 'keine Schedule-Typen' : id ? (nameById(views, id) ?? `Ansicht ${id.slice(0, 8)}…`) : 'nicht gesetzt'}
                    {!val.own && val.inherited ? ' · geerbt' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="views-designer__detail">
        <Field
          label={`${item.group}: ${item.label}`}
          changed={current.own !== current.saved}
          hint={!current.own && current.inherited ? `Nicht gesetzt — geerbt vom Default-Board: ${nameById(views, current.inherited) ?? current.inherited}` : null}
        >
          {(id) => <ViewSelect id={id} entity={item.entity} value={current.own} onChange={(v) => write(item, v)} />}
        </Field>
        <ViewPreview key={`${item.key}:${effective}`} viewId={effective} kind={item.kind} entity={item.entity} />
        <p className="muted small">{item.note} Beispielwerte statt echter Daten; Annäherung an das Board.</p>
      </div>
    </div>
  )
}

function ViewPreview({ viewId, kind, entity }: { viewId: string | null; kind: ViewKind; entity: string }) {
  const loadDef = useCallback((svc: BoardService) => svc.getViewDefinition(viewId!), [viewId])
  const defRes = useLoad(viewId ? `viewdef:${viewId}` : null, loadDef)
  const def = defRes.data
  const columns = def ? viewColumns(def.layoutXml, def.fetchXml, def.entity || entity) : []
  const entityKey = [...new Set([def?.entity || entity, ...columns.map((c) => c.entity)])].join(',')
  const loadInfos = useCallback(
    (svc: BoardService) => Promise.all(entityKey.split(',').map((e) => svc.getTableInfo(e).catch((): TableInfo | null => null))),
    [entityKey],
  )
  const infoRes = useLoad(def ? `tables:${entityKey}` : null, loadInfos)

  if (!viewId) {
    return <div className="notice">Nicht gesetzt — das Board nutzt die Produkt-Standardansicht. Sie lässt sich hier nicht anzeigen.</div>
  }
  if (defRes.error) return <div className="notice notice--error">Ansicht konnte nicht geladen werden: {defRes.error}</div>
  if (def === undefined) return <div className="loading">Lade Ansicht …</div>
  if (def === null) return <div className="notice notice--warn">Ansicht nicht gefunden oder nicht lesbar ({viewId}).</div>

  const infos = new Map((infoRes.data ?? []).filter((i): i is TableInfo => i !== null).map((i) => [i.logicalName, i]))
  const root = def.entity || entity
  const fields = columns.map((c) => {
    const info = infos.get(c.entity)
    const meta = info?.columns.find((m) => m.logicalName === c.attribute)
    const label = meta?.displayName ?? c.attribute
    let value = sampleFor(c.attribute, { entity: c.entity })
    if (value.startsWith('‹') && meta?.kind === 'lookup' && meta.target) value = sampleFor('name', { entity: meta.target })
    if (value.startsWith('‹') && meta?.kind === 'picklist') value = 'Auswahlwert'
    return { key: c.name, label: c.entity !== root ? `${label} (${info?.displayName ?? c.entity})` : label, value }
  })

  return (
    <div className="view-preview">
      <div className="view-preview__meta muted small">
        „{def.name}“ · {def.kind === 'personal' ? 'persönliche Ansicht' : 'Systemansicht'} · {fields.length} Spalte{fields.length === 1 ? '' : 'n'}
      </div>
      {def.entity && def.entity !== entity ? (
        <div className="notice notice--warn">
          Die Ansicht gehört zur Tabelle {def.entity}, hier erwartet das Board {entity}.
        </div>
      ) : null}
      {def.kind === 'personal' ? (
        <div className="notice notice--warn">
          Persönliche Ansicht — andere Disponenten sehen sie nur, wenn sie für sie freigegeben ist. Für geteilte Boards besser eine
          Systemansicht.
        </div>
      ) : null}
      {fields.length === 0 ? (
        <p className="muted">Die Ansicht enthält keine sichtbaren Spalten.</p>
      ) : kind === 'list' ? (
        <div className="table-wrap">
          <table className="diff-table view-preview__list">
            <thead>
              <tr>
                {fields.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {fields.map((f) => (
                  <td key={f.key}>{f.value}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : kind === 'tooltip' ? (
        <div className="tip-card" role="img" aria-label="Tooltip-Vorschau">
          <dl>
            {fields.map((f) => (
              <div key={f.key} className="tip-card__row">
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div className="details-card" role="img" aria-label="Vorschau Detailbereich">
          <div className="details-card__head">{infos.get(root)?.displayName ?? root}</div>
          {fields.map((f) => (
            <div key={f.key} className="details-card__field">
              <div className="details-card__label">{f.label}</div>
              <div>{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
