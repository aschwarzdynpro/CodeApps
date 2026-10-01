import type { Board, BoardContent, BoardSummary, LookupKey } from '../types/board'
import { ACCESS, BOARD_LOOKUPS, ConflictError, levelOfMask } from '../types/board'
import type { BoardService } from './boardService'
import {
  MOCK_BOOKING_SETUPS,
  MOCK_CONFIGS,
  MOCK_PRINCIPALS,
  MOCK_TIME_ZONES,
  MOCK_VIEWS,
  createMockBoards,
  createMockShares,
} from './mockData'

/** In-memory implementation for local development — state lives until reload. */

let boards: Board[] = createMockBoards()
const shares = createMockShares()

const delay = <T,>(value: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))

const clone = <T,>(v: T): T => structuredClone(v)

function lookupNames(content: BoardContent): Record<LookupKey, string | null> {
  const names = {} as Record<LookupKey, string | null>
  for (const lk of BOARD_LOOKUPS) {
    const id = content.lookups[lk.key]
    names[lk.key] = id ? (MOCK_CONFIGS.find((c) => c.id === id)?.name ?? null) : null
  }
  return names
}

function find(id: string): Board {
  const b = boards.find((x) => x.id === id)
  if (!b) throw new Error(`Board ${id} nicht gefunden.`)
  return b
}

function toSummary(b: Board): BoardSummary {
  const { id, name, shareType, active, order, ownerName, modifiedOn } = b
  return { id, name, shareType, active, order, ownerName, modifiedOn }
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
      modifiedOn: new Date().toISOString(),
      version: 1,
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

  listConfigurations: () => delay(clone(MOCK_CONFIGS)),
  listViews: () => delay(clone(MOCK_VIEWS)),
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

  searchPrincipals: (term) => {
    const t = term.trim().toLowerCase()
    return delay(t.length < 2 ? [] : MOCK_PRINCIPALS.filter((p) => p.name.toLowerCase().includes(t) || p.detail?.toLowerCase().includes(t)))
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
}
