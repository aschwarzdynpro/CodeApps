import { useCallback, useEffect, useState } from 'react'
import { approvalService } from '../services/approvalService'
import type { ApprovalDecision, ApprovalRequest } from '../types/approval'

interface UseApprovalsResult {
  approvals: ApprovalRequest[]
  loading: boolean
  error: string | null
  busy: boolean
  decide: (
    ids: string[],
    decision: ApprovalDecision,
    comment?: string,
  ) => Promise<void>
  reload: () => void
}

export function useApprovals(): UseApprovalsResult {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setApprovals(await approvalService.list())
    } catch {
      setError('Could not load approvals.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial fetch on mount — load() sets loading/data state as it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const decide = useCallback(
    async (ids: string[], decision: ApprovalDecision, comment?: string) => {
      setBusy(true)
      try {
        await approvalService.decide(ids, decision, comment)
        await load()
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  return { approvals, loading, error, busy, decide, reload: () => void load() }
}
