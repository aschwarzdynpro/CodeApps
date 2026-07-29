import { useState } from 'react'
import type { StoredQuery } from '../utils/odataStore'
import { formatRelative } from '../utils/format'

/**
 * Recent and saved queries for the current environment.
 *
 * Both lists are per environment on purpose: a query path only makes sense
 * against the schema it was written for, and offering a PROD-only column while
 * browsing DEV would just produce a fault.
 */
interface Props {
  history: StoredQuery[]
  saved: StoredQuery[]
  /** Load a query into the builder. */
  onPick: (entry: StoredQuery) => void
  onDeleteSaved: (id: string) => void
  onClearHistory: () => void
  onClose: () => void
}

export function OdataQueryLibrary({
  history,
  saved,
  onPick,
  onDeleteSaved,
  onClearHistory,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'history' | 'saved'>(
    saved.length > 0 ? 'saved' : 'history',
  )
  const list = tab === 'saved' ? saved : history

  return (
    <div className="odb-library">
      <div className="odb-library-head">
        <div className="subtabs">
          <button
            className={`subtab ${tab === 'saved' ? 'subtab--active' : ''}`}
            onClick={() => setTab('saved')}
          >
            Saved ({saved.length})
          </button>
          <button
            className={`subtab ${tab === 'history' ? 'subtab--active' : ''}`}
            onClick={() => setTab('history')}
          >
            Recent ({history.length})
          </button>
        </div>
        <span className="odb-library-actions">
          {tab === 'history' && history.length > 0 && (
            <button className="btn btn--small" onClick={onClearHistory}>
              Clear
            </button>
          )}
          <button className="btn btn--small" onClick={onClose}>
            Close
          </button>
        </span>
      </div>

      {list.length === 0 ? (
        <div className="muted odb-library-empty">
          {tab === 'saved'
            ? 'No saved queries in this environment yet — run one and press Save.'
            : 'No queries run in this environment yet.'}
        </div>
      ) : (
        <ul className="odb-library-list">
          {list.map((entry) => (
            <li key={entry.id}>
              <button className="odb-library-item" onClick={() => onPick(entry)}>
                <span className="odb-library-name">
                  {entry.name ?? entry.table}
                </span>
                <code>{entry.path}</code>
                <span className="muted odb-library-when">
                  {formatRelative(new Date(entry.at).toISOString())}
                </span>
              </button>
              {tab === 'saved' && (
                <button
                  className="btn btn--small odb-library-del"
                  title="Delete this saved query"
                  onClick={() => onDeleteSaved(entry.id)}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
