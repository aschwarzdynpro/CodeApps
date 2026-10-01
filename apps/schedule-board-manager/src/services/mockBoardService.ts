import type { Board, BoardContent, BoardSummary, LookupKey } from '../types/board'
import { ACCESS, BOARD_LOOKUPS, ConflictError, levelOfMask } from '../types/board'
import type { BoardService, ResolvedRecord } from './boardService'
import { matchesAll, rankPrincipals, searchWords } from '../utils/principalSearch'
import {
  MOCK_BOOKING_SETUPS,
  MOCK_PRINCIPALS,
  MOCK_RECORDS,
  MOCK_TABLES,
  MOCK_TIME_ZONES,
  MOCK_VIEWS,
  createMockBoards,
  createMockConfigDetails,
  createMockShares,
  mockViewDefinition,
} from './mockData'

/** In-memory implementation for local development — state lives until reload. */

let boards: Board[] = createMockBoards()
const shares = createMockShares()
let configs = createMockConfigDetails()

const delay = <T,>(value: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))

const clone = <T,>(v: T): T => structuredClone(v)

function lookupNames(content: BoardContent): Record<LookupKey, string | null> {
  const names = {} as Record<LookupKey, string | null>
  for (const lk of BOARD_LOOKUPS) {
    const id = content.lookups[lk.key]
    names[lk.key] = id ? (configs.find((c) => c.id === id)?.name ?? null) : null
  }
  return names
}

function find(id: string): Board {
  const b = boards.find((x) => x.id === id)
  if (!b) throw new Error(`Board ${id} nicht gefunden.`)
  return b
}

function toSummary(b: Board): BoardSummary {
  const { id, name, shareType, active, order, ownerName, ownerId, modifiedOn } = b
  return { id, name, shareType, active, order, ownerName, ownerId, modifiedOn, lookups: { ...b.content.lookups } }
}

function touch(b: Board): void {
  b.version = (b.version ?? 0) + 1
  b.modifiedOn = new Date().toISOString()
}

