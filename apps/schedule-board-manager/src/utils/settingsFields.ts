import type { PathSeg } from './settingsModel'

/**
 * Editor definitions for the documented `msdyn_settings` attributes.
 * Source: "Field mapping for schedule board settings in Dynamics 365 Field
 * Service" (MS Learn guidance). Keys not listed here stay reachable through
 * the raw JSON editor and are never touched by the form.
 */

export type SettingKind =
  | 'int'
  | 'color'
  | 'bool'
  /** Present-only switch; see `writeFlag`. */
  | 'flag'
  /** Integer 0/1 rendered as a checkbox. */
  | 'intBool'
  | 'text'
  | 'longtext'
  | 'select'
  | 'timezone'

export type SettingSection = 'view' | 'colors' | 'sa' | 'other' | 'panels'

export interface SettingDef {
  path: PathSeg[]
  label: string
  kind: SettingKind
  section: SettingSection
  options?: { value: string | number; label: string }[]
  onValue?: 1 | true
  min?: number
  max?: number
  help?: string
}

export const VIEW_MODES = [
  { value: 'hourAndDay', label: 'Stündlich' },
  { value: 'dayAndWeek', label: 'Täglich' },
  { value: 'weekAndMonth', label: 'Wöchentlich' },
  { value: 'monthAndYear', label: 'Monatlich' },
] as const

const WEEKDAYS: [string, string][] = [
  ['Monday', 'Montag'],
  ['Tuesday', 'Dienstag'],
  ['Wednesday', 'Mittwoch'],
  ['Thursday', 'Donnerstag'],
  ['Friday', 'Freitag'],
  ['Saturday', 'Samstag'],
  ['Sunday', 'Sonntag'],
]

const UNITS_LABEL: Record<string, string> = {
  hourAndDay: 'Tage in der Stundenansicht',
  dayAndWeek: 'Tage in der Tagesansicht',
  weekAndMonth: 'Wochen in der Wochenansicht',
  monthAndYear: 'Monate in der Monatsansicht',
}

export const SETTING_DEFS: SettingDef[] = [
  // Board view settings side pane + time scale
  { path: ['ViewMode'], label: 'Zeitskala', kind: 'select', section: 'view', options: [...VIEW_MODES] },
  { path: ['TimeOffsetSetting'], label: 'Zeitzone', kind: 'timezone', section: 'view' },
  { path: ['TimeResolution'], label: 'Zeitauflösung (Minuten)', kind: 'int', section: 'view', min: 1, max: 60 },
  { path: ['WorkHours', 'start'], label: 'Arbeitszeit von (Stunde)', kind: 'int', section: 'view', min: 0, max: 24, help: 'Nur in der Stundenansicht wirksam.' },
  { path: ['WorkHours', 'end'], label: 'Arbeitszeit bis (Stunde)', kind: 'int', section: 'view', min: 0, max: 24 },
  ...WEEKDAYS.map(([key, label]): SettingDef => ({
    path: ['WorkDays', key],
    label: `Arbeitstag ${label}`,
    kind: 'bool',
    section: 'view',
  })),
  ...VIEW_MODES.flatMap(({ value, label }): SettingDef[] => [
    { path: ['viewModeSpecific', value, 'RowHeight'], label: `Zeilenhöhe ${label}`, kind: 'int', section: 'view', min: 10, max: 200 },
    { path: ['viewModeSpecific', value, 'modeUnitsCount'], label: UNITS_LABEL[value], kind: 'int', section: 'view', min: 1, max: 60 },
  ]),
  { path: ['hideCancelled'], label: 'Stornierte Buchungen ausblenden', kind: 'flag', onValue: 1, section: 'view' },
  { path: ['applyFilterTerritory'], label: 'Gebietsfilter auf Anforderungen anwenden', kind: 'flag', onValue: 1, section: 'view' },
  { path: ['showTravelTime'], label: 'Reisedauer anzeigen', kind: 'flag', onValue: 1, section: 'view' },
  { path: ['showBookingsProportionally'], label: 'Buchungen proportional zur Dauer', kind: 'flag', onValue: true, section: 'view', help: 'Nur Tages-, Wochen- und Monatsansicht.' },

  // Colors
  { path: ['CurrentTimelineColor'], label: 'Aktuelle Zeitlinie', kind: 'color', section: 'colors' },

  // Schedule assistant
  { path: ['SASearchForDefault'], label: 'Suchen nach (Standard)', kind: 'int', section: 'sa' },
  { path: ['SAHideUnavailableResources'], label: 'Nicht verfügbare Ressourcen ausblenden', kind: 'intBool', section: 'sa' },

  // Other
  { path: ['ResourcePageSize'], label: 'Ressourcen pro Seite', kind: 'int', section: 'other', min: 1, max: 1000 },
  { path: ['DisableDefaultExtensions'], label: 'Standard-Erweiterungen deaktivieren', kind: 'bool', section: 'other' },
  { path: ['BookingAlertTemplate'], label: 'Vorlage Buchungswarnungen', kind: 'longtext', section: 'other' },

  // Requirement panels (the tab list itself has its own editor)
  { path: ['HideDefaultUnscheduledPanels'], label: 'Standard-Anforderungsbereiche ausblenden', kind: 'bool', section: 'panels' },
]

