/**
 * Domain model for URS schedule board tabs (`msdyn_scheduleboardsetting`).
 *
 * A board's settings live in three places: plain columns (listed in
 * {@link BOARD_COLUMNS}), three lookups to `msdyn_configuration`
 * ({@link BOARD_LOOKUPS}) and two JSON strings (`msdyn_settings`,
 * `msdyn_filtervalues`). Every consumer — select lists, copy, diff, editor —
 * derives from these tables so a column cannot be copied but not diffed.
 */

export const SHARE_TYPE = {
  everyone: 192350000,
  justMe: 192350001,
  specificPeople: 192350002,
  system: 192350003,
} as const

export type ShareType = (typeof SHARE_TYPE)[keyof typeof SHARE_TYPE]

export const SHARE_TYPE_LABEL: Record<number, string> = {
  [SHARE_TYPE.everyone]: 'Jeder',
  [SHARE_TYPE.justMe]: 'Nur ich',
  [SHARE_TYPE.specificPeople]: 'Bestimmte Personen',
  [SHARE_TYPE.system]: 'System',
}

export type ColumnKind = 'text' | 'color' | 'bool' | 'int' | 'view' | 'icon' | 'deprecated'

export interface ColumnDef {
  key: string
  label: string
  kind: ColumnKind
  /** For `view`: the table whose views (savedquery/userquery) fit this slot. */
  viewEntity?: string
}

/**
 * Copyable/editable plain columns. Deliberately excludes the primary key,
 * state, owner and system columns — those are set by the app explicitly.
 * Source: MS field mapping for schedule board settings.
 */
