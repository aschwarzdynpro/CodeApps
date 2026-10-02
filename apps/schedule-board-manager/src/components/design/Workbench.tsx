import { useRef, type ReactNode } from 'react'
import { Input, Textarea } from '@fluentui/react-components'
import { ArrowResetRegular } from '@fluentui/react-icons'
import type { TemplateLint } from '../../utils/templates'
import { Btn } from '../ui'
import { InsertContext, type Insert } from './insert'

/**
 * Two columns: template code with palette on the left, preview and sample
 * values on the right. Narrow (by the panel's own width, not the window —
 * the Power Apps host and the board list take a lot of it): code, preview,
 * then palette, so the preview stays next to what is being typed. The palette inserts at the cursor; read-only mode
 * (inherited or product template) shows the code but takes no input.
 */
export function TemplateWorkbench({
  label,
  value,
  readOnly,
  lints,
  onChange,
  palette,
  builder,
  children,
}: {
  label: string
  value: string
  readOnly: boolean
  lints: TemplateLint[]
  onChange: (value: string) => void
  /** Field or variable picker; inserts through {@link InsertContext}. */
  palette: ReactNode
  /** Visual editor shown instead of the code; inserts through its own handler. */
  builder?: { node: ReactNode; insert: Insert }
  children: ReactNode
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const insert: Insert = (text) => {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + text + value.slice(end))
    // After React wrote the new value, put the caret behind the insertion.
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + text.length, start + text.length)
    })
  }

  return (
    <div className="workbench">
      <div className="workbench__code">
        {builder ? (
          builder.node
        ) : (
          <Textarea
            ref={ref}
            className="input input--mono workbench__text"
            aria-label={label}
            spellCheck={false}
            readOnly={readOnly}
            value={value}
            // As high as the template (no empty block under a one-liner), within limits.
            rows={Math.min(Math.max(value.split('\n').length + 1, 4), 22)}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        <LintList lints={lints} />
      </div>
      <div className="workbench__palette">
        <InsertContext.Provider value={readOnly ? null : (builder?.insert ?? insert)}>{palette}</InsertContext.Provider>
      </div>
      <div className="workbench__preview">{children}</div>
    </div>
  )
}

export function LintList({ lints }: { lints: TemplateLint[] }) {
  if (lints.length === 0) return null
  return (
    <ul className="lint-list">
      {lints.map((l) => (
        <li key={l.message} className={`lint lint--${l.level}`}>
          {l.message}
        </li>
      ))}
    </ul>
  )
}

export interface SampleRow {
  key: string
  label?: string
  value: string
  overridden: boolean
}

/** Editable sample values for the preview — never written anywhere. */
export function SampleTable({
  rows,
  hint,
  onChange,
  onReset,
}: {
  rows: SampleRow[]
  hint?: ReactNode
  onChange: (key: string, value: string) => void
  onReset: () => void
}) {
  return (
    <details className="samples" open={rows.length <= 8}>
      <summary>Beispielwerte ({rows.length})</summary>
      <div className="samples__head">
        {hint ? <p className="muted small">{hint}</p> : <span />}
        {rows.some((r) => r.overridden) ? (
          <Btn small kind="ghost" icon={<ArrowResetRegular />} onClick={onReset}>
            Zurücksetzen
          </Btn>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="muted small">Die Vorlage liest keine Werte.</p>
      ) : (
        <table className="samples__table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" title={r.key}>
                  <code>{r.key}</code>
                  {r.label ? <span className="muted small">{r.label}</span> : null}
                </th>
                <td>
                  <Input
                    size="small"
                    className={`input${r.overridden ? ' input--overridden' : ''}`}
                    aria-label={`Beispielwert ${r.key}`}
                    value={r.value}
                    onChange={(e) => onChange(r.key, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  )
}
