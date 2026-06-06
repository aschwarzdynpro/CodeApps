import type { ApprovalRequest } from '../types/approval'
import {
  CATEGORY_LABELS,
  daysUntil,
  formatCurrency,
  formatDate,
} from '../utils/format'

interface ApprovalRowProps {
  approval: ApprovalRequest
  selected: boolean
  active: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}

function DueBadge({ dueOn }: { dueOn: string }) {
  const days = daysUntil(dueOn)
  const label =
    days < 0
      ? `${Math.abs(days)}d overdue`
      : days === 0
        ? 'Due today'
        : `${days}d left`
  const tone = days < 0 ? 'due--over' : days <= 1 ? 'due--soon' : 'due--ok'
  return <span className={`due ${tone}`}>{label}</span>
}

export function ApprovalRow({
  approval,
  selected,
  active,
  onToggle,
  onOpen,
}: ApprovalRowProps) {
  const { requester, priority } = approval
  return (
    <div
      className={`row ${active ? 'row--active' : ''} ${selected ? 'row--selected' : ''}`}
      onClick={() => onOpen(approval.id)}
    >
      <input
        type="checkbox"
        className="row-check"
        checked={selected}
        onChange={() => onToggle(approval.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${approval.title}`}
      />
      <span className={`avatar prio-${priority.toLowerCase()}`}>
        {requester.initials}
      </span>
      <div className="row-main">
        <span className="row-title">{approval.title}</span>
        <span className="row-sub">
          {requester.name} · {approval.source}
        </span>
      </div>
      <span className="row-cat">{CATEGORY_LABELS[approval.category]}</span>
      <span className="row-amount">{formatCurrency(approval.amount)}</span>
      <div className="row-meta">
        <DueBadge dueOn={approval.dueOn} />
        <span className="row-date">{formatDate(approval.submittedOn)}</span>
      </div>
    </div>
  )
}
