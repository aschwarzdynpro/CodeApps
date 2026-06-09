import { useCallback, useEffect, useState } from 'react'
import { auditService } from '../services/auditService'
import type { AuditEvent } from '../types/audit'

interface UseAuditResult {
  events: AuditEvent[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useAudit(): UseAuditResult {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEvents(await auditService.list())
    } catch {
      setError('Could not load audit data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial fetch on mount — load() drives loading/data state as it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return { events, loading, error, reload: () => void load() }
}
