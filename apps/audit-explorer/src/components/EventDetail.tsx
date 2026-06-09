import type { AuditEvent } from '../types/audit'
import { OperationBadge } from './OperationBadge'
import { formatDateTime } from '../utils/format'

export function EventDetail({ event }: { event: AuditEvent }) {
  return (
    <section className="card detail">
      <div className="detail-top">
        <OperationBadge operation={event.operation} />
        <span className="detail-id">{event.id}</span>
      </div>

      <h2 className="detail-record">{event.recordName}</h2>
      <p className="detail-context">
        {event.tableName} · {event.recordId}
      </p>

      <dl className="meta-grid">
        <div>
          <dt>Changed by</dt>
          <dd>
            <span className="avatar avatar--sm">{event.user.initials}</span>
            {event.user.name}
          </dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{formatDateTime(event.createdOn)}</dd>
        </div>
      </dl>

      {event.operation === 'Delete' ? (
        <div className="note">Record was deleted — no column-level changes.</div>
      ) : event.operation === 'Access' ? (
        <div className="note">Access event — record was read, not modified.</div>
      ) : (
        <div className="changes">
          <div className="changes-head">
            <span>Field</span>
            <span>Old value</span>
            <span>New value</span>
          </div>
          {event.changes.map((c) => (
            <div className="change-row" key={c.attribute}>
              <span className="change-attr">{c.attribute}</span>
              <span className="change-old">{c.oldValue || '—'}</span>
              <span className="change-new">{c.newValue || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
