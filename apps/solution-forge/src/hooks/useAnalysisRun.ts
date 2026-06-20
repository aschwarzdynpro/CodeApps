import { useCallback, useRef, useState } from 'react'
import type { SolutionComponentInfo, WorkingSolution } from '../types/solution'
import type { DetectiveResult, PhaseState } from '../types/detective'
import { PHASE_ORDER } from '../types/detective'
import { runInvestigation } from '../services/detectiveService'
import { solutionService } from '../services/solutionService'

/**
 * One Analyze sweep, lifted out of the AnalyzeDashboard component so it
 * survives navigating to other tabs (the dashboard unmounts, the run keeps
 * going) and can be surfaced by a global background-activity bar.
 */
export interface AnalysisRun {
  solutionId: string
  solutionTitle: string
  envKey: 'uat' | 'prod'
  running: boolean
  phaseStates: Record<string, PhaseState>
  result: DetectiveResult | null
  components: SolutionComponentInfo[] | null
  analyzedAt: Date | null
  error: string | null
}

export interface UseAnalysisRun {
  /** The current/last run, or null before the first run. */
  run: AnalysisRun | null
  /** Start (or restart) the sweep for a solution + target environment. */
  start: (solution: WorkingSolution, envKey: 'uat' | 'prod') => void
}

export function useAnalysisRun(): UseAnalysisRun {
  const [run, setRun] = useState<AnalysisRun | null>(null)
  // Guards against stale callbacks when a newer run supersedes an older one.
  const reqRef = useRef(0)

  const start = useCallback(
    (solution: WorkingSolution, envKey: 'uat' | 'prod') => {
      const reqId = ++reqRef.current
      const init: Record<string, PhaseState> = {}
      for (const key of PHASE_ORDER) init[key] = { key, status: 'pending' }
      setRun({
        solutionId: solution.id,
        solutionTitle: solution.title,
        envKey,
        running: true,
        phaseStates: init,
        result: null,
        components: null,
        analyzedAt: null,
        error: null,
      })

      Promise.all([
        runInvestigation({
          solution,
          targetEnv: envKey,
          phases: PHASE_ORDER,
          onPhase: (state) => {
            if (reqId !== reqRef.current) return
            setRun((prev) =>
              prev
                ? {
                    ...prev,
                    phaseStates: { ...prev.phaseStates, [state.key]: state },
                  }
                : prev,
            )
          },
        }),
        solutionService
          .listComponents(solution.id)
          .catch(() => [] as SolutionComponentInfo[]),
      ])
        .then(([res, comps]) => {
          if (reqId !== reqRef.current) return
          setRun((prev) =>
            prev
              ? {
                  ...prev,
                  running: false,
                  result: res,
                  components: comps,
                  analyzedAt: new Date(),
                }
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
