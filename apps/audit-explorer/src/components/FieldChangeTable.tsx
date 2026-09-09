import { useMemo, useState } from 'react'
import type { AuditEvent, AuditUser, FieldChangeRow } from '../types/audit'
import { recordUrl } from '../config'
import { formatDateTime } from '../utils/format'

type SortKey = 'date' | 'user' | 'record'

interface FieldChangeTableProps {
  events: AuditEvent[]
  /** Logical name of the watched column. */
  attribute: string
  /** Logical name of the table, for the deep links. */
  table?: string
  onOpenRecord?: (recordId: string, table?: string) => void
  onOpenPerson?: (user: AuditUser) => void
}

/**
 * The field mode's result, and the reason it exists.
 *
 * Record and person questions produce events; a field question produces a
 * *value history*. Hiding old -> new behind an expander here would defeat the
 * point — "who changed prices, from what, to what" has to be scannable in one
 * column, which is precisely what Dataverse offers nowhere out of the box.
 */
export function FieldChangeTable({
  events,
  attribute,
  table,
  onOpenRecord,
  onOpenPerson,
}: FieldChangeTableProps) {
  const [sort, setSort] = useState<SortKey>('date')

  const rows = useMemo<FieldChangeRow[]>(() => {
    const mapped: FieldChangeRow[] = []
    for (const event of events) {
      const change = event.changes.find((c) => c.attribute === attribute)
      if (!change) continue
      mapped.push({
        eventId: event.id,
        createdOn: event.createdOn,
        recordId: event.recordId,
        recordName: event.recordName,
        user: event.user,
        oldValue: change.oldValue,
        newValue: change.newValue,
      })
    }
    const sorted = [...mapped]
    sorted.sort((a, b) => {
      if (sort === 'user') return a.user.name.localeCompare(b.user.name)
      if (sort === 'record') return a.recordName.localeCompare(b.recordName)
      return b.createdOn.localeCompare(a.createdOn)
    })
    return sorted
  }, [events, attribute, sort])

  const header = (key: SortKey, label: string) => (
    <button
      className={`fc-sort ${sort === key ? 'fc-sort--active' : ''}`}
      onClick={() => setSort(key)}
    >
      {label}
    </button>
  )

  return (
    <div className="field-table">
      <div className="fc-head">
        <span>{header('date', 'When')}</span>
        <span>{header('record', 'Record')}</span>
        <span>From</span>
        <span>To</span>
        <span>{header('user', 'Who')}</span>
      </div>
      {rows.map((row) => (
        <div className="fc-row" key={row.eventId}>
          <span className="fc-when">{formatDateTime(row.createdOn)}</span>
          <span className="fc-record">
            {onOpenRecord && row.recordId ? (
              <button
                className="link-btn"
                onClick={() => onOpenRecord(row.recordId)}
              >
                {row.recordName || row.recordId}
              </button>
            ) : (
              row.recordName || '—'
            )}
            {recordUrl(table, row.recordId) && (
              <a
                className="row-open"
                href={recordUrl(table, row.recordId) ?? undefined}
                target="_blank"
                rel="noreferrer"
                title="Open this record in Dynamics"
              >
                ↗
              </a>
            )}
          </span>
          <span className="fc-old">{row.oldValue || '—'}</span>
          <span className="fc-new">{row.newValue || '—'}</span>
          <span className="fc-who">
            {onOpenPerson && row.user.id ? (
              <button
                className="link-btn"
                onClick={() => onOpenPerson(row.user)}
              >
                {row.user.name}
              </button>
            ) : (
              row.user.name
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
