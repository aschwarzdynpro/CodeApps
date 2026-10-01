import type { CSSProperties } from 'react'
import type { BoardContent, ColumnValue } from '../../types/board'
import { cssColor, textOn, tint } from '../../utils/colors'
import { getAt, setAt, type Json, type JsonObject } from '../../utils/settingsModel'
import { ColorInput, Field } from '../fields'

interface Props {
  draft: BoardContent
  original: BoardContent
  defaults: BoardContent | null
  settings: JsonObject | null
  origSettings: JsonObject
  defSettings: JsonObject | null
  onColumn: (key: string, value: string | null) => void
  onSettings: (next: JsonObject) => void
}

type Usage = 'not' | 'partial' | 'full' | 'over'

const BOARD_COLORS: { key: string; label: string; usage?: Usage }[] = [
  { key: 'msdyn_notbookedcolor', label: 'Nicht gebucht', usage: 'not' },
  { key: 'msdyn_partiallybookedcolor', label: 'Teilweise gebucht', usage: 'partial' },
  { key: 'msdyn_fullybookedcolor', label: 'Voll gebucht', usage: 'full' },
  { key: 'msdyn_overbookedcolor', label: 'Überbucht', usage: 'over' },
  { key: 'msdyn_workinghourscolor', label: 'Außerhalb der Arbeitszeit' },
]

const SA_COLORS = [
  { key: 'msdyn_saavailablecolor', toggle: 'msdyn_saavailableicondefault', icon: 'msdyn_saavailableicon', label: 'Verfügbar', glyph: '✓' },
  { key: 'msdyn_sapartiallyavailablecolor', toggle: 'msdyn_sapartiallyavailableicondefault', icon: 'msdyn_sapartiallyavailableicon', label: 'Teilweise verfügbar', glyph: '◐' },
  { key: 'msdyn_saunavailablecolor', toggle: 'msdyn_saunavailableicondefault', icon: 'msdyn_saunavailableicon', label: 'Nicht verfügbar', glyph: '✕' },
]

const WEEKDAYS: [string, string][] = [
  ['Monday', 'Mo'],
  ['Tuesday', 'Di'],
  ['Wednesday', 'Mi'],
  ['Thursday', 'Do'],
  ['Friday', 'Fr'],
  ['Saturday', 'Sa'],
  ['Sunday', 'So'],
]

/** Utilization per resource and weekday in the daily view sample. */
const DAY_SAMPLE: { name: string; load: number[] }[] = [
  { name: 'Mara Lindqvist', load: [0, 40, 100, 125, 75, 30, 0] },
  { name: 'Jonas Feldmann', load: [50, 25, 0, 100, 0, 0, 60] },
  { name: 'Aylin Demir', load: [100, 110, 60, 0, 80, 0, 0] },
]

const usageOf = (p: number): Usage => (p === 0 ? 'not' : p < 100 ? 'partial' : p === 100 ? 'full' : 'over')

const HOURS = { from: 6, to: 20 }
const NOW_HOUR = 10 + 40 / 60

const str = (v: Json | ColumnValue | undefined): string | null => (typeof v === 'string' && v !== '' ? v : null)

/**
 * Board colors with a live preview. Per MS Learn the utilization colors
 * apply to the daily, weekly and monthly views; the hourly view colors
 * bookings by booking status and uses only the non-working-hours color and
 * the current time line from here.
 */
