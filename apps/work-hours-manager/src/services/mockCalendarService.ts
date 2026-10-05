import type { CalendarEventInfo, CalendarTree, Closure, DeleteCalendarInfo, Resource, Slot, TimeOffRequest, WorkHourTemplate } from '../types/calendar'
import { addDays } from '../utils/dates'
import { expandTree, toSlots } from '../utils/resolve'
import { buildTree } from '../utils/rules'
import type { CalendarService, SetupCheck } from './calendarService'
import { CLOSURE_CALENDAR_ID, MOCK_ORG_NAME, createMockState } from './mockData'
import { MockApiError, applyClosureDelete, applyClosureSave, applyDelete, applySave, innerCalendarsOf } from '../utils/engine'

/** In-memory implementation — state lives until the page reloads. */

const state = createMockState()

const delay = <T,>(value: T, ms = 120): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms))
const clone = <T,>(v: T): T => structuredClone(v)

function treeOf(calendarId: string): CalendarTree | null {
  const cal = state.store.calendars.get(calendarId.toLowerCase())
  return cal ? buildTree(cal, innerCalendarsOf(state.store, cal)) : null
}

function closuresBetween(from: string, to: string): Closure[] {
  const tree = treeOf(CLOSURE_CALENDAR_ID)
  const lo = Date.parse(from)
  const hi = Date.parse(to)
  return (tree?.blocks ?? [])
    .map((b) => {
      const start = Date.parse(b.raw.root.starttime ?? '')
      const end = start + (b.raw.root.duration ?? 0) * 60_000
      return { id: b.rootRuleId, name: b.description ?? 'Geschäftsschließung', start: new Date(start).toISOString(), end: new Date(end).toISOString() }
    })
    .filter((c) => Date.parse(c.start) < hi && Date.parse(c.end) > lo)
}

const rethrow = (err: unknown): never => {
  throw err instanceof MockApiError ? new Error(`msdyn_SaveCalendar (Mock): ${err.message}`) : err
}

export const mockCalendarService: CalendarService = {
  source: 'mock',

  listResources: () => delay(clone(state.resources)),
  listTemplates: () => delay(clone(state.templates)),

  async getTrees(calendarIds) {
    const out: Record<string, CalendarTree> = {}
    for (const id of calendarIds) {
      const t = treeOf(id)
      if (t) out[id.toLowerCase()] = t
    }
    return delay(out)
  },

  async loadSlots(calendarIds, from, to) {
    const closures = closuresBetween(from, to)
    const out: Record<string, Slot[]> = {}
    for (const id of calendarIds) {
      const tree = treeOf(id)
      if (!tree) continue
      const resource = state.resources.find((r) => r.calendarId?.toLowerCase() === id.toLowerCase())
      const observe = resource ? state.extras[resource.id]?.observesClosures !== false : true
      // Local dates a day wider than the instants, then clipped to the range.
      const ex = expandTree(tree, addDays(from.slice(0, 10), -1), addDays(to.slice(0, 10), 1), { closures, observeClosures: observe })
      const lo = Date.parse(from)
      const hi = Date.parse(to)
      out[id.toLowerCase()] = toSlots(id, ex.work.filter((w) => w.start < hi && w.end > lo))
    }
    return delay(out, 200)
  },

  loadClosures: (from, to) => delay(closuresBetween(from, to)),

  async loadTimeOff(resourceIds, from, to) {
    const ids = new Set(resourceIds.map((r) => r.toLowerCase()))
    const lo = Date.parse(from)
    const hi = Date.parse(to)
    return delay(clone(state.timeOff.filter((t) => ids.has(t.resourceId.toLowerCase()) && Date.parse(t.start) < hi && Date.parse(t.end) > lo)))
  },

  async countBookingsAfter(resourceIds) {
    return delay(Object.fromEntries(resourceIds.map((id) => [id, state.extras[id]?.bookingsAfterToday ?? 0])))
  },

  async saveCalendar(info: CalendarEventInfo) {
    try {
      return await delay(applySave(state.store, clone(info)), 250)
    } catch (err) {
      return rethrow(err)
    }
  },

  async deleteCalendar(info: DeleteCalendarInfo) {
    try {
      return await delay(applyDelete(state.store, info), 200)
    } catch (err) {
      return rethrow(err)
    }
  },

  async saveClosure(name, start, end) {
    try {
      applyClosureSave(state.store, CLOSURE_CALENDAR_ID, name, start, end)
      await delay(undefined, 150)
    } catch (err) {
      rethrow(err)
    }
  },

  async deleteClosure(closure) {
    applyClosureDelete(state.store, CLOSURE_CALENDAR_ID, closure.id)
    await delay(undefined, 150)
  },

  async checkSetup(): Promise<SetupCheck[]> {
    return delay([
      { label: 'Umgebung', ok: true, detail: `${MOCK_ORG_NAME} — Beispieldaten im Speicher` },
      { label: 'Ressourcen', ok: true, detail: `${state.resources.length} Ressourcen, ${state.templates.length} Vorlagen` },
      { label: 'Geschäftsschließungen', ok: true, detail: `Kalender ${CLOSURE_CALENDAR_ID}` },
      { label: 'Actions', ok: true, detail: 'msdyn_SaveCalendar, msdyn_DeleteCalendar, msdyn_LoadCalendars, msdyn_BusinessClosureSave (simuliert)' },
    ])
  },
}

/** For tests and the dev console: the mock's state. */
export const __mockState = state

export type { TimeOffRequest, Resource, WorkHourTemplate }
