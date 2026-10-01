import {
  BOARD_COLUMNS,
  BOARD_LOOKUPS,
  SHARE_TYPE,
  type Board,
  type BoardContent,
  type BoardSummary,
  type ColumnValue,
  type CopyOptions,
  type LookupKey,
  type PrincipalRef,
} from '../types/board'
import { labelForSettingsKey } from './settingsFields'
import { flatten, getAt, jsonEqual, parseSettings, setAt, type Json, type PathSeg } from './settingsModel'

// ---------------------------------------------------------------------------
// Protection
// ---------------------------------------------------------------------------

/**
 * Board rows URS ships with fixed IDs. They are also share type System, but
 * the ID check holds even if someone flipped the share type.
 */
const FIXED_SYSTEM_BOARDS = new Set([
  'dd3e0b8d-5dd9-4546-b081-bbf5ac4a0fb9', // Default
  'a46503d1-1940-4a6b-9cb5-843f1dc0681a', // Resource utilization view
  'fd7233f3-1b9a-4cb9-8bf9-e282b1a0602b', // Manage bookings view
])

/**
 * "Initial public view" has an env-specific ID and share type "Just me"
 * (seen in Schulz UAT), so only its name identifies it — per language.
 */
const INITIAL_PUBLIC_VIEW_NAMES = ['initial public view', 'erste öffentliche ansicht', 'vue publique initiale']

export interface Protection {
  canDelete: boolean
  canDisable: boolean
  canRename: boolean
  /** Owner change — system boards stay with SYSTEM. */
  canAssign: boolean
  reason: string | null
}

export function protectionOf(board: Pick<BoardSummary, 'id' | 'name' | 'shareType'>): Protection {
  const isSystem =
    board.shareType === SHARE_TYPE.system || FIXED_SYSTEM_BOARDS.has(board.id.toLowerCase())
  if (isSystem) {
    return {
      canDelete: false,
      canDisable: false,
      canRename: false,
      canAssign: false,
      reason: 'System-Board — wird von URS mitgeliefert und vorausgesetzt.',
    }
  }
  if (INITIAL_PUBLIC_VIEW_NAMES.includes(board.name.trim().toLowerCase())) {
    return {
      canDelete: false,
      canDisable: true,
      canRename: true,
      canAssign: true,
      reason: 'Initiale öffentliche Ansicht — wird von URS vorausgesetzt.',
    }
  }
  return { canDelete: true, canDisable: true, canRename: true, canAssign: true, reason: null }
}

export function isDefaultBoard(board: Pick<BoardSummary, 'id'>): boolean {
  return board.id.toLowerCase() === 'dd3e0b8d-5dd9-4546-b081-bbf5ac4a0fb9'
}

/**
 * Boards that use configuration `configId` through `key` — directly, or by
 * inheriting it from the Default board (`defaultConfigId`) because their
 * own lookup is empty. Saving the configuration changes all of them.
 */