export const BOARD_COLUMNS: ColumnDef[] = [
  { key: 'msdyn_tabname', label: 'Board-Name', kind: 'text' },
  { key: 'msdyn_sharetype', label: 'Freigabe', kind: 'int' },
  { key: 'msdyn_ordernumber', label: 'Reihenfolge', kind: 'int' },
  // Map
  { key: 'msdyn_schedulerresourcetooltipview', label: 'Ressourcen-Tooltip-Ansicht', kind: 'view', viewEntity: 'bookableresource' },
  { key: 'msdyn_organizationalunittooltipsviewid', label: 'Org.-Einheit-Tooltip-Ansicht', kind: 'view', viewEntity: 'msdyn_organizationalunit' },
  { key: 'msdyn_unscheduledrequirementsviewid', label: 'Anforderungs-Kartenfilter-Ansicht', kind: 'view', viewEntity: 'msdyn_resourcerequirement' },
  { key: 'msdyn_schedulerresourcedetailsview', label: 'Ressourcen-Detailansicht', kind: 'view', viewEntity: 'bookableresource' },
  { key: 'msdyn_organizationalunitviewid', label: 'Org.-Einheit-Detailansicht', kind: 'view', viewEntity: 'msdyn_organizationalunit' },
  // Custom web resource
  { key: 'msdyn_customtabname', label: 'Web-Ressource: Titel', kind: 'text' },
  { key: 'msdyn_customtabwebresource', label: 'Web-Ressource', kind: 'text' },
  // Schedule assistant
  { key: 'msdyn_saavailablecolor', label: 'SA: Verfügbar', kind: 'color' },
  { key: 'msdyn_saunavailablecolor', label: 'SA: Nicht verfügbar', kind: 'color' },
  { key: 'msdyn_sapartiallyavailablecolor', label: 'SA: Teilweise verfügbar', kind: 'color' },
  { key: 'msdyn_bookbasedon', label: 'Buchen basierend auf geschätzter Ankunft', kind: 'bool' },
  { key: 'msdyn_saavailableicondefault', label: 'SA: Standard-Icon verfügbar', kind: 'bool' },
  { key: 'msdyn_saavailableicon', label: 'SA: Icon verfügbar', kind: 'icon' },
  { key: 'msdyn_saunavailableicondefault', label: 'SA: Standard-Icon nicht verfügbar', kind: 'bool' },
  { key: 'msdyn_saunavailableicon', label: 'SA: Icon nicht verfügbar', kind: 'icon' },
  { key: 'msdyn_sapartiallyavailableicondefault', label: 'SA: Standard-Icon teilweise', kind: 'bool' },
  { key: 'msdyn_sapartiallyavailableicon', label: 'SA: Icon teilweise', kind: 'icon' },
  // Board colors
  { key: 'msdyn_fullybookedcolor', label: 'Voll gebucht', kind: 'color' },
  { key: 'msdyn_notbookedcolor', label: 'Nicht gebucht', kind: 'color' },
  { key: 'msdyn_workinghourscolor', label: 'Außerhalb der Arbeitszeit', kind: 'color' },
  { key: 'msdyn_overbookedcolor', label: 'Überbucht', kind: 'color' },
  { key: 'msdyn_partiallybookedcolor', label: 'Teilweise gebucht', kind: 'color' },
  // Other
  { key: 'msdyn_unscheduledwopagereccount', label: 'Anforderungen pro Seite', kind: 'int' },
  { key: 'msdyn_scheduleralertsview', label: 'Buchungswarnungen-Ansicht', kind: 'view', viewEntity: 'msdyn_bookingalert' },
  { key: 'msdyn_hidecancelled', label: 'Stornierte ausblenden', kind: 'bool' },
  { key: 'msdyn_issynchronizeresources', label: 'Ressourcen synchronisieren', kind: 'bool' },
  { key: 'msdyn_mapviewtabplacement', label: 'Karten-Tab-Platzierung', kind: 'bool' },
  // Deprecated — copied verbatim, never edited.
  { key: 'msdyn_ispublic', label: 'Is Public (veraltet)', kind: 'deprecated' },
  { key: 'msdyn_schedulerbusinessunittooltipview', label: 'BU Tooltips View (veraltet)', kind: 'deprecated' },
  { key: 'msdyn_schedulercoredetailsview', label: 'Core Details View (veraltet)', kind: 'deprecated' },
  { key: 'msdyn_schedulercoreslottexttemplate', label: 'Core Slot Text Template (veraltet)', kind: 'deprecated' },
  { key: 'msdyn_schedulercoretooltipview', label: 'Core Tooltip View (veraltet)', kind: 'deprecated' },
  { key: 'msdyn_schedulerfieldservicedetailsview', label: 'FS Details View (veraltet)', kind: 'deprecated' },
  { key: 'msdyn_schedulerfieldserviceslottexttemplate', label: 'FS Slot Text Template (veraltet)', kind: 'deprecated' },
  { key: 'msdyn_schedulerfieldservicetooltipview', label: 'FS Tooltip View (veraltet)', kind: 'deprecated' },
  { key: 'msdyn_schedulerbusinessunitdetailsview', label: 'Unit Details View (veraltet)', kind: 'deprecated' },
  { key: 'msdyn_unscheduledviewid', label: 'Unscheduled View (veraltet)', kind: 'deprecated' },
  { key: 'msdyn_unscheduledwotooltipsviewid', label: 'Unscheduled WO Tooltips View (veraltet)', kind: 'deprecated' },
]

export type ColumnValue = string | number | boolean | null

export const CONFIG_TYPE = {
  filterLayout: 192350000,
  resourceCellTemplate: 192350001,
  retrieveResourcesQuery: 192350002,
  saFilterLayout: 192350003,
  saRetrieveConstraints: 192350004,
  cloneQuery: 192350005,
} as const

export interface LookupDef {
  /** Logical name of the lookup column. */
  key: 'msdyn_filterlayout' | 'msdyn_resourcecelltemplate' | 'msdyn_retrieveresourcesquery'
  /** Navigation property for `@odata.bind` (case matters). */
  navProperty: string
  /** Name of the `_x_value` field in a read. */
  valueKey: string
  label: string
  configType: number
}

/**
 * Lookups to `msdyn_configuration`. The FastTrack control copies only keys
 * starting with `msdyn_`, so these `_msdyn_*_value` fields get lost on copy —
 * this table exists so we never repeat that.
 */
