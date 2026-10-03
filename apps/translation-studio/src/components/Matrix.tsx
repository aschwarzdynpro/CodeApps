import { memo, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ArrowUndoRegular, CheckmarkRegular, LightbulbRegular } from '@fluentui/react-icons'
import { cellId, type ComponentInfo, type Lcid, type LabelRow } from '../types/translation'
import type { GapRow } from '../utils/gaps'
import type { Suggestion } from '../utils/glossary'
import { glossaryKey } from '../utils/glossary'
import { languageLabel } from '../utils/languages'
import { MAX_LABEL_LENGTH } from '../utils/translationFile'
import { S } from '../strings'

/**
 * The gap matrix: one row per label, the base language read-only, one
 * editable cell per target language. Own windowing (fixed row height, only
 * the visible rows plus some overscan are rendered) — tens of thousands of
 * labels without a grid library.
 */

export const ROW_HEIGHT = 46
const HEADER_HEIGHT = 38
const OVERSCAN = 8
/** Fixed tracks: every row is its own grid, so content must not size the columns. */
const FIXED = [130, 220, 170, 260]
const MIN_LANG = 260

export interface MatrixActions {
  onEdit: (rowKey: string, lcid: Lcid, value: string) => void
  onRevert: (rowKey: string, lcid: Lcid) => void
  /** `all`: every gap with the same base text in this language. */
  onAccept: (row: LabelRow, lcid: Lcid, value: string, all: boolean) => void
  onAcknowledge: (rowKey: string, lcid: Lcid, on: boolean) => void
  /** A blocked edit (too long, clearing) — shown as a toast. */
  onRefused: (message: string) => void
}

interface MatrixProps extends MatrixActions {
  rows: GapRow[]
  baseLanguage: Lcid
  languages: Lcid[]
  components: ReadonlyMap<string, ComponentInfo>
  suggestions: ReadonlyMap<string, Suggestion>
  /** Number of open gaps per `glossaryKey(base)|lcid` (for "accept for all"). */
  sameBase: ReadonlyMap<string, number>
  acknowledged: ReadonlySet<string>
  readOnly: boolean
}

export function Matrix(props: MatrixProps) {
  const { rows, languages, baseLanguage } = props
  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 600, width: 1200 })

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() =>
      setView((v) => (v.height === el.clientHeight && v.width === el.clientWidth ? v : { ...v, height: el.clientHeight, width: el.clientWidth })),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const first = Math.max(0, Math.floor(view.top / ROW_HEIGHT) - OVERSCAN)
  const last = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_HEIGHT) + OVERSCAN)
  const fixed = FIXED.reduce((a, b) => a + b, 0)
  const lang = Math.max(MIN_LANG, Math.floor((view.width - fixed) / Math.max(1, languages.length)))
  const style = {
    '--matrix-cols': `${FIXED.map((w) => `${w}px`).join(' ')} repeat(${languages.length}, ${lang}px)`,
    '--matrix-width': `${fixed + lang * languages.length}px`,
  } as CSSProperties

  return (
    <div
      className="matrix"
      ref={scroller}
      style={style}
      role="grid"
      aria-rowcount={rows.length + 1}
      onScroll={(e) => {
        // Read now: the event's currentTarget is gone by the time the updater runs.
        const top = e.currentTarget.scrollTop
        setView((v) => ({ ...v, top }))
      }}
    >
      <div className="matrix__head" role="row" style={{ height: HEADER_HEIGHT }}>
        <div role="columnheader">{S.matrix.type}</div>
        <div role="columnheader">{S.matrix.component}</div>
        <div role="columnheader">{S.matrix.column}</div>
        <div role="columnheader">{S.matrix.base(languageLabel(baseLanguage))}</div>
        {languages.map((l) => (
          <div role="columnheader" key={l}>
            {languageLabel(l)}
          </div>
        ))}
      </div>
      <div className="matrix__body" style={{ height: rows.length * ROW_HEIGHT }}>
        {rows.slice(first, last).map((g, i) => (
          <MatrixRow key={g.row.key} gap={g} index={first + i} {...props} />
        ))}
      </div>
      {rows.length === 0 ? <div className="empty">{S.matrix.empty}</div> : null}
    </div>
  )
}

type RowProps = MatrixProps & { gap: GapRow; index: number }

