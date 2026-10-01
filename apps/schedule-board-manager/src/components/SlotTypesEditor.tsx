import { useRefData } from '../hooks/refData'
import { SLOT_FIELDS, slotLabel } from '../utils/settingsFields'
import { getAt, jsonEqual, setAt, type Json, type JsonObject } from '../utils/settingsModel'
import { Field, TextInput, ViewSelect } from './fields'

interface Props {
  settings: JsonObject
  original: JsonObject
  onChange: (next: JsonObject) => void
}

/**
 * One block per `SlotMetadataCollection` entry. The Schedule-Assistant copies
 * stored inside each entry (`ScheduleAssistantFilterLayout` + `…Id`,
 * `ScheduleAssistantResourceCellTemplate` + `…Id`) are an inline copy of a
 * configuration row; changing the ID without the copy would desync them, so
 * they stay read-only here (raw JSON tab if really needed).
 */
export function SlotTypesEditor({ settings, original, onChange }: Props) {
  const { bookingSetups } = useRefData()
  const slots = getAt(settings, ['SlotMetadataCollection'])
  if (!Array.isArray(slots) || slots.length === 0) {
    return <p className="muted full">Keine Schedule-Typen im Settings-JSON — das Board nutzt die Standardwerte.</p>
  }
  const origSlots = getAt(original, ['SlotMetadataCollection'])
  const label = (id: string) => slotLabel(id, bookingSetups)

  return (
    <div className="full slot-list">
      {slots.map((slot, i) => {
        if (slot === null || typeof slot !== 'object' || Array.isArray(slot)) return null
        const id = String(slot.BookingSetupMetadataId ?? i)
        const origSlot = Array.isArray(origSlots)
          ? origSlots.find((s) => s !== null && typeof s === 'object' && !Array.isArray(s) && s.BookingSetupMetadataId === slot.BookingSetupMetadataId)
          : undefined
        const set = (key: string, value: Json | undefined) =>
          onChange(setAt(settings, ['SlotMetadataCollection', i, key], value))
        return (
          <fieldset key={id} className="subcard">
            <legend>{label(id)}</legend>
            <div className="section__grid">
              {SLOT_FIELDS.map((f) => {
                const value = slot[f.key]
                const before = origSlot && typeof origSlot === 'object' && !Array.isArray(origSlot) ? origSlot[f.key] : undefined
                return (
                  <Field
                    key={f.key}
                    label={f.label}
                    changed={!jsonEqual(value, before)}
                    hint={f.key === 'SlotTemplate' ? 'Vorschau mit Feldauswahl im Reiter „Darstellung“.' : null}
                  >
                    {(fid) =>
                      f.kind === 'view' ? (
                        <ViewSelect
                          id={fid}
                          entity={f.viewEntity}
                          value={typeof value === 'string' ? value : null}
                          onChange={(v) => set(f.key, v ?? undefined)}
                        />
                      ) : (
                        <TextInput
                          id={fid}
                          multiline
                          mono
                          value={typeof value === 'string' ? value : null}
                          onChange={(v) => set(f.key, v ?? undefined)}
                        />
                      )
                    }
                  </Field>
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
