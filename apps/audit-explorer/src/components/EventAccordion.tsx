import { useState } from 'react'
import type { AttributeChange, AuditEvent } from '../types/audit'
import { auditService } from '../services/auditService'
import { OperationBadge } from './OperationBadge'
import { formatDateTime, formatDate, dayKey } from '../utils/format'

interface EventAccordionProps {
  events: AuditEvent[]
  /** Group rows under day headings — used where the question is time-framed. */
  groupByDay?: boolean
  /** Hide the table column where every row is the same table. */
  showTable?: boolean
  /** Jump to another question with a value taken from this row. */
  onOpenRecord?: (event: AuditEvent) => void
  onOpenPerson?: (event: AuditEvent) => void
}

/**
 * Result list where each row expands in place to reveal its field diff.
 *
 * Deliberately not a drill-down: comparing two or three changes side by side is
 * the normal forensic move, and a breadcrumb round trip per entry makes that
 * needlessly slow. Several rows can therefore be open at once.
 */
export function EventAccordion({
  events,
  groupByDay = false,
  showTable = true,
  onOpenRecord,
  onOpenPerson,
}: EventAccordionProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [fetched, setFetched] = useState<Record<string, AttributeChange[]>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const toggle = (event: AuditEvent) => {
    const isOpen = Boolean(open[event.id])
    setOpen((prev) => ({ ...prev, [event.id]: !isOpen }))
    if (isOpen) return
    // Rows normally arrive with their diff inline (the `changedata` column).
    // Only when the runtime withheld it do we pay for a detail round trip,
    // and only for operations that can carry column changes at all.
    const needsFetch =
      event.changes.length === 0 &&
      !fetched[event.id] &&
      (event.operation === 'Update' || event.operation === 'Create')
    if (!needsFetch) return
    setBusy((prev) => ({ ...prev, [event.id]: true }))
    auditService
      .getChanges(event.id)
      .then((changes) => setFetched((prev) => ({ ...prev, [event.id]: changes })))
      .catch(() => setFetched((prev) => ({ ...prev, [event.id]: [] })))
      .finally(() => setBusy((prev) => ({ ...prev, [event.id]: false })))
  }

  const rows: { day: string | null; event: AuditEvent }[] = []
  let lastDay: string | null = null
  for (const event of events) {
    const key = dayKey(event.createdOn)
    const day = groupByDay && key !== lastDay ? key : null
    if (day) lastDay = key
    rows.push({ day, event })
  }

  const dayCount = (key: string) =>
    events.filter((e) => dayKey(e.createdOn) === key).length

  return (
    <div className="accordion">
      {rows.map(({ day, event }) => {
        const changes = event.changes.length ? event.changes : fetched[event.id]
        const isOpen = Boolean(open[event.id])
        return (
          <div key={event.id}>
            {day && (
              <div className="day-head">
                <span>{formatDate(event.createdOn)}</span>
                <span className="day-count">{dayCount(day)}</span>
              </div>
            )}
            <button
              className={`acc-row ${isOpen ? 'acc-row--open' : ''}`}
              onClick={() => toggle(event)}
              aria-expanded={isOpen}
            >
              <span className="acc-caret" aria-hidden="true">
                {isOpen ? '▾' : '▸'}
              </span>
              <span className="acc-time">{formatDateTime(event.createdOn)}</span>
              <OperationBadge operation={event.operation} />
              {showTable && <span className="acc-table">{event.tableName}</span>}
              <span className="acc-record">{event.recordName || '—'}</span>
              <span className="acc-user">
                <span className="avatar avatar--sm">{event.user.initials}</span>
                {event.user.name}
              </span>
              <span className="acc-count">
                {changes?.length
                  ? `${changes.length} field${changes.length > 1 ? 's' : ''}`
                  : ''}
              </span>
            </button>

            {isOpen && (
              <div className="acc-panel">
                {event.operation === 'Delete' ? (
                  <div className="note">
                    Record was deleted — no column-level changes.
                  </div>
                ) : event.operation === 'Access' ? (
                  <div className="note">
                    Access event — record was read, not modified.
                  </div>
                ) : busy[event.id] ? (
                  <div className="note">Loading field changes…</div>
                ) : !changes || changes.length === 0 ? (
                  <div className="note">No column-level changes recorded.</div>
                ) : (
                  <div className="changes">
                    <div className="changes-head">
                      <span>Field</span>
                      <span>Old value</span>
                      <span>New value</span>
                    </div>
                    {changes.map((c) => (
                      <div className="change-row" key={c.attribute}>
                        <span className="change-attr">{c.attribute}</span>
                        <span className="change-old">{c.oldValue || '—'}</span>
                        <span className="change-new">{c.newValue || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="acc-actions">
                  {onOpenRecord && event.recordId && (
                    <button
                      className="link-btn"
                      onClick={() => onOpenRecord(event)}
                    >
                      All changes to this record
                    </button>
                  )}
                  {onOpenPerson && event.user.id && (
                    <button
                      className="link-btn"
                      onClick={() => onOpenPerson(event)}
                    >
                      All changes by {event.user.name}
                    </button>
                  )}
                  <span className="acc-id">{event.id}</span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
