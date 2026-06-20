import { useCallback, useRef, useState } from 'react'
import type { WorkingSolution } from '../types/solution'
import type { DependencyCheckResult } from '../types/dependency'
import { solutionService } from '../services/solutionService'

/**
 * One Deployment-Readiness (dependency) check, lifted out of the
 * DependencyCheck component so it survives navigating to other tabs (the
 * workspace unmounts, the check keeps going) and can be surfaced by a global
 * background-activity bar — exactly like {@link useAnalysisRun} does for the
 * Analyze sweep.
 */
export interface ReadinessRun {
  solutionId: string
  solutionTitle: string
  envKey: 'uat' | 'prod'
  running: boolean
  progress: string
  result: DependencyCheckResult | null
  error: string | null
  checkedAt: Date | null
}

export interface UseReadinessRun {
  /** The current/last check, or null before the first run. */
  run: ReadinessRun | null
  /** Start (or restart) the dependency check for a solution and target env. */
  start: (solution: WorkingSolution, envKey: 'uat' | 'prod') => void
}

export function useReadinessRun(): UseReadinessRun {
  const [run, setRun] = useState<ReadinessRun | null>(null)
  // Guards against stale callbacks when a newer check supersedes an older one.
  const reqRef = useRef(0)

  const start = useCallback(
    (solution: WorkingSolution, envKey: 'uat' | 'prod') => {
      const reqId = ++reqRef.current
      setRun({
        solutionId: solution.id,
        solutionTitle: solution.title,
        envKey,
        running: true,
        progress: 'Starting…',
        result: null,
        error: null,
        checkedAt: null,
      })

      solutionService
        .checkDependencies(solution, envKey, (msg) => {
          if (reqId !== reqRef.current) return
          setRun((prev) => (prev ? { ...prev, progress: msg } : prev))
        })
        .then((res) => {
          if (reqId !== reqRef.current) return
          setRun((prev) =>
            prev
              ? { ...prev, running: false, result: res, checkedAt: new Date() }
              : prev,
          )
        })
        .catch((err) => {
          if (reqId !== reqRef.current) return
          setRun((prev) =>
            prev
              ? {
                  ...prev,
                  running: false,
                  error: err instanceof Error ? err.message : String(err),
                }
              : prev,
          )
        })
    },
    [],
  )

  return { run, start }
}
