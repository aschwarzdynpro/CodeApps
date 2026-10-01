import {
  BOARD_COLUMNS,
  BOARD_LOOKUPS,
  SHARE_TYPE,
  type Board,
  type BoardContent,
  type BookingSetupRef,
  type ColumnValue,
  type ConfigRef,
  type LookupKey,
  type TimeZoneRef,
  type ViewRef,
} from '../types/board'
import { parseSettings, serializeSettings, type Json, type JsonObject } from './settingsModel'
import { KNOWN_BOOKING_SETUPS, SLOT_FIELDS } from './settingsFields'

/**
 * Moving a board between environments.
 *
 * A board is mostly IDs: views in columns and settings, three
 * configuration lookups plus the Schedule Assistant configurations inside
 * `SlotMetadataCollection`, booking setups, a time zone, and the records in
 * the saved filter values. Only some of them are the same everywhere
 * (solution views, URS defaults, time zones). The export therefore carries a
 * name for every ID and the full configuration payloads; the import maps
 * each ID to the target by ID, then by name, and rewrites the content.
 */

export const PACKAGE_FORMAT = 'schedule-board-manager.board'

export type RefKind = 'view' | 'config' | 'bookingSetup' | 'timeZone' | 'record' | 'unknown'

export interface RefUse {
  kind: RefKind
  /** Normalized: lower case, no braces. */
  id: string
  /** Where the board uses it, for the import screen. */
  where: string
  /** Table of a filter-value record. */
  entity?: string
}

export interface PackagedConfig extends ConfigRef {
  /** Null in files from the old export, which had no payloads. */
  value: string | null
}

export interface PackagedRecord {
  id: string
  entity: string
  name: string | null
}

export interface BoardPackage {
  format: typeof PACKAGE_FORMAT
  version: 1
  exportedAt: string
  source: { orgUrl: string | null; boardId: string }
  board: { name: string; shareType: number; content: BoardContent }
  configs: PackagedConfig[]
  views: ViewRef[]
  bookingSetups: BookingSetupRef[]
  timeZones: TimeZoneRef[]
  records: PackagedRecord[]
}

// ---------------------------------------------------------------------------
// Finding references
// ---------------------------------------------------------------------------

const GUID = /^\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?$/i

export function normId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = GUID.exec(value.trim())
  return m ? m[1].toLowerCase() : null
}

/** What a GUID under this settings key points to. */
export function settingRefKind(key: string): RefKind {
  if (key === 'TimeOffsetSetting') return 'timeZone'
  if (key === 'BookingSetupMetadataId') return 'bookingSetup'
  if (key === 'UnscheduledView' || key.endsWith('ViewId')) return 'view'
  if (/(LayoutId|TemplateId|QueryId)$/.test(key)) return 'config'
  return 'unknown'
}

const isObject = (v: Json | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Names a booking setup by ID — URS defaults are known, others come from the package. */
export type SetupNamer = (id: string) => string | null

const SA_FIELD_LABEL: Record<string, string> = {
  ScheduleAssistantFilterLayoutId: 'SA-Filterlayout',
  ScheduleAssistantResourceCellTemplateId: 'SA-Ressourcenzellen-Vorlage',
}

function slotLabel(entry: JsonObject, namer: SetupNamer): string {
  const id = normId(entry.BookingSetupMetadataId)
  return id ? `Schedule-Typ ${KNOWN_BOOKING_SETUPS[id] ?? namer(id) ?? id.slice(0, 8)}` : 'Schedule-Typ'
}

function settingsWhere(path: (string | number)[], parents: JsonObject[], namer: SetupNamer): string {
  const key = String(path[path.length - 1])
  if (path[0] === 'SlotMetadataCollection' && parents[1]) {
    const field = SLOT_FIELDS.find((f) => f.key === key)?.label ?? SA_FIELD_LABEL[key] ?? key
    return key === 'BookingSetupMetadataId' ? slotLabel(parents[1], namer) : `${slotLabel(parents[1], namer)}: ${field}`
  }
  if (path[0] === 'UnscheduledTabs' && parents[1]) {
    const title = typeof parents[1].Title === 'string' ? parents[1].Title : `#${Number(path[1]) + 1}`
    return `Anforderungsbereich „${title}“`
  }
  if (key === 'TimeOffsetSetting') return 'Zeitzone'
  return `Settings: ${path.join('.')}`
}

function walkSettings(v: Json, path: (string | number)[], parents: JsonObject[], out: RefUse[], namer: SetupNamer): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => walkSettings(x, [...path, i], parents, out, namer))
  } else if (isObject(v)) {
    for (const [k, x] of Object.entries(v)) walkSettings(x, [...path, k], [...parents, v], out, namer)
  } else {
    const id = normId(v)
    if (!id) return
    const key = String(path[path.length - 1])
    out.push({ kind: typeof path[path.length - 1] === 'string' ? settingRefKind(key) : 'unknown', id, where: settingsWhere(path, parents, namer) })
  }
}

