import { useState } from 'react'
import type { BoardContent } from '../types/board'
import { parseSettings } from '../utils/settingsModel'
import { Textarea } from '@fluentui/react-components'

interface Props {
  draft: BoardContent
  onChange: (next: BoardContent) => void
}

const pretty = (raw: string | null) => {
  const p = parseSettings(raw)
  return p.ok ? (raw === null ? '' : JSON.stringify(p.value, null, 2)) : (raw ?? '')
}

function JsonArea({
  label,
  raw,
  onValid,
}: {
  label: string
  raw: string | null
  onValid: (compact: string | null) => void
}) {
  const [text, setText] = useState(() => pretty(raw))
  const result = text.trim() === '' ? null : parseSettings(text)
  const error = result && !result.ok ? result.error : null

  return (
    <div className="json-area">
      <div className="json-area__head">
        <h3>{label}</h3>
        {error ? <span className="badge badge--error">Ungültig: {error}</span> : <span className="badge badge--ok">gültig</span>}
      </div>
      <Textarea
        className="input input--mono json-area__text"
        spellCheck={false}
        value={text}
        aria-label={label}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          if (next.trim() === '') onValid(null)
          else {
            const p = parseSettings(next)
            if (p.ok) onValid(JSON.stringify(p.value))
          }
        }}
      />
    </div>
  )
}

/**
 * Fallback for everything the form does not cover. Only valid JSON reaches
 * the draft; while the text is invalid the draft keeps the last valid state.
 */
export function RawJsonEditor({ draft, onChange }: Props) {
  return (
    <div className="raw-json">
      <p className="muted">
        Änderungen hier landen im selben Entwurf wie das Formular und laufen beim Speichern durch dieselbe Vorschau.
        Unbekannte Schlüssel bitte nur ändern, wenn klar ist, was das Board damit macht.
      </p>
      <JsonArea label="Settings (msdyn_settings)" raw={draft.settings} onValid={(s) => onChange({ ...draft, settings: s })} />
      <JsonArea
        label="Filterwerte (msdyn_filtervalues)"
        raw={draft.filterValues}
        onValid={(s) => onChange({ ...draft, filterValues: s })}
      />
    </div>
  )
}
