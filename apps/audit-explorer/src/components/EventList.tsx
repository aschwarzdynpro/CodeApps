import type { AuditEvent } from '../types/audit'
import { OperationBadge } from './OperationBadge'
import { formatDateTime, relativeTime } from '../utils/format'

interface EventListProps {
  events: AuditEvent[]
  activeId: string | null
  onOpen: (id: string) => void
  showTable?: boolean
}

export function EventList({
  events,
  activeId,
  onOpen,
  showTable = true,
}: EventListProps) {
  if (events.length === 0) {
    return <div className="state">No audit events match the current filters.</div>
  }
  return (
    <div className="event-list">
      {events.map((e) => (
        <button
          key={e.id}
          className={`event-row ${e.id === activeId ? 'event-row--active' : ''}`}
          onClick={() => onOpen(e.id)}
        >
          <OperationBadge operation={e.operation} />
          <span className="avatar">{e.user.initials}</span>
          <div className="event-main">
            <span className="event-record">{e.recordName}</span>
            <span className="event-sub">
              {showTable && <span className="event-table">{e.tableName}</span>}
              {e.user.name}
            </span>
          </div>
          <span className="event-changes">
            {e.changes.length > 0 ? `${e.changes.length} field${e.changes.length > 1 ? 's' : ''}` : '—'}
          </span>
          <div className="event-meta">
            <span>{relativeTime(e.createdOn)}</span>
            <span className="event-date">{formatDateTime(e.createdOn)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