export function configUsers(
  boards: BoardSummary[],
  key: LookupKey,
  configId: string,
  defaultConfigId: string | null,
): BoardSummary[] {
  const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()
  return boards.filter(
    (b) => same(b.lookups[key], configId) || (!b.lookups[key] && !isDefaultBoard(b) && same(defaultConfigId, configId)),
  )
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * Content for a copy of `source`. Unlike the FastTrack control this carries
 * the three `msdyn_configuration` lookups and leaves System share type
 * behind (a copy is never a system board).
 */
export function buildCopyContent(source: Board, options: CopyOptions, nextOrder: number): BoardContent {
  const columns: Record<string, ColumnValue> = { ...source.content.columns }
  columns.msdyn_tabname = options.name.trim()
  const sourceShare = Number(source.shareType)
  columns.msdyn_sharetype =
    options.shareType ?? (sourceShare === SHARE_TYPE.system ? SHARE_TYPE.everyone : sourceShare)
  columns.msdyn_ordernumber = options.appendToEnd ? nextOrder : source.order
  return {
    columns,
    lookups: { ...source.content.lookups },
    settings: source.content.settings,
    filterValues: source.content.filterValues,
  }
}

export function nextOrderNumber(boards: BoardSummary[]): number {
  return boards.reduce((max, b) => Math.max(max, b.order ?? 0), 0) + 1
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type ChangeArea = 'column' | 'lookup' | 'settings' | 'filterValues'

export interface Change {
  area: ChangeArea
  /** Column logical name, lookup key, or flattened JSON path. */
  key: string
  label: string
  before: Json | undefined
  after: Json | undefined
}

function columnLabel(key: string): string {
  return BOARD_COLUMNS.find((c) => c.key === key)?.label ?? key
}

function diffJson(area: 'settings' | 'filterValues', a: string | null, b: string | null): Change[] {
  const pa = parseSettings(a)
  const pb = parseSettings(b)
  if (!pa.ok || !pb.ok) {
    return a === b ? [] : [{ area, key: area, label: area === 'settings' ? 'Settings (JSON)' : 'Filterwerte (JSON)', before: a, after: b }]
  }
  if (jsonEqual(pa.value, pb.value)) return []
  const left = new Map(flatten(pa.value).map((e) => [e.key, e.value]))
  const right = new Map(flatten(pb.value).map((e) => [e.key, e.value]))
  const keys = [...new Set([...left.keys(), ...right.keys()])]
  return keys
    .filter((k) => !jsonEqual(left.get(k), right.get(k)))
    .map((k) => ({
      area,
      key: k,
      label: area === 'settings' ? labelForSettingsKey(k) : `Filter: ${k}`,
      before: left.get(k),
      after: right.get(k),
    }))
}

/** Field-level changes from `a` to `b`. Empty means nothing to write. */
export function diffContent(a: BoardContent, b: BoardContent): Change[] {
  const changes: Change[] = []
  for (const col of BOARD_COLUMNS) {
    const before = a.columns[col.key] ?? null
    const after = b.columns[col.key] ?? null
    if (before !== after) changes.push({ area: 'column', key: col.key, label: columnLabel(col.key), before, after })
  }
  for (const lk of BOARD_LOOKUPS) {
    const before = a.lookups[lk.key] ?? null
    const after = b.lookups[lk.key] ?? null
    if ((before ?? '').toLowerCase() !== (after ?? '').toLowerCase()) {
      changes.push({ area: 'lookup', key: lk.key, label: lk.label, before, after })
    }
  }
  changes.push(...diffJson('settings', a.settings, b.settings))
  changes.push(...diffJson('filterValues', a.filterValues, b.filterValues))
  return changes
}

/** Which top-level fields a write has to send for `changes`. */
export function changedFields(changes: Change[]): {
  columns: string[]
  lookups: LookupKey[]
  settings: boolean
  filterValues: boolean
} {
  return {
    columns: [...new Set(changes.filter((c) => c.area === 'column').map((c) => c.key))],
    lookups: [...new Set(changes.filter((c) => c.area === 'lookup').map((c) => c.key as LookupKey))],
    settings: changes.some((c) => c.area === 'settings'),
    filterValues: changes.some((c) => c.area === 'filterValues'),
  }
}

// ---------------------------------------------------------------------------
// Bulk
// ---------------------------------------------------------------------------

/**
 * A bulk operation copies selected fields from a template board onto many
 * targets. Picking "what to transfer" from a diff is easier to get right than
 * describing a patch by hand, and the per-target preview is just another diff.
 */
export interface BulkSelection {
  columns: string[]
  lookups: LookupKey[]
  /** Flattened settings keys (top-level subtrees are allowed, e.g. `UnscheduledTabs`). */
  settingsPaths: PathSeg[][]
  filterValues: boolean
}

export function applySelection(
  target: BoardContent,
  template: BoardContent,
  selection: BulkSelection,
): BoardContent {
  const columns = { ...target.columns }
  for (const key of selection.columns) columns[key] = template.columns[key] ?? null
  const lookups = { ...target.lookups }
  for (const key of selection.lookups) lookups[key] = template.lookups[key] ?? null

  let settings = target.settings
  if (selection.settingsPaths.length > 0) {
    const t = parseSettings(target.settings)
    const s = parseSettings(template.settings)
    if (t.ok && s.ok) {
      let obj: Json = t.value
      for (const path of selection.settingsPaths) {
        obj = setAt(obj, path, getAt(s.value, path))
      }
      settings = JSON.stringify(obj)
    }
  }
  return {
    columns,
    lookups,
    settings,
    filterValues: selection.filterValues ? template.filterValues : target.filterValues,
  }
}

// ---------------------------------------------------------------------------
// Owner change
// ---------------------------------------------------------------------------

export type OwnerPlanStatus = 'change' | 'same' | 'protected'

export interface OwnerPlanRow {
  board: BoardSummary
  status: OwnerPlanStatus
}

/**
 * What an owner change to `owner` would do per target board: system boards
 * are skipped, boards the principal already owns need no write.
 */
export function planOwnerChange(boards: BoardSummary[], targetIds: string[], owner: PrincipalRef): OwnerPlanRow[] {
  return targetIds
    .map((id) => boards.find((b) => b.id === id))
    .filter((b): b is BoardSummary => b !== undefined)
    .map((board) => ({
      board,
      status: !protectionOf(board).canAssign
        ? 'protected'
        : board.ownerId !== null && board.ownerId.toLowerCase() === owner.id.toLowerCase()
          ? 'same'
          : 'change',
    }))
}
