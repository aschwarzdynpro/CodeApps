import { useCallback, useEffect, useState } from 'react'
import { solutionService } from '../services/solutionService'
import type { PublisherInfo, WorkingSolution } from '../types/solution'

interface UseSolutionsResult {
  solutions: WorkingSolution[]
  publishers: PublisherInfo[]
  loading: boolean
  error: string | null
  reload: () => void
}

/** Loads the solution list and the available publishers once, with reload. */
export function useSolutions(): UseSolutionsResult {
  const [solutions, setSolutions] = useState<WorkingSolution[]>([])
  const [publishers, setPublishers] = useState<PublisherInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [solutions, publishers] = await Promise.all([
        solutionService.listSolutions(),
        solutionService.listPublishers(),
      ])
      setSolutions(solutions)
      setPublishers(publishers)
    } catch {
      setError('Could not load solutions from the environment.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Fetch on mount — load() drives loading/data state as it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return { solutions, publishers, loading, error, reload: () => void load() }
}