export const mockBoardService: BoardService = {
  source: 'mock',

  listBoards: () =>
    delay(
      boards
        .map(toSummary)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    ),

  getBoard: (id) => {
    const b = find(id)
    return delay(clone({ ...b, lookupNames: lookupNames(b.content) }))
  },

  createBoard: (content) => {
    const id = crypto.randomUUID()
    const b: Board = {
      id,
      name: String(content.columns.msdyn_tabname ?? ''),
      shareType: Number(content.columns.msdyn_sharetype),
      active: true,
      order: Number(content.columns.msdyn_ordernumber ?? 0),
      ownerName: 'Ich (Mock)',
      ownerId: null,
      modifiedOn: new Date().toISOString(),
      version: 1,
      lookups: { ...content.lookups },
      content: clone(content),
      lookupNames: lookupNames(content),
    }
    boards = [...boards, b]
    return delay(id)
  },

  updateBoard: (original, next) => {
    const b = find(original.id)
    if (original.version !== null && b.version !== original.version) {
      return Promise.reject(new ConflictError())
    }
    b.content = clone(next)
    b.lookups = { ...next.lookups }
    b.name = String(next.columns.msdyn_tabname ?? b.name)
    b.shareType = Number(next.columns.msdyn_sharetype ?? b.shareType)
    b.order = Number(next.columns.msdyn_ordernumber ?? b.order)
    touch(b)
    return delay(undefined)
  },

  deleteBoard: (id) => {
    boards = boards.filter((b) => b.id !== id)
    return delay(undefined)
  },

  setActive: (id, active) => {
    const b = find(id)
    b.active = active
    touch(b)
    return delay(undefined)
  },

  setOrder: (updates) => {
    for (const u of updates) {
      const b = find(u.id)
      b.order = u.order
      b.content.columns.msdyn_ordernumber = u.order
      touch(b)
    }
    return delay(undefined)
  },

  assignBoard: (id, owner) => {
    if (owner.detail === 'Zugriffsteam') return Promise.reject(new Error('Besitzer ändern: Zugriffsteams können keine Datensätze besitzen.'))
    const b = find(id)
    b.ownerId = owner.id
    b.ownerName = owner.name
    touch(b)
    return delay(undefined)
  },

  listConfigurations: () => delay(configs.map(({ id, name, type }) => ({ id, name, type }))),

  getConfiguration: (id) => {
    const c = configs.find((x) => x.id === id)
    return c ? delay(clone(c)) : Promise.reject(new Error(`Konfiguration ${id} nicht gefunden.`))
  },

  updateConfiguration: (original, value) => {
    const c = configs.find((x) => x.id === original.id)
    if (!c) return Promise.reject(new Error('Konfiguration nicht gefunden.'))
    if (original.version !== null && c.version !== original.version) {
      return Promise.reject(new ConflictError('Die Konfiguration wurde zwischenzeitlich geändert.'))
    }
    c.value = value
    c.version = (c.version ?? 0) + 1
    return delay(undefined)
  },

  createConfiguration: (name, type, value) => {
    const id = crypto.randomUUID()
    configs = [...configs, { id, name, type, value, version: 1 }]
    return delay(id)
  },
  listViews: (entities) => delay(clone(entities ? MOCK_VIEWS.filter((v) => entities.includes(v.entity)) : MOCK_VIEWS)),
  getViewsByIds: (ids) => {
    const wanted = new Set(ids.map((id) => id.toLowerCase()))
    return delay(clone(MOCK_VIEWS.filter((v) => wanted.has(v.id.toLowerCase()))))
  },
  getViewDefinition: (id) => delay(mockViewDefinition(id)),
  resolveRecords: (entity, refs) => {
    const table = MOCK_RECORDS.filter((r) => r.entity === entity.toLowerCase())
    const out = new Map<string, ResolvedRecord>()
    for (const ref of refs) {
      const byId = table.find((r) => r.id.toLowerCase() === ref.id.toLowerCase())
      const byName = byId ? [] : table.filter((r) => ref.name !== null && r.name.toLowerCase() === ref.name.toLowerCase())
      const hit = byId ?? (byName.length === 1 ? byName[0] : null)
      if (hit) out.set(ref.id.toLowerCase(), { id: hit.id, name: hit.name, matchedBy: byId ? 'id' : 'name' })
    }
    return delay(out)
  },
  listBookingSetups: () => delay(clone(MOCK_BOOKING_SETUPS)),
  listTimeZones: () => delay(clone(MOCK_TIME_ZONES)),

  sharingUnavailable: () => null,

  listShares: (boardId) =>
    delay(
      (shares.get(boardId) ?? []).map((s) => {
        const p = MOCK_PRINCIPALS.find((x) => x.id === s.principalId)!
        return { ...p, mask: s.mask, level: levelOfMask(s.mask) }
      }),
    ),

  searchPrincipals: (term, options) => {
    const words = searchWords(term)
    if (words.length === 0) return delay([])
    const pool = options?.owners ? MOCK_PRINCIPALS.filter((p) => p.detail !== 'Zugriffsteam') : MOCK_PRINCIPALS
    return delay(rankPrincipals(pool.filter((p) => matchesAll(p, words)), term))
  },

  setShare: (boardId, principal, level) => {
    const mask = level === 'write' ? ACCESS.read | ACCESS.write : ACCESS.read
    const list = (shares.get(boardId) ?? []).filter((s) => s.principalId !== principal.id)
    shares.set(boardId, [...list, { principalId: principal.id, mask }])
    return delay(undefined)
  },

  revokeShare: (boardId, principal) => {
    shares.set(boardId, (shares.get(boardId) ?? []).filter((s) => s.principalId !== principal.id))
    return delay(undefined)
  },

  listTables: () =>
    delay(MOCK_TABLES.map(({ logicalName, displayName }) => ({ logicalName, displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName))),

  getTableInfo: (logicalName) => delay(clone(MOCK_TABLES.find((t) => t.logicalName === logicalName.toLowerCase()) ?? null)),
}
