import { useCallback, useEffect, useState } from 'react'
import { auditService } from '../services/auditService'
import type { AuditEvent, AuditedTable } from '../types/audit'

interface UseAuditResult {
  events: AuditEvent[]
  auditedTables: AuditedTable[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useAudit(): UseAuditResult {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [auditedTables, setAuditedTables] = useState<AuditedTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [events, tables] = await Promise.all([
        auditService.list(),
        auditService.listAuditedTables(),
      ])
      setEvents(events)
      setAuditedTables(tables)
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

  return { events, auditedTables, loading, error, reload: () => void load() }
}
