import { useEffect, useState } from 'react'
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
 * effect (React Compiler rules).
 */
export function useFullTrees(calendarIds: string[], version: number): FullTrees {
  const [state, setState] = useState<FullTreesState>({ version, trees: {}, stale: {}, errors: {} })
  const current: FullTreesState = state.version === version ? state : { version, trees: {}, stale: { ...state.stale, ...state.trees }, errors: {} }
  const missing = [...new Set(calendarIds.map((id) => id.toLowerCase()))].filter((id) => !current.trees[id] && !current.errors[id]).sort()
  const key = missing.join(',')

  useEffect(() => {
    if (!key) return
    const ids = key.split(',')
    let cancelled = false
    const merge = (trees: Record<string, CalendarTree>, errors: Record<string, string>) =>
      setState((prev) => {
        const base = prev.version === version ? prev : { version, trees: {}, stale: { ...prev.stale, ...prev.trees }, errors: {} }
        return { version, trees: { ...base.trees, ...trees }, stale: base.stale, errors: { ...base.errors, ...errors } }
      })
    getCalendarService()
      .then((svc) => svc.getTrees(ids, 'full'))
      .then(
        (trees) => {
          if (cancelled) return
          const errors = Object.fromEntries(ids.filter((id) => !trees[id]).map((id) => [id, 'Kalender nicht gefunden']))
          merge(trees, errors)
        },
        (err: unknown) => {
          if (cancelled) return
          const text = err instanceof Error ? err.message : String(err)
          merge({}, Object.fromEntries(ids.map((id) => [id, text])))
        },
      )
    return () => {
      cancelled = true
    }
  }, [key, version])

  const visible = Object.fromEntries(calendarIds.map((id) => id.toLowerCase()).flatMap((id) => (current.trees[id] ?? current.stale[id] ? [[id, current.trees[id] ?? current.stale[id]]] : [])))
  return { trees: visible, errors: current.errors, loading: missing.length > 0 }
}
