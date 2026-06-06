import { useState } from 'react'
import type { ApprovalRequest } from '../types/approval'
import {
  CATEGORY_LABELS,
  formatCurrency,
  formatDate,
} from '../utils/format'

interface ApprovalDetailProps {
  approval: ApprovalRequest | null
  busy: boolean
  onApprove: (id: string, comment: string) => void
  onReject: (id: string, comment: string) => void
  onClose: () => void
}

export function ApprovalDetail({
  approval,
  busy,
  onApprove,
  onReject,
  onClose,
}: ApprovalDetailProps) {
  // Mounted with a key tied to the request id (see App.tsx), so the comment
  // state resets automatically whenever a different request is opened.
  const [comment, setComment] = useState('')

  if (!approval) {
    return (
      <aside className="detail detail--empty">
        <p>Select a request to see details.</p>
      </aside>
    )
  }

  const decided = approval.status !== 'Pending'

  return (
    <aside className="detail">
      <div className="detail-head">
        <div>
          <span className="detail-cat">
            {CATEGORY_LABELS[approval.category]} · {approval.id}
          </span>
          <h2 className="detail-title">{approval.title}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="detail-requester">
        <span className={`avatar prio-${approval.priority.toLowerCase()}`}>
          {approval.requester.initials}
        </span>
        <div>
          <div className="detail-req-name">{approval.requester.name}</div>
          <div className="detail-req-email">{approval.requester.email}</div>
        </div>
      </div>

      <p className="detail-desc">{approval.description}</p>

      <dl className="detail-grid">
        <div>
          <dt>Amount</dt>
          <dd>{formatCurrency(approval.amount)}</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>{approval.priority}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{formatDate(approval.submittedOn)}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{formatDate(approval.dueOn)}</dd>
        </div>
        {approval.details.map((d) => (
          <div key={d.label}>
            <dt>{d.label}</dt>
            <dd>{d.value}</dd>
          </div>
        ))}
      </dl>

      {decided ? (
        <div className={`decided decided--${approval.status.toLowerCase()}`}>
          {approval.status}
        </div>
      ) : (
        <>
          <textarea
            className="comment"
            placeholder="Add a comment (optional)…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="detail-actions">
            <button
              className="btn btn--reject"
              disabled={busy}
              onClick={() => onReject(approval.id, comment)}
            >
              Reject
            </button>
            <button
              className="btn btn--approve"
              disabled={busy}
              onClick={() => onApprove(approval.id, comment)}
            >
              {busy ? 'Working…' : 'Approve'}
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