const MatrixRow = memo(function MatrixRow({ gap, index, baseLanguage, languages, components, ...rest }: RowProps) {
  const { row } = gap
  const c = components.get(row.objectId)
  const component = c ? [c.table, c.name && c.name !== c.table ? c.name : ''].filter(Boolean).join(' · ') : row.objectId ? `${row.objectId.slice(0, 8)}…` : row.sheet
  return (
    <div className="matrix__row" role="row" aria-rowindex={index + 2} style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}>
      <div className="mcol mcol--type" title={row.type || row.sheet}>
        <span>{S.kinds[row.kind]}</span>
        <span className="muted small">{row.type || row.sheet}</span>
      </div>
      <div className="mcol" title={row.objectId ? `${component}\n${row.objectId}` : component}>
        {component}
      </div>
      <div className="mcol mcol--mono" title={row.column}>
        {row.column}
      </div>
      <div className="mcol mcol--base" title={row.values[baseLanguage]}>
        {row.values[baseLanguage]}
      </div>
      {languages.map((l) => (
        <MatrixCell key={l} row={row} lcid={l} baseLanguage={baseLanguage} state={gap.states[l]} {...rest} />
      ))}
    </div>
  )
})

type CellProps = Omit<MatrixProps, 'rows' | 'languages' | 'components'> & {
  row: LabelRow
  lcid: Lcid
  state: GapRow['states'][number] | undefined
}

function MatrixCell({ row, lcid, baseLanguage, state, suggestions, sameBase, acknowledged, readOnly, onEdit, onRevert, onAccept, onAcknowledge, onRefused }: CellProps) {
  const value = row.values[lcid] ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  if (state === undefined) return <div className="mcell mcell--na" />

  const id = cellId(row.key, lcid)
  const suggestion = suggestions.get(id)
  const same = suggestion ? (sameBase.get(`${glossaryKey(row.values[baseLanguage] ?? '')}|${lcid}`) ?? 0) : 0
  const acked = acknowledged.has(id)
  const shown = draft ?? value
  const tooLong = shown.length > MAX_LABEL_LENGTH

  const commit = () => {
    if (draft === null) return
    setDraft(null)
    if (draft === value) return
    if (draft.length > MAX_LABEL_LENGTH) {
      onRefused(S.matrix.tooLong(MAX_LABEL_LENGTH))
      return
    }
    if (draft.trim() === '') {
      if ((row.original[lcid] ?? '') !== '') onRefused(S.matrix.cannotClear)
      onRevert(row.key, lcid)
      return
    }
    onEdit(row.key, lcid, draft)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    else if (e.key === 'Escape') {
      setDraft(null)
      e.currentTarget.blur()
    }
  }

  return (
    <div className={`mcell mcell--${state}${tooLong ? ' mcell--invalid' : ''}`} title={tooLong ? S.matrix.tooLong(MAX_LABEL_LENGTH) : shown}>
      {readOnly ? (
        <span className="mcell__text">{value}</span>
      ) : (
        <input
          className="mcell__input"
          value={shown}
          aria-label={`${row.column} ${lcid}`}
          placeholder={state === 'missing' ? S.states.missing : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
        />
      )}
      {!readOnly ? (
        <span className="mcell__actions">
          {suggestion ? (
            <>
              <button type="button" className="mchip mchip--suggest" title={S.matrix.suggestion(suggestion.value, suggestion.count)} onClick={() => onAccept(row, lcid, suggestion.value, false)}>
                <LightbulbRegular aria-hidden />
                <span className="mchip__text">{suggestion.value}</span>
              </button>
              {same > 1 ? (
                <button type="button" className="mchip" title={S.matrix.suggestionAll(same)} onClick={() => onAccept(row, lcid, suggestion.value, true)}>
                  ×{same}
                </button>
              ) : null}
            </>
          ) : null}
          {state === 'untranslated' ? (
            <button type="button" className="micon" title={S.matrix.acknowledge} aria-label={S.matrix.acknowledge} onClick={() => onAcknowledge(row.key, lcid, true)}>
              <CheckmarkRegular />
            </button>
          ) : null}
          {acked && state === 'ok' ? (
            <button type="button" className="micon micon--acked" title={S.matrix.unacknowledge} aria-label={S.matrix.unacknowledge} onClick={() => onAcknowledge(row.key, lcid, false)}>
              <CheckmarkRegular />
            </button>
          ) : null}
          {state === 'changed' ? (
            <button type="button" className="micon" title={S.matrix.revert} aria-label={S.matrix.revert} onClick={() => onRevert(row.key, lcid)}>
              <ArrowUndoRegular />
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
