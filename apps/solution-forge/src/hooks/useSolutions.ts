import { useCallback, useEffect, useState } from 'react'
import { solutionService } from '../services/solutionService'
import type { PublisherInfo, WorkingSolution } from '../types/solution'

interface UseSolutionsResult {
  solutions: WorkingSolution[]
  publishers: PublisherInfo[]
  /** Configured default publisher (raw ssid_publisher_str), or null. */
  defaultPublisher: string | null
  loading: boolean
  error: string | null
  /** When the list was last loaded successfully (null before the first load). */
  loadedAt: Date | null
  reload: () => void
}

/** Loads the solution list and the available publishers once, with reload. */
export function useSolutions(): UseSolutionsResult {
  const [solutions, setSolutions] = useState<WorkingSolution[]>([])
  const [publishers, setPublishers] = useState<PublisherInfo[]>([])
  const [defaultPublisher, setDefaultPublisher] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [solutions, publishers, defaultPublisher] = await Promise.all([
        solutionService.listSolutions(),
        solutionService.listPublishers(),
        solutionService.getDefaultPublisher(),
      ])
      setSolutions(solutions)
      setPublishers(publishers)
      setDefaultPublisher(defaultPublisher)
      setLoadedAt(new Date())
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

  return {
    solutions,
    publishers,
    defaultPublisher,
    loading,
    error,
    loadedAt,
    reload: () => void load(),
  }
}