/** UFX lookup values in `msdyn_filtervalues`: `{ "@ufx-id", "@ufx-logicalname" }`. */
function walkFilterValues(v: Json, path: (string | number)[], out: RefUse[]): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => walkFilterValues(x, [...path, i], out))
  } else if (isObject(v)) {
    const id = normId(v['@ufx-id'])
    const entity = typeof v['@ufx-logicalname'] === 'string' ? v['@ufx-logicalname'] : null
    if (id && entity) {
      out.push({ kind: 'record', id, entity, where: `Filterwert ${String(path[0] ?? '')}` })
      return
    }
    for (const [k, x] of Object.entries(v)) walkFilterValues(x, [...path, k], out)
  } else {
    const id = normId(v)
    if (id) out.push({ kind: 'unknown', id, where: `Filterwert ${path.join('.')}` })
  }
}

/** Every ID the board content points to, one entry per use. */
export function collectRefs(content: BoardContent, namer: SetupNamer = () => null): RefUse[] {
  const out: RefUse[] = []
  for (const col of BOARD_COLUMNS) {
    const id = normId(content.columns[col.key])
    // Only view slots hold GUIDs among the plain columns (deprecated ones included).
    if (id) out.push({ kind: 'view', id, where: col.label })
  }
  for (const lk of BOARD_LOOKUPS) {
    const id = normId(content.lookups[lk.key])
    if (id) out.push({ kind: 'config', id, where: lk.label })
  }
  const settings = parseSettings(content.settings)
  if (settings.ok) walkSettings(settings.value, [], [], out, namer)
  const filters = parseSettings(content.filterValues)
  if (filters.ok) walkFilterValues(filters.value, [], out)
  return out
}

function uniqueIds(refs: RefUse[], kind: RefKind): string[] {
  return [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.id))]
}

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------

export interface ExportContext {
  configs: PackagedConfig[]
  views: ViewRef[]
  bookingSetups: BookingSetupRef[]
  timeZones: TimeZoneRef[]
  records: PackagedRecord[]
  orgUrl: string | null
  now: string
}

/** Keeps only what the board references, so the file stays readable. */
export function buildPackage(board: Board, ctx: ExportContext): BoardPackage {
  const refs = collectRefs(board.content)
  const has = (kind: RefKind) => {
    const ids = new Set(uniqueIds(refs, kind))
    return (x: { id: string }) => ids.has(x.id.toLowerCase())
  }
  return {
    format: PACKAGE_FORMAT,
    version: 1,
    exportedAt: ctx.now,
    source: { orgUrl: ctx.orgUrl, boardId: board.id },
    board: { name: board.name, shareType: board.shareType, content: board.content },
    configs: ctx.configs.filter(has('config')),
    views: ctx.views.filter(has('view')),
    bookingSetups: ctx.bookingSetups.filter(has('bookingSetup')),
    timeZones: ctx.timeZones.filter(has('timeZone')),
    records: ctx.records.filter(has('record')),
  }
}

export type ParsedPackage = { ok: true; pkg: BoardPackage; legacy: boolean } | { ok: false; error: string }

const isContent = (c: unknown): c is BoardContent =>
  typeof c === 'object' && c !== null && 'columns' in c && 'lookups' in c && 'settings' in c

/**
 * Reads an export file. The first export (before 2026-10) wrote the bare
 * board — still importable, but without configuration payloads or names.
 */
