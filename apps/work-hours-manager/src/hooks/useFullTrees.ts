import { useEffect, useMemo, useState } from 'react'
import { getCalendarService } from '../services/calendarService'
import type { CalendarTree } from '../types/calendar'

interface FullTreesState {
  version: number
  trees: Record<string, CalendarTree>
  /** Trees of the previous version — shown until the reload of the same id arrives (like `useLoad`). */
  stale: Record<string, CalendarTree>
  /** Calendar id → error text (also "not found"), so a failed id isn't fetched again and again. */
  errors: Record<string, string>
}

export interface FullTrees {
  /** Full trees (root rules + inner calendars) keyed by lower-cased calendar id. */
  trees: Record<string, CalendarTree>
  errors: Record<string, string>
  /** Some requested calendar is still loading. */
  loading: boolean
}

/**
 * Full trees for the calendars that are open right now (inspector, editor,
 * run targets, templates). Loaded once per `version`; a new id only fetches
 * what is missing. While a new version loads, the previous trees stay
 * visible. Results arrive in a promise callback, never synchronously in the
 * effect (React Compiler rules). The returned objects keep their identity
 * while nothing changes, so memoized consumers (diagnostics, list) don't recompute.
 */
export function useFullTrees(calendarIds: string[], version: number): FullTrees {
  const [state, setState] = useState<FullTreesState>({ version, trees: {}, stale: {}, errors: {} })
  const current: FullTreesState = state.version === version ? state : { version, trees: {}, stale: { ...state.stale, ...state.trees }, errors: {} }
  const ids = [...new Set(calendarIds.map((id) => id.toLowerCase()))].sort()
  const idsKey = ids.join(',')
  const missing = ids.filter((id) => !current.trees[id] && !current.errors[id])
  const key = missing.join(',')

  useEffect(() => {
    if (!key) return
    const wanted = key.split(',')
    let cancelled = false
    const merge = (trees: Record<string, CalendarTree>, errors: Record<string, string>) =>
      setState((prev) => {
        const base = prev.version === version ? prev : { version, trees: {}, stale: { ...prev.stale, ...prev.trees }, errors: {} }
        return { version, trees: { ...base.trees, ...trees }, stale: base.stale, errors: { ...base.errors, ...errors } }
      })
    getCalendarService()
      .then((svc) => svc.getTrees(wanted, 'full'))
      .then(
        (result) => {
          if (cancelled) return
          const notFound = Object.fromEntries(wanted.filter((id) => !result.trees[id] && !result.errors[id]).map((id) => [id, 'Kalender nicht gefunden']))
          merge(result.trees, { ...result.errors, ...notFound })
        },
        (err: unknown) => {
          if (cancelled) return
          const text = err instanceof Error ? err.message : String(err)
          merge({}, Object.fromEntries(wanted.map((id) => [id, text])))
        },
      )
    return () => {
      cancelled = true
    }
  }, [key, version])

  const { trees: loaded, stale, errors } = current
  const trees = useMemo(
    () => Object.fromEntries(idsKey.split(',').flatMap((id) => (id && (loaded[id] ?? stale[id]) ? [[id, loaded[id] ?? stale[id]]] : []))) as Record<string, CalendarTree>,
    [idsKey, loaded, stale],
  )
  return { trees, errors, loading: missing.length > 0 }
}
