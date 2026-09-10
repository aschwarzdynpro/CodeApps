import { useCallback, useEffect, useState } from 'react'
import { auditService } from '../services/auditService'
import type { AuditSettings, TableAudit } from '../types/audit'

/**
 * Org-level audit settings, loaded once.
 *
 * Until they arrive the app assumes the friendliest-but-quietest state —
 * auditing on, retention unknown — so no banner flashes on startup and no
 * false all-clear is given either.
 */
export function useAuditSettings(): AuditSettings {
  const [settings, setSettings] = useState<AuditSettings>({
    orgAuditEnabled: true,
    retentionDays: null,
  })

  const load = useCallback(async () => {
    setSettings(await auditService.getAuditSettings())
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return settings
}

/**
 * Audit configuration of one table, or null while unknown / unavailable.
 *
 * This is what lets the empty state stop hedging: with metadata in hand the app
 * can say auditing is off for the table rather than that it might be.
 */
export function useTableAudit(table: string | undefined): TableAudit | null {
  const [info, setInfo] = useState<TableAudit | null>(null)

  const load = useCallback(async () => {
    if (!table) {
      setInfo(null)
      return
    }
    setInfo(await auditService.getTableAudit(table))
  }, [table])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return info
}