export function parsePackage(text: string): ParsedPackage {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    return { ok: false, error: `Keine gültige JSON-Datei (${err instanceof Error ? err.message : String(err)}).` }
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'Unerwarteter Dateiinhalt.' }
  const d = data as Record<string, unknown>
  if (d.format === PACKAGE_FORMAT) {
    if (d.version !== 1) return { ok: false, error: `Paketversion ${String(d.version)} wird nicht unterstützt.` }
    const board = d.board as BoardPackage['board'] | undefined
    if (!board || !isContent(board.content)) return { ok: false, error: 'Paket ohne Board-Inhalt.' }
    const pkg: BoardPackage = {
      format: PACKAGE_FORMAT,
      version: 1,
      exportedAt: String(d.exportedAt ?? ''),
      source: (d.source as BoardPackage['source']) ?? { orgUrl: null, boardId: '' },
      board,
      configs: (d.configs as PackagedConfig[]) ?? [],
      views: (d.views as ViewRef[]) ?? [],
      bookingSetups: (d.bookingSetups as BookingSetupRef[]) ?? [],
      timeZones: (d.timeZones as TimeZoneRef[]) ?? [],
      records: (d.records as PackagedRecord[]) ?? [],
    }
    return { ok: true, pkg, legacy: false }
  }
  if (isContent(d.content) && typeof d.id === 'string') {
    const content = d.content
    const names = (d.lookupNames ?? {}) as Record<string, string | null>
    const configs: PackagedConfig[] = BOARD_LOOKUPS.flatMap((lk) => {
      const id = content.lookups[lk.key]
      return id ? [{ id, name: names[lk.key] ?? id, type: lk.configType, value: null }] : []
    })
    const pkg: BoardPackage = {
      format: PACKAGE_FORMAT,
      version: 1,
      exportedAt: String(d.modifiedOn ?? ''),
      source: { orgUrl: null, boardId: d.id },
      board: { name: String(d.name ?? content.columns.msdyn_tabname ?? ''), shareType: Number(d.shareType), content },
      configs,
      views: [],
      bookingSetups: [],
      timeZones: [],
      records: [],
    }
    return { ok: true, pkg, legacy: true }
  }
  return { ok: false, error: 'Das ist kein Board-Export dieser App.' }
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export type MatchStatus = 'id' | 'name' | 'manual' | 'missing' | 'unchecked'

export interface RefChoice {
  kind: 'view' | 'bookingSetup' | 'timeZone' | 'record'
  sourceId: string
  /** Name in the source environment, if the package knows it. */
  sourceName: string | null
  entity: string | null
  where: string[]
  /** Null = remove the reference from the board. */
  targetId: string | null
  status: MatchStatus
}

export type ConfigAction = 'use' | 'create' | 'update' | 'clear'

export interface ConfigChoice {
  source: PackagedConfig
  where: string[]
  /** Existing configuration in the target (by ID, else by name and type). */
  matchId: string | null
  matchedBy: 'id' | 'name' | null
  action: ConfigAction
  /** For `use`: which existing configuration; may differ from the match. */
  useId: string | null
  createName: string
}

export interface ImportPlan {
  configs: ConfigChoice[]
  refs: RefChoice[]
  /** GUIDs we can't classify — kept unchanged. */
  unknown: RefUse[]
}

export interface TargetData {
  configs: ConfigRef[]
  views: ViewRef[]
  bookingSetups: BookingSetupRef[]
  timeZones: TimeZoneRef[]
  /**
   * Filter-value records found in the target, by normalized source ID.
   * A missing key means "not found"; a table missing from `checkedEntities`
   * means it couldn't be checked.
   */
  records: Map<string, { id: string; matchedBy: 'id' | 'name' }>
  checkedEntities: Set<string>
}

const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

function unique<T>(items: T[]): T | null {
  return items.length === 1 ? items[0] : null
}

function wheres(refs: RefUse[], kind: RefKind, id: string): string[] {
  return [...new Set(refs.filter((r) => r.kind === kind && r.id === id).map((r) => r.where))]
}

