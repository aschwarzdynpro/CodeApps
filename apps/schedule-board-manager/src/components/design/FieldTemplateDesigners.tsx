import { useState, type ReactNode } from 'react'
import { Checkbox } from '@fluentui/react-components'
import { useRefData } from '../../hooks/refData'
import { findSlot, rowHeightOf, slotEntityLabel, slotEntries, slotLabel } from '../../utils/settingsFields'
import { getAt, setAt, type JsonObject } from '../../utils/settingsModel'
import {
  DEFAULT_ALERT_TEMPLATE,
  DEFAULT_BOOKING_TEMPLATE,
  SPECIAL_BOOKING_FIELDS,
  TEMPLATE_BASE_ENTITY,
  fieldPlaceholders,
  lintTemplate,
  renderFieldTemplate,
  resolveTemplate,
  sampleFor,
  type SampleContext,
  type TemplateSource,
} from '../../utils/templates'
import { Btn, Select } from '../ui'
import { FieldPalette } from './FieldPalette'
import { PreviewFrame } from './PreviewFrame'
import { alertDoc, bookingLaneDoc, laneHeight } from './previewDocs'
import { SampleTable, TemplateWorkbench } from './Workbench'

const SOURCE_LABEL: Record<TemplateSource, string> = {
  own: 'Eigene Vorlage',
  inherited: 'Geerbt vom Default-Board',
  product: 'Produkt-Standard (nicht gesetzt)',
}

function SourceBar({
  source,
  changed,
  onOwn,
  onRemove,
  children,
}: {
  source: TemplateSource
  changed: boolean
  onOwn: () => void
  onRemove: () => void
  children?: ReactNode
}) {
  return (
    <div className="design__bar">
      {children}
      <span className={`chip chip--source-${source}`}>{SOURCE_LABEL[source]}</span>
      {changed ? <span className="chip chip--changed">geändert</span> : null}
      <span className="design__bar-spacer" />
      {source === 'own' ? (
        <Btn small kind="ghost" onClick={onRemove} title="Schlüssel entfernen — das Board fällt auf Default-Board bzw. Produkt-Standard zurück">
          Eigene Vorlage entfernen
        </Btn>
      ) : (
        <Btn small onClick={onOwn}>
          Als eigene Vorlage bearbeiten
        </Btn>
      )}
    </div>
  )
}

/** Sample values for `{field}` placeholders with per-path overrides. */
function useFieldSamples(ctx: SampleContext) {
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const valueOf = (path: string) => overrides[path] ?? sampleFor(path, ctx)
  const rows = (template: string) =>
    fieldPlaceholders(template).map((p) => ({ key: p, value: valueOf(p), overridden: p in overrides }))
  return {
    valueOf,
    rows,
    set: (key: string, value: string) => setOverrides({ ...overrides, [key]: value }),
    reset: () => setOverrides({}),
  }
}

const DURATIONS = [30, 60, 90, 120, 180, 240]

// ---------------------------------------------------------------------------
// Booking tile (SlotMetadataCollection[].SlotTemplate)
// ---------------------------------------------------------------------------

