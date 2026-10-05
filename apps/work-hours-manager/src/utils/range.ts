import { addDays, endOfMonth, formatDate, formatMonthYear, isoWeek, startOfIsoWeek, startOfMonth } from './dates'

/**
 * The visible range of the calendar views. Week = ISO week of the anchor;
 * month = the six-week grid around the anchor's month. Pure, so the data
 * hooks can key their loads on `from`/`to`.
 */

export type RangeMode = 'week' | 'month'

export interface RangeState {
  mode: RangeMode
  /** Any date inside the range. */
  anchor: string
}

export interface VisibleRange {
  from: string
  to: string
  /** First/last day of the month for month mode (week mode: = from/to). */
  focusFrom: string
  focusTo: string
  label: string
}

export function visibleRange(state: RangeState): VisibleRange {
  if (state.mode === 'week') {
    const from = startOfIsoWeek(state.anchor)
    const to = addDays(from, 6)
    return { from, to, focusFrom: from, focusTo: to, label: `KW ${isoWeek(from)} · ${formatDate(from)} – ${formatDate(to)}` }
  }
  const focusFrom = startOfMonth(state.anchor)
  const focusTo = endOfMonth(state.anchor)
  const from = startOfIsoWeek(focusFrom)
  const to = addDays(from, 41)
  return { from, to, focusFrom, focusTo, label: formatMonthYear(focusFrom) }
}

export function shiftRange(state: RangeState, direction: -1 | 1): RangeState {
  if (state.mode === 'week') return { ...state, anchor: addDays(state.anchor, 7 * direction) }
  const first = startOfMonth(state.anchor)
  return { ...state, anchor: direction > 0 ? addDays(endOfMonth(first), 1) : startOfMonth(addDays(first, -1)) }
}
