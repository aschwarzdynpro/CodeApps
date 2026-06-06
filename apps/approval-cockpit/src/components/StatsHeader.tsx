import type { ApprovalRequest } from '../types/approval'
import { daysUntil, formatCurrency } from '../utils/format'

export function StatsHeader({ approvals }: { approvals: ApprovalRequest[] }) {
  const pending = approvals.filter((a) => a.status === 'Pending')
  const highPriority = pending.filter((a) => a.priority === 'High').length
  const overdue = pending.filter((a) => daysUntil(a.dueOn) < 0).length
  const totalValue = pending.reduce((sum, a) => sum + (a.amount ?? 0), 0)

  const stats = [
    { label: 'Pending', value: String(pending.length) },
    { label: 'High priority', value: String(highPriority) },
    { label: 'Overdue', value: String(overdue) },
    { label: 'Value at stake', value: formatCurrency(totalValue) },
  ]

  return (
    <div className="stats">
      {stats.map((s) => (
        <div className="stat-card" key={s.label}>
          <span className="stat-value">{s.value}</span>
          <span className="stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  )
}
