import type {
  Board,
  BoardContent,
  BoardSummary,
  BookingSetupRef,
  ConfigDetail,
  ConfigRef,
  PrincipalRef,
  Share,
  ShareLevel,
  TableInfo,
  TableRef,
  TimeZoneRef,
  ViewRef,
} from '../types/board'
import { powerModeReady } from '../PowerProvider'
import { dataverseBoardService } from './dataverseBoardService'
import { mockBoardService } from './mockBoardService'

/**
 * Everything the UI needs from Dataverse. Writes take the full next content
 * plus the board as loaded; implementations send only the changed fields and
 * refuse with {@link ConflictError} when the row moved on in the meantime —
 * the schedule board itself rewrites `msdyn_settings` whenever a dispatcher
 * changes a view setting.
 */
export interface BoardService {
  readonly source: 'dataverse' | 'mock'
  listBoards(): Promise<BoardSummary[]>
  getBoard(id: string): Promise<Board>
  /** Creates a board from full content; returns the new id. */
  createBoard(content: BoardContent): Promise<string>
  updateBoard(original: Board, next: BoardContent): Promise<void>
  deleteBoard(id: string): Promise<void>
  setActive(id: string, active: boolean): Promise<void>
  /** Writes `msdyn_ordernumber` for the given boards only. */
  setOrder(updates: { id: string; order: number }[]): Promise<void>
  listConfigurations(): Promise<ConfigRef[]>
  getConfiguration(id: string): Promise<ConfigDetail>
  /** Writes `msdyn_value`; refuses with ConflictError if the row changed since load. */
  updateConfiguration(original: ConfigDetail, value: string): Promise<void>
  createConfiguration(name: string, type: number, value: string): Promise<string>
  /** Tables offered in pickers (valid for Advanced Find). */
  listTables(): Promise<TableRef[]>
  /** Columns of one table with lookup targets; null when the table doesn't exist. */
  getTableInfo(logicalName: string): Promise<TableInfo | null>
  /** System and personal views of the tables the editor offers. */
  listViews(): Promise<ViewRef[]>
  listBookingSetups(): Promise<BookingSetupRef[]>
  listTimeZones(): Promise<TimeZoneRef[]>

  // Record sharing — what "Specific people" boards are visible to.
  /** Null when sharing works; otherwise why it is unavailable (shown in the UI). */
  sharingUnavailable(): string | null
  listShares(boardId: string): Promise<Share[]>
  searchPrincipals(term: string): Promise<PrincipalRef[]>
  /** New share, or a changed level for an existing one. */
  setShare(boardId: string, principal: PrincipalRef, level: ShareLevel, existing: boolean): Promise<void>
  revokeShare(boardId: string, principal: PrincipalRef): Promise<void>
}

/** Tables whose views can be picked anywhere in the editor. */
export const VIEW_ENTITIES = [
  'bookableresource',
  'bookableresourcebooking',
  'msdyn_resourcerequirement',
  'msdyn_organizationalunit',
  'msdyn_bookingalert',
]

/**
 * Picks the implementation once the host probe is done. Unlike the read-only
 * apps in this repo there is no silent fallback to mock data on errors: a
 * write that "succeeds" against the mock would lie to the user.
 */
export async function getBoardService(): Promise<BoardService> {
  const mode = await powerModeReady
  return mode === 'power-platform' ? dataverseBoardService : mockBoardService
}