export function BookingTileDesigner({
  settings,
  origSettings,
  defSettings,
  slotIndex,
  onSlot,
  onSettings,
}: {
  settings: JsonObject
  origSettings: JsonObject
  defSettings: JsonObject | null
  slotIndex: number
  onSlot: (index: number) => void
  onSettings: (next: JsonObject) => void
}) {
  const { bookingSetups } = useRefData()
  const [duration, setDuration] = useState(120)
  const [statusColor, setStatusColor] = useState('#2E7CD6')
  const [clip, setClip] = useState(true)
  const entries = slotEntries(settings)
  const entry = entries[Math.min(slotIndex, entries.length - 1)]
  const samples = useFieldSamples({ entityLabel: entry ? slotEntityLabel(entry.id, bookingSetups) : undefined, durationMinutes: duration })

  if (!entry) {
    return <p className="notice">Keine Schedule-Typen im Settings-JSON — das Board nutzt die Buchungsvorlagen des Default-Boards.</p>
  }

  const saved = findSlot(origSettings, entry.id)?.SlotTemplate
  const { source, text } = resolveTemplate(entry.slot.SlotTemplate, saved, findSlot(defSettings, entry.id)?.SlotTemplate, DEFAULT_BOOKING_TEMPLATE)
  const changed = (entry.slot.SlotTemplate ?? null) !== (saved ?? null)
  const write = (v: string | undefined) => onSettings(setAt(settings, ['SlotMetadataCollection', entry.index, 'SlotTemplate'], v))
  const rowHeight = rowHeightOf(settings, defSettings, 'hourAndDay')
  const html = renderFieldTemplate(text, samples.valueOf)

  return (
    <>
      <SourceBar source={source} changed={changed} onOwn={() => write(text)} onRemove={() => write(undefined)}>
        <div className="design__slot">
          <Select
            small
            aria-label="Schedule-Typ"
            value={String(entry.index)}
            options={entries.map((e) => ({ value: String(e.index), label: slotLabel(e.id, bookingSetups) }))}
            onChange={(v) => onSlot(entries.findIndex((e) => e.index === Number(v)))}
          />
        </div>
      </SourceBar>
      <TemplateWorkbench
        label="Buchungsvorlage (HTML)"
        value={text}
        readOnly={source !== 'own'}
        lints={lintTemplate(text, 'booking')}
        onChange={(v) => write(v)}
        palette={<FieldPalette baseEntity={TEMPLATE_BASE_ENTITY.booking} baseLabel="Buchung" specials={SPECIAL_BOOKING_FIELDS} />}
      >
        <div className="preview-controls">
          <label>
            Dauer
            <Select
              small
              aria-label="Dauer der Beispielbuchung"
              value={String(duration)}
              options={DURATIONS.map((d) => ({ value: String(d), label: d < 60 ? `${d} Min.` : `${d / 60} Std.` }))}
              onChange={(v) => setDuration(Number(v))}
            />
          </label>
          <label>
            Statusfarbe
            <input type="color" value={statusColor} aria-label="Farbe des Buchungsstatus" onChange={(e) => setStatusColor(e.target.value)} />
          </label>
          <Checkbox label="Inhalt abschneiden wie im Board" checked={clip} onChange={(e) => setClip(e.target.checked)} />
        </div>
        <PreviewFrame
          title="Vorschau Buchungskachel"
          doc={bookingLaneDoc({ html, rowHeight, durationMinutes: duration, statusColor, clip })}
          height={laneHeight(rowHeight, clip)}
        />
        <p className="muted small">
          Stundenansicht, Zeilenhöhe {rowHeight} px aus den Board-Einstellungen. Tages-, Wochen- und Monatsansicht zeigen Buchungen
          vereinfacht — dort wirkt die Vorlage nicht. Die Kachelfarbe kommt vom Buchungsstatus. Annäherung an das Board, kein Abbild.
        </p>
        <SampleTable
          rows={samples.rows(text)}
          hint="Platzhalter zeigen im Board den Wert der Buchung bzw. des verknüpften Datensatzes."
          onChange={samples.set}
          onReset={samples.reset}
        />
      </TemplateWorkbench>
    </>
  )
}

// ---------------------------------------------------------------------------
// Booking alert (msdyn_settings.BookingAlertTemplate)
// ---------------------------------------------------------------------------

export function AlertDesigner({
  settings,
  origSettings,
  defSettings,
  onSettings,
}: {
  settings: JsonObject
  origSettings: JsonObject
  defSettings: JsonObject | null
  onSettings: (next: JsonObject) => void
}) {
  const samples = useFieldSamples({})
  const path = ['BookingAlertTemplate']
  const saved = getAt(origSettings, path)
  const { source, text } = resolveTemplate(getAt(settings, path), saved, defSettings ? getAt(defSettings, path) : undefined, DEFAULT_ALERT_TEMPLATE)
  const changed = (getAt(settings, path) ?? null) !== (saved ?? null)
  const write = (v: string | undefined) => onSettings(setAt(settings, path, v))
  const html = renderFieldTemplate(text, samples.valueOf)

  return (
    <>
      <SourceBar source={source} changed={changed} onOwn={() => write(text)} onRemove={() => write(undefined)} />
      <TemplateWorkbench
        label="Vorlage Buchungswarnungen (HTML)"
        value={text}
        readOnly={source !== 'own'}
        lints={lintTemplate(text, 'alert')}
        onChange={(v) => write(v)}
        palette={<FieldPalette baseEntity={TEMPLATE_BASE_ENTITY.alert} baseLabel="Warnungsstatus" />}
      >
        <PreviewFrame title="Vorschau Buchungswarnung" doc={alertDoc(html)} height={180} />
        <p className="muted small">
          So erscheint eine Warnung im Detailbereich des Boards. Platzhalter beziehen sich auf den Status der Buchungswarnung; die
          Warnung selbst erreicht man über die Beziehung zur Buchungswarnung. Annäherung an das Board, kein Abbild.
        </p>
        <SampleTable rows={samples.rows(text)} onChange={samples.set} onReset={samples.reset} />
      </TemplateWorkbench>
    </>
  )
}
