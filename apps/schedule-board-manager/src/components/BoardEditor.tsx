import type { ReactNode } from 'react'
import {
  BOARD_COLUMNS,
  BOARD_LOOKUPS,
  SHARE_TYPE,
  SHARE_TYPE_LABEL,
  type BoardContent,
  type ColumnDef,
  type ColumnValue,
} from '../types/board'
import { useRefData } from '../hooks/refData'
import { SETTING_DEFS, type SettingDef, type SettingSection } from '../utils/settingsFields'
import {
  getAt,
  jsonEqual,
  parseSettings,
  readFlag,
  serializeSettings,
  setAt,
  writeFlag,
  type Json,
  type JsonObject,
  type PathSeg,
} from '../utils/settingsModel'
import { formatValue, nameById } from '../utils/format'
import type { Protection } from '../utils/boardRules'
import {
  BoolSelect,
  ColorInput,
  ConfigSelect,
  Field,
  IntInput,
  TextInput,
  TimeZoneSelect,
  ViewSelect,
} from './fields'
import { SlotTypesEditor } from './SlotTypesEditor'
import { PanelsEditor } from './PanelsEditor'
import { Input } from '@fluentui/react-components'
import { Switch } from '@fluentui/react-components'
import { Select } from './ui'

interface Props {
  draft: BoardContent
  original: BoardContent
  /** Default board content — shown as the inherited value for unset fields. */
  defaults: BoardContent | null
  protection: Protection
  onChange: (next: BoardContent) => void
}

const col = (key: string): ColumnDef => BOARD_COLUMNS.find((c) => c.key === key)!

const SECTION_COLUMNS: Record<string, string[]> = {
  colors: ['msdyn_fullybookedcolor', 'msdyn_partiallybookedcolor', 'msdyn_notbookedcolor', 'msdyn_overbookedcolor', 'msdyn_workinghourscolor'],
  sa: [
    'msdyn_bookbasedon',
    'msdyn_saavailablecolor',
    'msdyn_sapartiallyavailablecolor',
    'msdyn_saunavailablecolor',
    'msdyn_saavailableicondefault',
    'msdyn_saavailableicon',
    'msdyn_sapartiallyavailableicondefault',
    'msdyn_sapartiallyavailableicon',
    'msdyn_saunavailableicondefault',
    'msdyn_saunavailableicon',
  ],
  map: [
    'msdyn_schedulerresourcetooltipview',
    'msdyn_schedulerresourcedetailsview',
    'msdyn_unscheduledrequirementsviewid',
    'msdyn_organizationalunittooltipsviewid',
    'msdyn_organizationalunitviewid',
  ],
  other: ['msdyn_unscheduledwopagereccount', 'msdyn_scheduleralertsview', 'msdyn_hidecancelled', 'msdyn_issynchronizeresources', 'msdyn_mapviewtabplacement'],
  webresource: ['msdyn_customtabname', 'msdyn_customtabwebresource'],
}

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="section" open={open}>
      <summary className="section__title">{title}</summary>
      <div className="section__grid">{children}</div>
    </details>
  )
}