/** Views and template inside each `SlotMetadataCollection` entry. */
export const SLOT_FIELDS: { key: string; label: string; viewEntity?: string; kind: 'view' | 'longtext' }[] = [
  { key: 'TooltipViewId', label: 'Buchungs-Tooltip-Ansicht', viewEntity: 'bookableresourcebooking', kind: 'view' },
  { key: 'DetailsViewId', label: 'Buchungs-Detailansicht', viewEntity: 'bookableresourcebooking', kind: 'view' },
  { key: 'RequirementDetailsPanelViewId', label: 'Schedule-Assistant-Anforderungsansicht', viewEntity: 'msdyn_resourcerequirement', kind: 'view' },
  { key: 'RequirementDetailsViewId', label: 'Anforderungs-Detailansicht', viewEntity: 'msdyn_resourcerequirement', kind: 'view' },
  { key: 'UnschReqMapPinTooltipViewId', label: 'Kartenpin-Tooltip-Ansicht', viewEntity: 'msdyn_resourcerequirement', kind: 'view' },
  { key: 'SlotTemplate', label: 'Buchungsvorlage (HTML)', kind: 'longtext' },
]

/** Fixed IDs per MS field mapping; other types are env-specific rows. */
export const KNOWN_BOOKING_SETUPS: Record<string, string> = {
  '49bc77c5-3a9e-4a0b-a903-0a3a4d352f5d': 'Keine',
  '187989a1-41f1-e711-8130-000d3af982f3': 'Termin',
  'd59df12a-aedb-4f82-b5b8-9a6eba4f1712': 'Arbeitsauftrag',
}

/** Display label for a flattened settings path, falling back to the raw key. */
export function labelForSettingsKey(key: string): string {
  const def = SETTING_DEFS.find((d) => d.path.join('.') === key)
  if (def) return def.label
  const slot = /^SlotMetadataCollection\[([^\]]+)\]\.(\w+)$/.exec(key)
  if (slot) {
    const field = SLOT_FIELDS.find((f) => f.key === slot[2])
    const type = KNOWN_BOOKING_SETUPS[slot[1].toLowerCase()] ?? slot[1].slice(0, 8)
    return `Schedule-Typ ${type}: ${field?.label ?? slot[2]}`
  }
  const tab = /^UnscheduledTabs\[(\d+)\]\.(\w+)$/.exec(key)
  if (tab) return `Anforderungsbereich ${Number(tab[1]) + 1}: ${tab[2]}`
  return key
}

const TOP_LEVEL_LABELS: Record<string, string> = {
  UnscheduledTabs: 'Anforderungsbereiche (Liste)',
  SlotMetadataCollection: 'Schedule-Typen (Ansichten & Vorlagen)',
  WorkHours: 'Arbeitszeit',
  WorkDays: 'Arbeitstage',
  viewModeSpecific: 'Zeilenhöhe & Anzahl je Zeitskala',
  FilterResourcesSet: 'Ressourcenfilter-Set',
  GroupResourcesBy: 'Ressourcen gruppieren nach',
}

/** Label for a top-level `msdyn_settings` key (bulk selection works on these). */
export function topLevelLabel(key: string): string {
  return TOP_LEVEL_LABELS[key] ?? labelForSettingsKey(key)
}

/** First segment of a flattened settings key: `WorkHours.start` → `WorkHours`. */
export function topLevelKey(flatKey: string): string {
  return flatKey.split(/[.[]/)[0]
}
