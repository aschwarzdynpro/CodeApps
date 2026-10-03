import { useCallback, useEffect, useState } from 'react'
import { getTranslationService, type TranslationService } from '../services/translationService'

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

interface CacheEntry {
  nonce: number
  promise: Promise<unknown>
  done?: boolean
  value?: unknown
}

/**
 * Results by key, shared by the `useLoad` calls that get the same cache:
 * a key loads once, coming back to it shows the result at once. Failed
 * loads are dropped so the next visit tries again.
 */
export type LoadCache = Map<string, CacheEntry>

/**
 * Loads `load(service)` whenever `key` changes or `reload()` is called.
 * `load` must be referentially stable (module-level or useCallback).
 *
 * Loading is derived from a token instead of a flag set inside the effect,
 * which the React Compiler lint rules forbid.
 */
export function useLoad<T>(key: string | null, load: (svc: TranslationService) => Promise<T>, cache?: LoadCache): LoadResult<T> {
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<LoadState<T> | null>(null)
  const token = key === null ? null : `${key}#${nonce}`

  useEffect(() => {
    if (token === null || key === null) return
    let cancelled = false
    let entry = cache?.get(key)
    if (!entry || entry.nonce !== nonce) {
      const created: CacheEntry = { nonce, promise: getTranslationService().then(load) }
      created.promise.then(
        (value) => {
          created.done = true
          created.value = value
        },
        () => {
          if (cache?.get(key) === created) cache.delete(key)
        },
      )
      cache?.set(key, created)
      entry = created
    }
    entry.promise.then(
      (data) => {
        if (!cancelled) setState({ token, data: data as T })
      },
      (err: unknown) => {
        if (!cancelled) setState({ token, error: err instanceof Error ? err.message : String(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [token, key, nonce, load, cache])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  // A finished load of this key in the cache shows at once, without a loading flash.
  const hit = key !== null ? cache?.get(key) : undefined
  const cached: LoadState<T> | null = token !== null && hit && hit.nonce === nonce && hit.done ? { token, data: hit.value as T } : null
  const current = state !== null && state.token === token ? state : cached
  // Keep showing the previous data while a reload of the same key runs.
  const stale = state !== null && key !== null && state.token.startsWith(`${key}#`) ? state : null

  return {
    data: (current ?? stale)?.data,
    error: current?.error ?? null,
    loading: token !== null && current === null,
    reload,
  }
}
