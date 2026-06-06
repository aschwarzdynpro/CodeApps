export type ApprovalCategory =
  | 'Leave'
  | 'PurchaseOrder'
  | 'Invoice'
  | 'Expense'
  | 'Access'

export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected'

export type ApprovalPriority = 'Low' | 'Medium' | 'High'

export interface Requester {
  name: string
  email: string
  /** Two-letter initials used for the avatar chip. */
  initials: string
}

export interface ApprovalRequest {
  id: string
  title: string
  category: ApprovalCategory
  status: ApprovalStatus
  priority: ApprovalPriority
  requester: Requester
  /** Source system the request originated from (connector / backend). */
  source: string
  submittedOn: string // ISO date
  dueOn: string // ISO date
  description: string
  /** Optional monetary amount (Invoice / PO / Expense), in EUR. */
  amount?: number
  /** Extra key/value details rendered in the detail pane. */
  details: { label: string; value: string }[]
}

export type ApprovalDecision = 'approve' | 'reject'