export function BoardEditor({ draft, original, defaults, protection, onChange }: Props) {
  const { views, configs, timeZones } = useRefData()
  const parsed = parseSettings(draft.settings)
  const settings: JsonObject | null = parsed.ok ? parsed.value : null
  const origParsed = parseSettings(original.settings)
  const origSettings: JsonObject = origParsed.ok ? origParsed.value : {}
  const defParsed = parseSettings(defaults?.settings ?? null)
  const defSettings: JsonObject = defParsed.ok ? defParsed.value : {}

  const resolve = (id: string) => nameById(views, id) ?? nameById(configs, id) ?? nameById(timeZones, id)

  const setColumn = (key: string, value: ColumnValue) =>
    onChange({ ...draft, columns: { ...draft.columns, [key]: value } })

  const setSettings = (next: JsonObject) => onChange({ ...draft, settings: serializeSettings(next) })
  const setSetting = (path: PathSeg[], value: Json | undefined) => {
    if (settings) setSettings(setAt(settings, path, value))
  }

  const inheritHint = (current: unknown, inherited: Json | undefined): ReactNode =>
    (current === null || current === undefined) && inherited !== undefined && inherited !== null
      ? `Standard-Board: ${formatValue(inherited, resolve)}`
      : null

  const renderColumn = (key: string) => {
    const def = col(key)
    const value = draft.columns[key] ?? null
    const changed = value !== (original.columns[key] ?? null)
    const hint = defaults ? inheritHint(value, defaults.columns[key] as Json) : null
    return (
      <Field key={key} label={def.label} changed={changed} hint={hint}>
        {(id) => {
          switch (def.kind) {
            case 'color':
              return <ColorInput id={id} value={value as string | null} onChange={(v) => setColumn(key, v)} />
            case 'bool':
              return <BoolSelect id={id} value={value as boolean | null} onChange={(v) => setColumn(key, v)} />
            case 'int':
              return <IntInput id={id} value={value as number | null} onChange={(v) => setColumn(key, v)} />
            case 'view':
              return <ViewSelect id={id} entity={def.viewEntity} value={value as string | null} onChange={(v) => setColumn(key, v)} />
            default:
              return <TextInput id={id} value={value as string | null} mono={def.kind === 'icon'} onChange={(v) => setColumn(key, v)} />
          }
        }}
      </Field>
    )
  }

  const renderSetting = (def: SettingDef) => {
    if (!settings) return null
    const key = def.path.join('.')
    const value = getAt(settings, def.path)
    const changed = !jsonEqual(value, getAt(origSettings, def.path))
    const inherited = getAt(defSettings, def.path)
    const hint = def.help ?? (defaults ? inheritHint(value, inherited) : null)
    return (
      <Field key={key} label={def.label} changed={changed} hint={hint}>
        {(id) => {
          switch (def.kind) {
            case 'flag':
              return (
                <Switch
                  id={id}
                  checked={readFlag(settings, def.path)}
                  onChange={(e) => setSettings(writeFlag(settings, def.path, e.target.checked, def.onValue ?? 1))}
                />
              )
            case 'intBool':
              return (
                <BoolSelect
                  id={id}
                  value={value === undefined || value === null ? null : value === 1 || value === true}
                  onChange={(v) => setSetting(def.path, v === null ? undefined : v ? 1 : 0)}
                />
              )
            case 'bool':
              return (
                <BoolSelect
                  id={id}
                  value={typeof value === 'boolean' ? value : null}
                  onChange={(v) => setSetting(def.path, v === null ? undefined : v)}
                />
              )
            case 'int':
              return (
                <IntInput
                  id={id}
                  value={typeof value === 'number' ? value : null}
                  min={def.min}
                  max={def.max}
                  onChange={(v) => setSetting(def.path, v === null ? undefined : v)}
                />
              )
            case 'color':
              return (
                <ColorInput
                  id={id}
                  value={typeof value === 'string' ? value : null}
                  onChange={(v) => setSetting(def.path, v === null ? undefined : v)}
                />
              )
            case 'select':
              return (
                <Select
                  id={id}
                  className="input"
                  value={value === undefined || value === null ? '' : String(value)}
                  options={[{ value: '', label: 'nicht gesetzt' }, ...(def.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))]}
                  onChange={(v) => setSetting(def.path, v === '' ? undefined : v)}
                />
              )
            case 'timezone':
              return (
                <TimeZoneSelect
                  id={id}
                  value={typeof value === 'string' ? value : null}
                  onChange={(v) => setSetting(def.path, v === null ? undefined : v)}
                />
              )
            default:
              return (
                <TextInput
                  id={id}
                  multiline={def.kind === 'longtext'}
                  mono={def.kind === 'longtext'}
                  value={typeof value === 'string' ? value : null}
                  onChange={(v) => setSetting(def.path, v === null ? undefined : v)}
                />
              )
          }
        }}
      </Field>
    )
  }

  const settingsIn = (section: SettingSection) => SETTING_DEFS.filter((d) => d.section === section).map(renderSetting)

  const shareType = Number(draft.columns.msdyn_sharetype)
  const name = (draft.columns.msdyn_tabname as string | null) ?? ''

  return (
    <div className="editor">
      {!settings ? (
        <div className="notice notice--error">
          Das Settings-JSON ist ungültig ({parsed.ok ? '' : parsed.error}). Die JSON-basierten Felder sind gesperrt —
          bitte im Reiter „JSON“ korrigieren.
        </div>
      ) : null}

      <Section title="Allgemein" open>
        <Field label="Board-Name" changed={name !== (original.columns.msdyn_tabname ?? '')}>
          {(id) => (
            <Input
              id={id}
              className="input"
              value={name}
              disabled={!protection.canRename}
              onChange={(e) => setColumn('msdyn_tabname', e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Freigabe"
          changed={shareType !== Number(original.columns.msdyn_sharetype)}
          hint={
            shareType === SHARE_TYPE.specificPeople
              ? 'Wer das Board sieht, regelt der Reiter „Freigaben“.'
              : null
          }
        >
          {(id) => (
            <Select
              id={id}
              className="input"
              value={String(shareType)}
              disabled={shareType === SHARE_TYPE.system}
              options={[
                ...[SHARE_TYPE.everyone, SHARE_TYPE.justMe, SHARE_TYPE.specificPeople].map((v) => ({ value: String(v), label: SHARE_TYPE_LABEL[v] })),
                ...(shareType === SHARE_TYPE.system ? [{ value: String(SHARE_TYPE.system), label: 'System' }] : []),
              ]}
              onChange={(v) => setColumn('msdyn_sharetype', Number(v))}
            />
          )}
        </Field>
        {renderColumn('msdyn_ordernumber')}
      </Section>

      <Section title="Board-Ansicht">{settingsIn('view')}</Section>

      <Section title="Farben">
        {SECTION_COLUMNS.colors.map(renderColumn)}
        {settingsIn('colors')}
      </Section>

      <Section title="Schedule Assistant">
        {SECTION_COLUMNS.sa.map(renderColumn)}
        {settingsIn('sa')}
      </Section>

      <Section title="Karte">{SECTION_COLUMNS.map.map(renderColumn)}</Section>

      <Section title="Sonstiges">
        {SECTION_COLUMNS.other.map(renderColumn)}
        {BOARD_LOOKUPS.map((lk) => {
          const value = draft.lookups[lk.key]
          const changed = (value ?? '').toLowerCase() !== (original.lookups[lk.key] ?? '').toLowerCase()
          const inherited = defaults?.lookups[lk.key]
          return (
            <Field
              key={lk.key}
              label={lk.label}
              changed={changed}
              hint={!value && inherited ? `Standard-Board: ${nameById(configs, inherited) ?? inherited}` : null}
            >
              {(id) => (
                <ConfigSelect
                  id={id}
                  type={lk.configType}
                  value={value}
                  onChange={(v) => onChange({ ...draft, lookups: { ...draft.lookups, [lk.key]: v } })}
                />
              )}
            </Field>
          )
        })}
        {settingsIn('other')}
      </Section>

      <Section title="Eigene Web-Ressource">{SECTION_COLUMNS.webresource.map(renderColumn)}</Section>

      <Section title="Schedule-Typen">
        {settings ? (
          <SlotTypesEditor settings={settings} original={origSettings} onChange={setSettings} />
        ) : null}
      </Section>

      <Section title="Anforderungsbereiche">
        {settingsIn('panels')}
        {settings ? <PanelsEditor settings={settings} original={origSettings} onChange={setSettings} /> : null}
      </Section>
    </div>
  )
}
