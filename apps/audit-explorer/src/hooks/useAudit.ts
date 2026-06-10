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

/**
 * Loads the audit log for the selected date range. The range is pushed into
 * the service (server-side `createdon` filter) — client-side filtering alone
 * can't work on a busy environment, because the page cap fills entirely with
 * the most recent days no matter which range is selected.
 *
 * @param rangeDays window in days; Infinity loads the full log
 */
export function useAudit(rangeDays: number): UseAuditResult {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [auditedTables, setAuditedTables] = useState<AuditedTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sinceDays = Number.isFinite(rangeDays) ? rangeDays : undefined
      const [events, tables] = await Promise.all([
        auditService.list({ sinceDays }),
        auditService.listAuditedTables(),
      ])
      setEvents(events)
      setAuditedTables(tables)
    } catch {
      setError('Could not load audit data.')
    } finally {
      setLoading(false)
    }
  }, [rangeDays])

  useEffect(() => {
    // Fetch on mount and whenever the range changes — load() drives
    // loading/data state as it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return { events, auditedTables, loading, error, reload: () => void load() }
}
