import { useCallback, useEffect, useState } from 'react'
import { auditService } from '../services/auditService'
import type { AuditEvent, AuditQuery } from '../types/audit'

interface UseAuditQueryResult {
  events: AuditEvent[]
  /** True once a query has run — separates "nothing found" from "not asked". */
  answered: boolean
  truncated: boolean
  loading: boolean
  error: string | null
}

/**
 * Runs one bounded audit question and holds its answer.
 *
 * Pass `null` to stay idle: the explorer deliberately shows nothing until a
 * question has been asked, so the empty state can explain what the mode is for
 * instead of presenting an empty result as if the log were empty.
 */
export function useAuditQuery(query: AuditQuery | null): UseAuditQueryResult {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [answered, setAnswered] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!query) {
      setEvents([])
      setAnswered(false)
      setTruncated(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await auditService.search(query)
      setEvents(result.events)
      setTruncated(result.truncated)
      setAnswered(true)
    } catch {
      setError('Could not load audit data.')
      setAnswered(true)
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    // Fires on every new query object — the forms create one on submit, so a
    // repeated search with identical values re-runs on purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run()
  }, [run])

  return { events, answered, truncated, loading, error }
}