export function ColorDesigner({ draft, original, defaults, settings, origSettings, defSettings, onColumn, onSettings }: Props) {
  /** Effective color: own, else Default board, else null (product default, unknown here). */
  const color = (key: string) => cssColor(str(draft.columns[key])) ?? cssColor(str(defaults?.columns[key]))
  const timelineDraft = settings ? str(getAt(settings, ['CurrentTimelineColor'])) : null
  const timeline = cssColor(timelineDraft) ?? cssColor(defSettings ? str(getAt(defSettings, ['CurrentTimelineColor'])) : null)

  const workDays = WEEKDAYS.map(([key]) => {
    const own = settings ? getAt(settings, ['WorkDays', key]) : undefined
    const inherited = defSettings ? getAt(defSettings, ['WorkDays', key]) : undefined
    const v = typeof own === 'boolean' ? own : typeof inherited === 'boolean' ? inherited : null
    return v ?? !['Saturday', 'Sunday'].includes(key)
  })
  const hour = (k: 'start' | 'end', fallback: number) => {
    const own = settings ? getAt(settings, ['WorkHours', k]) : undefined
    const inherited = defSettings ? getAt(defSettings, ['WorkHours', k]) : undefined
    return typeof own === 'number' ? own : typeof inherited === 'number' ? inherited : fallback
  }
  const work = { start: hour('start', 8), end: hour('end', 17) }

  const colorField = (key: string, label: string) => {
    const value = str(draft.columns[key])
    const inherited = str(defaults?.columns[key])
    return (
      <Field
        key={key}
        label={label}
        changed={value !== str(original.columns[key])}
        hint={!value && inherited ? `Standard-Board: ${inherited}` : !value ? 'Produkt-Standard' : null}
      >
        {(id) => <ColorInput id={id} value={value} onChange={(v) => onColumn(key, v)} />}
      </Field>
    )
  }

  const swatch = (c: string | null): CSSProperties => (c ? { background: c, color: textOn(c) } : {})
  const usageColor = (u: Usage) => color(BOARD_COLORS.find((b) => b.usage === u)!.key)
  const offColor = color('msdyn_workinghourscolor')
  const hourCount = HOURS.to - HOURS.from

  return (
    <div className="color-designer">
      <div className="color-designer__form">
        <h4>Auslastung &amp; Arbeitszeit</h4>
        {BOARD_COLORS.map((c) => colorField(c.key, c.label))}
        <Field
          label="Aktuelle Zeitlinie"
          changed={timelineDraft !== (str(getAt(origSettings, ['CurrentTimelineColor'])) ?? null)}
          hint={!timelineDraft && timeline ? `Standard-Board: ${timeline.slice(1)}` : null}
        >
          {(id) => (
            <ColorInput
              id={id}
              value={timelineDraft}
              onChange={(v) => settings && onSettings(setAt(settings, ['CurrentTimelineColor'], v ?? undefined))}
            />
          )}
        </Field>
        <h4>Schedule Assistant</h4>
        {SA_COLORS.map((c) => colorField(c.key, c.label))}
        <p className="muted small">Icons und ihre Schalter stehen unter Bearbeiten → Schedule Assistant.</p>
      </div>

      <div className="color-designer__preview">
        <section className="cp">
          <h4>Tagesansicht (gilt auch für Woche und Monat)</h4>
          <div className="cp-grid" style={{ gridTemplateColumns: `150px repeat(7, minmax(44px, 1fr))` }}>
            <div className="cp-grid__corner" />
            {WEEKDAYS.map(([, short], i) => (
              <div key={short} className="cp-grid__head">
                {short} {String(5 + i).padStart(2, '0')}.10.
              </div>
            ))}
            {DAY_SAMPLE.map((r) => (
              <div key={r.name} className="cp-grid__row">
                <div className="cp-grid__res">{r.name}</div>
                {r.load.map((p, i) => {
                  const off = !workDays[i]
                  const c = off ? offColor : usageColor(usageOf(p))
                  return (
                    <div key={i} className={`cp-cell${c ? '' : ' cp-cell--unset'}`} style={swatch(c)} title={off ? 'Kein Arbeitstag' : `${p} % gebucht`}>
                      {off ? '' : `${p} %`}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <ul className="cp-legend">
            {BOARD_COLORS.map((b) => {
              const c = color(b.key)
              return (
                <li key={b.key}>
                  <span className={`cp-legend__dot${c ? '' : ' cp-cell--unset'}`} style={c ? { background: c } : undefined} />
                  {b.label}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="cp">
          <h4>Stundenansicht</h4>
          <div className="cp-hours">
            <div className="cp-hours__ruler">
              <div className="cp-hours__res" />
              {Array.from({ length: hourCount }, (_, i) => (
                <div key={i} className="cp-hours__tick">
                  {HOURS.from + i}
                </div>
              ))}
            </div>
            {[
              { name: 'Mara Lindqvist', from: 9, to: 11.5 },
              { name: 'Jonas Feldmann', from: 13, to: 15 },
            ].map((r) => (
              <div key={r.name} className="cp-hours__row">
                <div className="cp-hours__res">{r.name}</div>
                <div className="cp-hours__track">
                  {Array.from({ length: hourCount }, (_, i) => {
                    const h = HOURS.from + i
                    const off = h < work.start || h >= work.end
                    return (
                      <div
                        key={i}
                        className={`cp-hours__slot${off && !offColor ? ' cp-cell--unset' : ''}`}
                        style={off && offColor ? { background: offColor } : undefined}
                      />
                    )
                  })}
                  <div
                    className="cp-hours__booking"
                    style={{ left: `${((r.from - HOURS.from) / hourCount) * 100}%`, width: `${((r.to - r.from) / hourCount) * 100}%` }}
                  >
                    Buchung (Statusfarbe)
                  </div>
                  <div
                    className="cp-hours__now"
                    style={{ left: `${((NOW_HOUR - HOURS.from) / hourCount) * 100}%`, background: timeline ?? undefined }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="muted small">
            Arbeitszeit {work.start}–{work.end} Uhr aus den Board-Einstellungen. Buchungen färbt das Board nach Buchungsstatus, nicht nach
            diesen Farben.
          </p>
        </section>

        <section className="cp">
          <h4>Schedule Assistant</h4>
          <div className="cp-sa">
            {SA_COLORS.map((c) => {
              const bg = color(c.key)
              const toggle = draft.columns[c.toggle] ?? defaults?.columns[c.toggle] ?? null
              const icon = str(draft.columns[c.icon]) ?? str(defaults?.columns[c.icon])
              const custom = icon !== null && !icon.includes('/fps/ScheduleBoard/')
              return (
                <div key={c.key} className={`cp-sa__cell${bg ? '' : ' cp-cell--unset'}`} style={bg ? { background: tint(bg, 0.55), borderColor: bg } : undefined}>
                  {toggle === false ? null : (
                    <span className="cp-sa__icon" style={bg ? { background: bg, color: textOn(bg) } : undefined} title={custom ? `Eigenes Icon: ${icon}` : 'Standard-Icon'}>
                      {custom ? '⧉' : c.glyph}
                    </span>
                  )}
                  <span>{c.label}</span>
                </div>
              )
            })}
          </div>
          <p className="muted small">
            Verfügbarkeit je Zeitfenster in der Ergebnisliste. Eigene Icons sind Web-Ressourcen; die Vorschau zeigt sie als ⧉.
          </p>
        </section>
        <p className="muted small">Schraffiert: nicht gesetzt — das Board nutzt dann den Produkt-Standard.</p>
      </div>
    </div>
  )
}
