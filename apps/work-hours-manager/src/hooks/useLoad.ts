import { useCallback, useEffect, useRef, useState } from 'react'
import { getCalendarService, type CalendarService } from '../services/calendarService'

interface LoadState<T> {
  token: string
  data?: T
  error?: string
}

export interface LoadResult<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => void
}

/**
 * Loads `load(service)` whenever `key` changes or `reload()` is called.
 * `load` may be an inline closure: the latest one is kept in a ref and only
 * `key` decides when to fetch — so every input of the loader must be part
 * of the key.
 *
 * Loading is derived from a token instead of a flag set inside the effect,
 * which the React Compiler lint rules forbid. While a reload of the same
 * key runs, the previous data stays visible.
 */
export function useLoad<T>(key: string | null, load: (svc: CalendarService) => Promise<T>): LoadResult<T> {
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<LoadState<T> | null>(null)
  const token = key === null ? null : `${key}#${nonce}`
  const loadRef = useRef(load)

  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    if (token === null) return
    let cancelled = false
    getCalendarService()
      .then((svc) => loadRef.current(svc))
      .then(
        (data) => {
          if (!cancelled) setState({ token, data })
        },
        (err: unknown) => {
          if (!cancelled) setState({ token, error: err instanceof Error ? err.message : String(err) })
        },
      )
    return () => {
      cancelled = true
    }
  }, [token])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const current = state !== null && state.token === token ? state : null
  const stale = state !== null && key !== null && state.token.startsWith(`${key}#`) ? state : null

  return {
    data: (current ?? stale)?.data,
    error: current?.error ?? null,
    loading: token !== null && current === null,
    reload,
  }
}