export const BOARD_LOOKUPS: LookupDef[] = [
  { key: 'msdyn_filterlayout', navProperty: 'msdyn_FilterLayout', valueKey: '_msdyn_filterlayout_value', label: 'Filterlayout', configType: CONFIG_TYPE.filterLayout },
  { key: 'msdyn_resourcecelltemplate', navProperty: 'msdyn_ResourceCellTemplate', valueKey: '_msdyn_resourcecelltemplate_value', label: 'Ressourcenzellen-Vorlage', configType: CONFIG_TYPE.resourceCellTemplate },
  { key: 'msdyn_retrieveresourcesquery', navProperty: 'msdyn_RetrieveResourcesQuery', valueKey: '_msdyn_retrieveresourcesquery_value', label: 'Ressourcenabfrage', configType: CONFIG_TYPE.retrieveResourcesQuery },
]

export type LookupKey = LookupDef['key']

/** List row — enough to render the sidebar without the JSON payloads. */
export interface BoardSummary {
  id: string
  name: string
  shareType: number
  active: boolean
  order: number
  ownerName: string
  /** systemuser or team id; null when unknown (mock "SYSTEM" rows). */
  ownerId: string | null
  modifiedOn: string | null
  /** Configuration lookups — the list needs them to show who uses a layout. */
  lookups: Record<LookupKey, string | null>
}

/** The editable part of a board. Drafts, snapshots and diffs use this shape. */
export interface BoardContent {
  columns: Record<string, ColumnValue>
  lookups: Record<LookupKey, string | null>
  /** Raw `msdyn_settings` string; null when the board has none. */
  settings: string | null
  /** Raw `msdyn_filtervalues` string. */
  filterValues: string | null
}

export interface Board extends BoardSummary {
  content: BoardContent
  /** Display names of the lookup targets, for read-only rendering. */
  lookupNames: Record<LookupKey, string | null>
  /** Row version at load time — used to detect concurrent writes. */
  version: number | null
}

export interface ConfigRef {
  id: string
  name: string
  type: number | null
}

/** A configuration row with its payload (filter layout XML, UFX query …). */
export interface ConfigDetail extends ConfigRef {
  value: string
  version: number | null
}

export interface ViewRef {
  id: string
  name: string
  entity: string
  /** savedquery = system view, userquery = personal view. */
  kind: 'system' | 'personal'
}

export interface BookingSetupRef {
  id: string
  entity: string
}

export interface TimeZoneRef {
  id: string
  name: string
}

export interface CopyOptions {
  name: string
  /** Defaults to the source's share type (System becomes Everyone). */
  shareType?: number
  /** Put the copy at the end of the tab order instead of next to the source. */
  appendToEnd?: boolean
}

/** Thrown when the board changed in Dataverse since it was loaded. */
export class ConflictError extends Error {
  constructor(message = 'Das Board wurde zwischenzeitlich geändert.') {
    super(message)
    this.name = 'ConflictError'
  }
}

// ---------------------------------------------------------------------------
// Record sharing (share type "Specific people")
// ---------------------------------------------------------------------------

export type PrincipalType = 'user' | 'team'

export interface PrincipalRef {
  id: string
  type: PrincipalType
  name: string
  /** E-mail for users, team type for teams — disambiguates equal names. */
  detail?: string
}

/** What the share UI offers; anything else is shown read-only as 'custom'. */
export type ShareLevel = 'read' | 'write'

export interface Share extends PrincipalRef {
  level: ShareLevel | 'custom'
  /** Raw accessrightsmask from principalobjectaccess. */
  mask: number
}

/** AccessRights bits (Web API AccessRights EnumType). */
export const ACCESS = {
  read: 1,
  write: 2,
  append: 4,
  appendTo: 16,
  share: 262144,
} as const

export function levelOfMask(mask: number): Share['level'] {
  if (mask === ACCESS.read) return 'read'
  if (mask === (ACCESS.read | ACCESS.write)) return 'write'
  return 'custom'
}

export const SHARE_LEVEL_LABEL: Record<Share['level'], string> = {
  read: 'Lesen',
  write: 'Lesen & Bearbeiten',
  custom: 'Individuell',
}

// ---------------------------------------------------------------------------
// Table metadata (filter layout editor pickers)
// ---------------------------------------------------------------------------

export interface TableRef {
  logicalName: string
  displayName: string
}

export interface ColumnMeta {
  logicalName: string
  displayName: string
  kind: 'picklist' | 'lookup' | 'other'
  /** Lookup target table (first one for polymorphic lookups). */
  target?: string
}

export interface TableInfo extends TableRef {
  columns: ColumnMeta[]
}
