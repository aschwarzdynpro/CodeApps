import { useState } from 'react'
import { parseRecordRef, type RecordRef } from '../utils/recordRef'

interface RecordQueryFormProps {
  onSubmit: (ref: RecordRef) => void
  /** Fills the box when arriving from a deep link or another mode. */
  preset?: string
}

/**
 * Record mode's input. Accepts a pasted form URL or a bare GUID — see
 * {@link parseRecordRef} for why the URL is the primary path.
 */
export function RecordQueryForm({ onSubmit, preset }: RecordQueryFormProps) {
  const [text, setText] = useState(preset ?? '')
  const parsed = parseRecordRef(text)
  const showHint = text.trim().length > 0 && !parsed

  return (
    <form
      className="query-bar"
      onSubmit={(e) => {
        e.preventDefault()
        if (parsed) onSubmit(parsed)
      }}
    >
      <label className="query-field query-field--wide">
        <span className="query-label">Record</span>
        <input
          className="query-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the form URL, or a record GUID"
          spellCheck={false}
        />
      </label>
      <button className="query-submit" type="submit" disabled={!parsed}>
        Search
      </button>
      {showHint && (
        <span className="query-hint">
          No record id found in that text — paste the address bar of the record
          form, or the GUID itself.
        </span>
      )}
      {parsed?.table && (
        <span className="query-note">Table: {parsed.table}</span>
      )}
    </form>
  )
}
