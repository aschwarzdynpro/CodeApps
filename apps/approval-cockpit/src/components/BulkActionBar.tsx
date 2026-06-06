interface BulkActionBarProps {
  count: number
  busy: boolean
  onApprove: () => void
  onReject: () => void
  onClear: () => void
}

export function BulkActionBar({
  count,
  busy,
  onApprove,
  onReject,
  onClear,
}: BulkActionBarProps) {
  if (count === 0) return null
  return (
    <div className="bulk-bar">
      <span className="bulk-count">{count} selected</span>
      <div className="bulk-actions">
        <button className="btn btn--ghost" onClick={onClear} disabled={busy}>
          Clear
        </button>
        <button className="btn btn--reject" onClick={onReject} disabled={busy}>
          Reject
        </button>
        <button className="btn btn--approve" onClick={onApprove} disabled={busy}>
          {busy ? 'Working…' : 'Approve'}
        </button>
      </div>
    </div>
  )
}
