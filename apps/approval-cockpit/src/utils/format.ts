import type { ApprovalCategory, ApprovalPriority } from '../types/approval'

export const CATEGORY_LABELS: Record<ApprovalCategory, string> = {
  Leave: 'Leave',
  PurchaseOrder: 'Purchase order',
  Invoice: 'Invoice',
  Expense: 'Expense',
  Access: 'Access',
}

export function formatCurrency(amount?: number): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(iso))
}

/** Days until the due date relative to "today" (2026-06-06 in this demo). */
export function daysUntil(iso: string, now = new Date('2026-06-06')): number {
  const ms = new Date(iso).getTime() - now.getTime()
  return Math.round(ms / 86_400_000)
}

export const PRIORITY_ORDER: Record<ApprovalPriority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
}
