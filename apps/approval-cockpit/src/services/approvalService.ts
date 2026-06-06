import type { ApprovalDecision, ApprovalRequest } from '../types/approval'
import { mockApprovals } from './mockData'

/**
 * Service contract for the cockpit. The mock implementation below serves
 * sample data; a real implementation would call Power Platform connectors
 * (Approvals, Dataverse, custom connectors) behind the same interface, so the
 * UI / hooks don't change when you go live.
 */
export interface ApprovalService {
  list(): Promise<ApprovalRequest[]>
  decide(
    ids: string[],
    decision: ApprovalDecision,
    comment?: string,
  ): Promise<void>
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

class MockApprovalService implements ApprovalService {
  // Clone so in-memory mutations don't leak across reloads of the module.
  private store: ApprovalRequest[] = mockApprovals.map((a) => ({ ...a }))

  async list(): Promise<ApprovalRequest[]> {
    await delay(350)
    return this.store.map((a) => ({ ...a }))
  }

  async decide(
    ids: string[],
    decision: ApprovalDecision,
    comment?: string,
  ): Promise<void> {
    await delay(450)
    const next = decision === 'approve' ? 'Approved' : 'Rejected'
    this.store = this.store.map((a) =>
      ids.includes(a.id) ? { ...a, status: next } : a,
    )
    if (comment) {
      // A real service would persist the comment alongside the decision.
      console.info(`[approval] ${decision} ${ids.join(', ')} — "${comment}"`)
    }
  }
}

export const approvalService: ApprovalService = new MockApprovalService()