function choice(
  kind: RefChoice['kind'],
  sourceId: string,
  sourceName: string | null,
  entity: string | null,
  where: string[],
  byId: { id: string } | undefined,
  byName: { id: string } | null,
): RefChoice {
  if (byId) return { kind, sourceId, sourceName, entity, where, targetId: byId.id, status: 'id' }
  if (byName) return { kind, sourceId, sourceName, entity, where, targetId: byName.id, status: 'name' }
  return { kind, sourceId, sourceName, entity, where, targetId: null, status: 'missing' }
}

/** First proposal: match by ID, then by name; the user can change every row. */
export function planImport(pkg: BoardPackage, target: TargetData): ImportPlan {
  const refs = collectRefs(pkg.board.content, (id) => pkg.bookingSetups.find((b) => b.id.toLowerCase() === id)?.entity ?? null)
  const sameId = (id: string) => (x: { id: string }) => x.id.toLowerCase() === id

  const configs: ConfigChoice[] = uniqueIds(refs, 'config').map((id) => {
    const source = pkg.configs.find(sameId(id)) ?? { id, name: id, type: null, value: null }
    const byId = target.configs.find(sameId(id))
    const byName = byId
      ? null
      : unique(target.configs.filter((c) => lc(c.name) === lc(source.name) && (source.type === null || c.type === source.type)))
    const match = byId ?? byName
    return {
      source,
      where: wheres(refs, 'config', id),
      matchId: match?.id ?? null,
      matchedBy: byId ? 'id' : byName ? 'name' : null,
      action: match ? 'use' : source.value !== null ? 'create' : 'clear',
      useId: match?.id ?? null,
      createName: source.name,
    }
  })

  const views = uniqueIds(refs, 'view').map((id) => {
    const src = pkg.views.find(sameId(id))
    const byName = src ? unique(target.views.filter((v) => lc(v.entity) === lc(src.entity) && lc(v.name) === lc(src.name))) : null
    return choice('view', id, src?.name ?? null, src?.entity ?? null, wheres(refs, 'view', id), target.views.find(sameId(id)), byName)
  })

  const bookingSetups = uniqueIds(refs, 'bookingSetup').map((id) => {
    const src = pkg.bookingSetups.find(sameId(id))
    const byName = src ? unique(target.bookingSetups.filter((b) => lc(b.entity) === lc(src.entity))) : null
    const name = KNOWN_BOOKING_SETUPS[id] ?? src?.entity ?? null
    return choice('bookingSetup', id, name, null, wheres(refs, 'bookingSetup', id), target.bookingSetups.find(sameId(id)), byName)
  })

  const timeZones = uniqueIds(refs, 'timeZone').map((id) => {
    const src = pkg.timeZones.find(sameId(id))
    const byName = src ? unique(target.timeZones.filter((t) => lc(t.name) === lc(src.name))) : null
    return choice('timeZone', id, src?.name ?? null, null, wheres(refs, 'timeZone', id), target.timeZones.find(sameId(id)), byName)
  })

  const records = uniqueIds(refs, 'record').map((id): RefChoice => {
    const src = pkg.records.find(sameId(id))
    const entity = src?.entity ?? refs.find((r) => r.kind === 'record' && r.id === id)?.entity ?? null
    const where = wheres(refs, 'record', id)
    const base = { kind: 'record' as const, sourceId: id, sourceName: src?.name ?? null, entity, where }
    if (!entity || !target.checkedEntities.has(lc(entity))) return { ...base, targetId: id, status: 'unchecked' }
    const hit = target.records.get(id)
    return hit ? { ...base, targetId: hit.id, status: hit.matchedBy } : { ...base, targetId: null, status: 'missing' }
  })

  return {
    configs,
    refs: [...views, ...bookingSetups, ...timeZones, ...records],
    unknown: refs.filter((r) => r.kind === 'unknown'),
  }
}

// ---------------------------------------------------------------------------
// Rewriting
// ---------------------------------------------------------------------------

/** Normalized source ID → target ID, or null to drop the reference. */
export type IdMap = Map<string, string | null>

export function buildIdMap(plan: ImportPlan, created: Map<string, string>): IdMap {
  const map: IdMap = new Map()
  for (const c of plan.configs) {
    const id = c.source.id.toLowerCase()
    if (c.action === 'create') map.set(id, created.get(id) ?? null)
    else if (c.action === 'clear') map.set(id, null)
    else if (c.action === 'update') map.set(id, c.matchId)
    else map.set(id, c.useId)
  }
  for (const r of plan.refs) map.set(r.sourceId, r.targetId)
  return map
}

