import { useCallback, useRef, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import type {
  ComparerEnvState,
  ComparerResult,
  ComparerRow,
  ComparerRunApi,
} from '../types/comparer'
import { recomputeDrift } from '../types/comparer'
import { ENVIRONMENTS, currentEnvKey } from '../config'

/**
 * A component-local {@link ComparerRunApi} for the Plugin Comparer: same shape
 * as the persistent Flow run, but plain `useState` (no cross-tab persistence,
 * no bulk). Keeps {@link ComparerWorkspace} agnostic to which comparer it is.
 */
export function useLocalComparerRun(
  compareFn: (
    solution: WorkingSolution,
    onProgress?: (message: string) => void,
  ) => Promise<ComparerResult>,
): ComparerRunApi {
  const [solutionId, setSolutionIdState] = useState('')
  const [result, setResult] = useState<ComparerResult | null>(null)
  const [comparing, setComparing] = useState(false)
  const [compareProgress, setCompareProgress] = useState('')
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)

  const setSolutionId = useCallback((id: string) => {
    setSolutionIdState(id)
    setResult(null)
    setError(null)
  }, [])

  const startCompare = useCallback(
    (solution: WorkingSolution) => {
      const reqId = ++reqRef.current
      setSolutionIdState(solution.id)
      setComparing(true)
      setError(null)
      setResult(null)
      setCompareProgress('')
      compareFn(solution, (msg) => {
        if (reqId === reqRef.current) setCompareProgress(msg)
      })
        .then((res) => {
          if (reqId !== reqRef.current) return
          setResult(res)
          setLoadedAt(new Date())
          setComparing(false)
          setCompareProgress('')
        })
        .catch((err) => {
          if (reqId !== reqRef.current) return
          setError(err instanceof Error ? err.message : String(err))
          setComparing(false)
          setCompareProgress('')
        })
    },
    [compareFn],
  )

  const applyCell = useCallback(
    (rowId: string, envKey: string, cell: ComparerEnvState) => {
      setResult((prev) => {
        if (!prev) return prev
        const hostKey = currentEnvKey()
        const envKeys = ENVIRONMENTS.map((e) => e.key)
        const rows = prev.rows.map((r) => {
          if (r.id !== rowId) return r
          const updated: ComparerRow = {
            ...r,
            byEnv: { ...r.byEnv, [envKey]: cell },
          }
          updated.statusDrift = recomputeDrift(updated, hostKey, envKeys)
          return updated
        })
        return { ...prev, rows }
      })
    },
    [],
  )

  return {
    solutionId,
    result,
    comparing,
    compareProgress,
    loadedAt,
    error,
    bulk: null,
    setSolutionId,
    startCompare,
    applyCell,
    startBulk: () => {},
    dismissBulk: () => {},
  }
}
