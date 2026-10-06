import type { CalendarTree, Closure, DayResolution, RawCalendar } from '../types/calendar'
import { addDays, eachDay, maxDate } from './dates'
import { applyDelete, applySave, createStore, innerCalendarsOf, type MockCalendarStore } from './engine'
import { describeRequest, toRequests, type ApiRequest, type EditIntent } from './intents'
import { resolveDay } from './resolve'
import { buildTree } from './rules'

/**
 * Preview of an edit before it is saved: the requests are applied to a
 * copy of the tree with the server emulation, then both trees are resolved
 * day by day. Rules only — the server's slots can't be known in advance,
 * and the dialog says so.
 */

export interface PreviewDay {
  date: string
  before: DayResolution
  after: DayResolution
  changed: boolean
}

export interface Preview {
  requests: ApiRequest[]
  descriptions: string[]
  days: PreviewDay[]
  changedCount: number
  treeAfter: CalendarTree | null
  error: string | null
}

/** The tree as raw calendars again (outer calendar + inner calendars), deep-copied. */
export function storeFromTree(tree: CalendarTree): { store: MockCalendarStore; outer: RawCalendar } {
  const outer: RawCalendar = {
    calendarid: tree.calendarId,
    name: tree.name,
    description: null,
    type: 0,
    calendar_calendar_rules: [...tree.blocks.map((b) => b.raw.root), ...tree.unparsed],
  }
  const inner = [...tree.blocks.map((b) => b.raw.inner).filter((c): c is RawCalendar => !!c), ...tree.orphanInnerCalendars]
  let n = 0
  // ObserveClosure links the closure calendar the tree already points at (or a stand-in) — the preview shows the extra holiday list.
  const closureCalendarId = tree.blocks.find((b) => b.holidays && b.innerCalendarId)?.innerCalendarId ?? 'preview-closure-calendar'
  const store = createStore(structuredClone([outer, ...inner]), () => `preview-${++n}`, () => new Date().toISOString(), closureCalendarId)
  return { store, outer: store.calendars.get(tree.calendarId.toLowerCase())! }
}

/** Applies requests to a copy of the tree and returns the resulting tree. */
export function applyRequests(tree: CalendarTree, requests: ApiRequest[]): CalendarTree {
  const { store, outer } = storeFromTree(tree)
  for (const r of requests) {
    if (r.action === 'msdyn_SaveCalendar') applySave(store, r.info)
    else applyDelete(store, r.info)
  }
  return buildTree(outer, innerCalendarsOf(store, outer))
}

/** Days worth showing: from the first affected day (never before today) for four weeks. */
export function previewRange(intent: EditIntent, today: string): { from: string; to: string } {
  const start = intent.op === 'create' || intent.op === 'edit' || intent.op === 'editDay' ? intent.spec.date : intent.op === 'end' ? intent.lastDay : intent.block.start
  const from = maxDate(start, today)
  return { from, to: addDays(from, 27) }
}

export interface PreviewOptions {
  closures: Closure[]
  viewerTz: string
  useV2: boolean
  today: string
}

export function previewIntent(tree: CalendarTree, intent: EditIntent, opts: PreviewOptions): Preview {
  let requests: ApiRequest[]
  try {
    requests = toRequests(intent)
  } catch (err) {
    return { requests: [], descriptions: [], days: [], changedCount: 0, treeAfter: null, error: err instanceof Error ? err.message : String(err) }
  }
  let treeAfter: CalendarTree
  try {
    treeAfter = applyRequests(tree, requests)
  } catch (err) {
    return { requests, descriptions: requests.map(describeRequest), days: [], changedCount: 0, treeAfter: null, error: err instanceof Error ? err.message : String(err) }
  }
  const range = previewRange(intent, opts.today)
  const common = { viewerTz: opts.viewerTz, slots: null, closures: opts.closures, useV2: opts.useV2 }
  const days = eachDay(range.from, range.to).map((date) => {
    const before = resolveDay({ ...common, date, tree })
    const after = resolveDay({ ...common, date, tree: treeAfter })
    const key = (d: DayResolution) => JSON.stringify(d.segments.map((s) => [s.kind, s.startMin, s.endMin, s.effort]))
    return { date, before, after, changed: key(before) !== key(after) }
  })
  return { requests, descriptions: requests.map(describeRequest), days, changedCount: days.filter((d) => d.changed).length, treeAfter, error: null }
}
