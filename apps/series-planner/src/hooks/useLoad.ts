import { useCallback, useEffect, useState } from 'react'
import { getSeriesService, type SeriesService } from '../services/seriesService'

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
 * `load` must be referentially stable (module-level or useCallback).
 *
 * Loading is derived from a token instead of a flag set inside the effect,
 * which the React Compiler lint rules forbid.
 */
export function useLoad<T>(
  key: string | null,
  load: (svc: SeriesService) => Promise<T>,
): LoadResult<T> {
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<LoadState<T> | null>(null)
  const token = key === null ? null : `${key}#${nonce}`

  useEffect(() => {
    if (token === null) return
    let cancelled = false
    getSeriesService()
      .then(load)
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
  }, [token, load])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const current = state !== null && state.token === token ? state : null
  // Keep showing the previous data while a reload of the same key runs.
  const stale = state !== null && key !== null && state.token.startsWith(`${key}#`) ? state : null

  return {
    data: (current ?? stale)?.data,
    error: current?.error ?? null,
    loading: token !== null && current === null,
    reload,
  }
}
