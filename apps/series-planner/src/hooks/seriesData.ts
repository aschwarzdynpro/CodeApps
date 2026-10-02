import { useCallback } from 'react'
import type { SeriesService } from '../services/seriesService'
import { addDays, daysInMonth, parseDate, toDateStr } from '../utils/dates'
import { useLoad } from './useLoad'

/**
 * Data hooks keyed by plain strings, so `useLoad` only reloads when the
 * inputs really change (arrays from render would be new every time).
 */

/** Whole months around the dates — fewer reloads while the pattern is edited. */
export function availabilityRange(dates: string[]): { from: string; to: string } | null {
  if (dates.length === 0) return null
  const sorted = [...dates].sort()
  const a = parseDate(sorted[0])
  const b = parseDate(sorted[sorted.length - 1])
  return {
    from: `${addDays(toDateStr(a.y, a.m, 1), -1)}T00:00:00Z`,
    to: `${addDays(toDateStr(b.y, b.m, daysInMonth(b.y, b.m)), 2)}T00:00:00Z`,
  }
}

export function useAvailability(resourceIds: (string | null)[], dates: string[]) {
  const ids = [...new Set(resourceIds.filter((r): r is string => !!r).map((r) => r.toLowerCase()))].sort()
  const range = availabilityRange(dates)
  const key = range && ids.length ? `avail:${ids.join(',')}|${range.from}|${range.to}` : null
  const load = useCallback(
    (svc: SeriesService) => {
      const [list, from, to] = key!.slice('avail:'.length).split('|')
      return svc.loadAvailability(list.split(','), from, to)
    },
    [key],
  )
  return useLoad(key, load)
}

export function useResourceNames(resourceIds: (string | null | undefined)[]) {
  const ids = [...new Set(resourceIds.filter((r): r is string => !!r).map((r) => r.toLowerCase()))].sort()
  const key = ids.length ? `names:${ids.join(',')}` : null
  const load = useCallback((svc: SeriesService) => svc.resolveRefs('resource', key!.slice('names:'.length).split(',')), [key])
  const res = useLoad(key, load)
  return new Map((res.data ?? []).map((r) => [r.id.toLowerCase(), r.name]))
}
