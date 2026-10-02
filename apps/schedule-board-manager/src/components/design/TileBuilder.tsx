import type { MouseEvent } from 'react'
import { Input, Tooltip } from '@fluentui/react-components'
import { AddRegular, ArrowDownRegular, ArrowUpRegular, DeleteRegular, DismissRegular, TextBoldRegular, TextTRegular } from '@fluentui/react-icons'
import { fieldLabel, type Segment, type TileModel } from '../../utils/tileModel'
import { useFieldLabels, type tileOps } from './tileOps'
import { Btn } from '../ui'

/**
 * Line editor for `{field}` templates. Each row is one line of the tile;
 * fields are chips with a readable name, text is a small input, bold is a
 * toggle per part. The palette appends fields to the active row.
 */
export function TileBuilder({
  model,
  state,
  readOnly,
  specials,
  baseEntity,
}: {
  model: TileModel
  state: ReturnType<typeof tileOps>
  readOnly: boolean
  specials: { path: string; label: string }[]
  /** Table the placeholder paths start from (booking, alert status). */
  baseEntity: string
}) {
  const { lines, active, setActive, setPending, commit } = state
  const labels = useFieldLabels(
    baseEntity,
    lines.flatMap((l) => l.segments.flatMap((s) => (s.kind === 'field' && !specials.some((x) => x.path === s.path) ? [s.path] : []))),
  )
  const setSegments = (i: number, segments: Segment[]) => commit(lines.map((l, j) => (j === i ? { segments } : l)))
  const move = (i: number, to: number) => {
    if (to < 0 || to >= lines.length) return
    const next = lines.slice()
    const [l] = next.splice(i, 1)
    next.splice(to, 0, l)
    commit(next)
    setActive(to)
  }

  return (
    <div className="tile-builder" aria-label="Zeilen der Kachel">
      {lines.map((line, i) => (
        <div key={i} className={`tile-line${i === active ? ' tile-line--active' : ''}`} onClick={() => setActive(i)} onFocus={() => setActive(i)}>
          <span className="tile-line__no" aria-hidden>
            {i + 1}
          </span>
          <div className="tile-line__parts">
            {line.segments.length === 0 ? (
              <span className="muted small">{readOnly ? 'Leere Zeile' : 'Leere Zeile — Feld aus der Liste wählen oder Text hinzufügen'}</span>
            ) : null}
            {line.segments.map((s, k) => (
              <SegmentView
                key={k}
                segment={s}
                index={k}
                line={i}
                readOnly={readOnly}
                specials={specials}
                labels={labels}
                onChange={(next) => setSegments(i, next === null ? line.segments.filter((_, x) => x !== k) : line.segments.map((x, y) => (y === k ? next : x)))}
              />
            ))}
          </div>
          {readOnly ? null : (
            <div className="tile-line__actions">
              <Btn
                small
                kind="ghost"
                icon={<TextTRegular />}
                aria-label={`Text in Zeile ${i + 1} hinzufügen`}
                title="Text hinzufügen"
                onClick={() => setSegments(i, [...line.segments, { kind: 'text', text: 'Text', bold: false }])}
              />
              <Btn small kind="ghost" icon={<ArrowUpRegular />} aria-label={`Zeile ${i + 1} nach oben`} disabled={i === 0} onClick={() => move(i, i - 1)} />
              <Btn
                small
                kind="ghost"
                icon={<ArrowDownRegular />}
                aria-label={`Zeile ${i + 1} nach unten`}
                disabled={i === lines.length - 1}
                onClick={() => move(i, i + 1)}
              />
              <Btn
                small
                kind="ghost"
                icon={<DeleteRegular />}
                aria-label={`Zeile ${i + 1} entfernen`}
                onClick={(e: MouseEvent) => {
                  e.stopPropagation()
                  commit(lines.filter((_, j) => j !== i))
                  setActive(Math.max(0, i - 1))
                }}
              />
            </div>
          )}
        </div>
      ))}
      {readOnly ? null : (
        <Btn
          small
          icon={<AddRegular />}
          disabled={lines.length > 0 && lines[lines.length - 1].segments.length === 0}
          onClick={() => {
            setPending(true)
            setActive(lines.length)
          }}
        >
          Zeile hinzufügen
        </Btn>
      )}
      {model.open && model.open !== '<div>' ? (
        <p className="muted small tile-builder__frame">
          Rahmen: <code>{model.open}</code> — im HTML-Modus änderbar.
        </p>
      ) : null}
    </div>
  )
}

function SegmentView({
  segment: s,
  index,
  line,
  readOnly,
  specials,
  labels,
  onChange,
}: {
  segment: Segment
  index: number
  line: number
  readOnly: boolean
  specials: { path: string; label: string }[]
  labels: Map<string, string>
  /** null removes the part. */
  onChange: (next: Segment | null) => void
}) {
  const boldToggle = readOnly ? null : (
    <button
      type="button"
      className={`tile-part__bold${s.bold ? ' is-on' : ''}`}
      aria-pressed={s.bold}
      aria-label={s.bold ? 'Nicht mehr fett' : 'Fett'}
      title={s.bold ? 'Nicht mehr fett' : 'Fett'}
      onClick={() => onChange({ ...s, bold: !s.bold })}
    >
      <TextBoldRegular />
    </button>
  )

  if (s.kind === 'field') {
    const label = labels.get(s.path) ?? fieldLabel(s.path, specials)
    return (
      <Tooltip content={`{${s.path}}`} relationship="description">
        <span className={`tile-part tile-part--field${s.bold ? ' tile-part--bold' : ''}`}>
          <span className="tile-part__label">{label}</span>
          {boldToggle}
          {readOnly ? null : (
            <button type="button" className="tile-part__remove" aria-label={`Feld ${label} entfernen`} title="Feld entfernen" onClick={() => onChange(null)}>
              <DismissRegular />
            </button>
          )}
        </span>
      </Tooltip>
    )
  }
  return (
    <span className={`tile-part tile-part--text${s.bold ? ' tile-part--bold' : ''}`}>
      <Input
        size="small"
        appearance="underline"
        className="tile-part__input"
        aria-label={`Text ${index + 1} in Zeile ${line + 1}`}
        readOnly={readOnly}
        value={s.text}
        // Width follows the text, so short labels like "🕝: " stay short.
        style={{ width: `${Math.max(4, [...s.text].length + 3)}ch` }}
        onChange={(e) => onChange(e.target.value === '' ? null : { ...s, text: e.target.value })}
      />
      {boldToggle}
    </span>
  )
}
