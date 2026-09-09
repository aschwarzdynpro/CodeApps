import type { AuditEvent } from '../types/audit'
import { recordUrl } from '../config'
import { formatDateTime } from '../utils/format'

interface RecordHeaderProps {
  /** Events of a single record, newest first. */
  events: AuditEvent[]
  recordId: string
  /** Logical name from the query, used when the log itself has none. */
  fallbackTable?: string
}

/**
 * Identity card for the record under investigation.
 *
 * Everything here is read out of the audit log, because that is all the app can
 * reach: it has data sources for `audit` and `systemuser` only, so the record's
 * own row is not queryable. That has one consequence worth being explicit
 * about — see the owner line below.
 */
export function RecordHeader({
  events,
  recordId,
  fallbackTable,
}: RecordHeaderProps) {
  const newest = events[0]
  const oldest = events[events.length - 1]
  const table = newest?.tableLogicalName || fallbackTable
  const tableName = newest?.tableName || fallbackTable || 'Unknown table'
  const name = newest?.recordName || '(no name in audit log)'
  const href = recordUrl(table, recordId)

  // The current owner is not knowable from here, so we show the last ownership
  // change the log recorded and label it as exactly that. An unlabelled owner
  // would be read as current state, which on a forensic screen is worse than
  // showing nothing.
  const ownerChange = events.find((e) =>
    e.changes.some((c) => c.attribute === 'ownerid'),
  )
  const owner = ownerChange?.changes.find((c) => c.attribute === 'ownerid')
    ?.newValue

  return (
    <section className="record-head">
      <div className="record-head-main">
        <span className="record-table">{tableName}</span>
        <h2 className="record-name">{name}</h2>
        {href && (
          <a
            className="record-link"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            Open in Dynamics ↗
          </a>
        )}
      </div>
      <dl className="record-meta">
        <div>
          <dt>Record id</dt>
          <dd className="mono">{recordId}</dd>
        </div>
        {table && (
          <div>
            <dt>Logical name</dt>
            <dd className="mono">{table}</dd>
          </div>
        )}
        <div>
          <dt>Audited range</dt>
          <dd>
            {oldest && newest
              ? `${formatDateTime(oldest.createdOn)} – ${formatDateTime(
                  newest.createdOn,
                )}`
              : '—'}
          </dd>
        </div>
        {owner && (
          <div>
            <dt>Owner (last audited change)</dt>
            <dd>{owner}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