function rewriteSettings(v: Json, map: IdMap, key: string | null): Json | undefined {
  if (Array.isArray(v)) {
    let items = v
    // A schedule type or panel without its booking setup / view is dropped whole.
    if (key === 'SlotMetadataCollection') items = items.filter((e) => !(isObject(e) && isDropped(e.BookingSetupMetadataId, map)))
    if (key === 'UnscheduledTabs') items = items.filter((e) => !(isObject(e) && isDropped(e.UnscheduledView, map)))
    return items.map((x) => rewriteSettings(x, map, null) as Json)
  }
  if (isObject(v)) {
    const out: JsonObject = {}
    for (const [k, x] of Object.entries(v)) {
      const next = rewriteSettings(x, map, k)
      if (next !== undefined) out[k] = next
    }
    return out
  }
  const id = normId(v)
  if (!id || key === null || settingRefKind(key) === 'unknown' || !map.has(id)) return v
  const target = map.get(id)
  return target === null ? undefined : target
}

function isDropped(value: Json | undefined, map: IdMap): boolean {
  const id = normId(value)
  return id !== null && map.has(id) && map.get(id) === null
}

function rewriteFilterValues(v: Json, map: IdMap): Json {
  if (Array.isArray(v)) {
    return v.filter((x) => !(isObject(x) && isDropped(x['@ufx-id'], map))).map((x) => rewriteFilterValues(x, map))
  }
  if (isObject(v)) {
    const id = normId(v['@ufx-id'])
    if (id && map.get(id)) return { ...v, '@ufx-id': map.get(id)! }
    const out: JsonObject = {}
    for (const [k, x] of Object.entries(v)) out[k] = rewriteFilterValues(x, map)
    return out
  }
  return v
}

export interface ComposeOptions {
  name: string
  shareType: number
  order: number
  includeFilterValues: boolean
}

/** The package's board content with every reference mapped to the target. */
export function composeContent(pkg: BoardPackage, map: IdMap, opts: ComposeOptions): BoardContent {
  const src = pkg.board.content
  const columns: Record<string, ColumnValue> = {}
  for (const [k, v] of Object.entries(src.columns)) {
    const id = normId(v)
    columns[k] = id && map.has(id) ? map.get(id)! : v
  }
  columns.msdyn_tabname = opts.name.trim()
  columns.msdyn_sharetype = opts.shareType === SHARE_TYPE.system ? SHARE_TYPE.everyone : opts.shareType
  columns.msdyn_ordernumber = opts.order

  const lookups = {} as Record<LookupKey, string | null>
  for (const lk of BOARD_LOOKUPS) {
    const id = normId(src.lookups[lk.key])
    lookups[lk.key] = id ? (map.has(id) ? map.get(id)! : src.lookups[lk.key]) : null
  }

  const settings = parseSettings(src.settings)
  const filters = parseSettings(src.filterValues)
  return {
    columns,
    lookups,
    settings: settings.ok && src.settings !== null ? serializeSettings(rewriteSettings(settings.value, map, null) as JsonObject) : src.settings,
    filterValues: !opts.includeFilterValues
      ? null
      : filters.ok && src.filterValues !== null
        ? serializeSettings(rewriteFilterValues(filters.value, map) as JsonObject)
        : src.filterValues,
  }
}

/** Whitespace-insensitive comparison for XML/JSON payloads. */
export function samePayload(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').replace(/> </g, '><').trim()
  return n(a) === n(b)
}

/**
 * Shorter "used in" list: the same field across schedule types becomes one
 * entry ("Buchungs-Tooltip-Ansicht (Keine, Termin, msdyn_project)").
 */
export function compactWhere(where: string[]): string[] {
  const out: string[] = []
  const byField = new Map<string, string[]>()
  for (const w of where) {
    const m = /^Schedule-Typ (.+?): (.+)$/.exec(w)
    if (!m) {
      out.push(w)
      continue
    }
    const types = byField.get(m[2]) ?? []
    types.push(m[1])
    byField.set(m[2], types)
  }
  for (const [field, types] of byField) out.push(`${field} (${types.join(', ')})`)
  return out
}
