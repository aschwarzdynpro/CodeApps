import { createContext, useContext } from 'react'
import type { BookingSetupRef, ConfigRef, TimeZoneRef, ViewRef } from '../types/board'
import type { BoardService } from '../services/boardService'

/** Lookup lists every editor needs; loaded once per session. */
export interface RefData {
  configs: ConfigRef[]
  views: ViewRef[]
  bookingSetups: BookingSetupRef[]
  timeZones: TimeZoneRef[]
}

export const EMPTY_REF_DATA: RefData = { configs: [], views: [], bookingSetups: [], timeZones: [] }

export async function loadRefData(svc: BoardService): Promise<RefData> {
  const [configs, views, bookingSetups, timeZones] = await Promise.all([
    svc.listConfigurations(),
    svc.listViews(),
    svc.listBookingSetups(),
    svc.listTimeZones(),
  ])
  return { configs, views, bookingSetups, timeZones }
}

export const RefDataContext = createContext<RefData>(EMPTY_REF_DATA)

export const useRefData = () => useContext(RefDataContext)
