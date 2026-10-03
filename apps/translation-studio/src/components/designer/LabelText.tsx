import { useContext, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUndoRegular, CheckmarkRegular, LightbulbFilled } from '@fluentui/react-icons'
import { cellId } from '../../types/translation'
import { cellState } from '../../utils/gaps'
import { languageLabel } from '../../utils/languages'
import { MAX_LABEL_LENGTH } from '../../utils/translationFile'
import { S } from '../../strings'
import { refKey, useDesigner, type LabelRef } from './context'
import { CanvasNav, jumpToGap } from './nav'

interface LabelTextProps {
  labelRef: LabelRef
  /** The label is switched off where it sits (shown dimmed, still translatable). */
  hidden?: boolean
  className?: string
  /** Text when neither the file nor the fallback has one (e.g. a logical name). */
  empty?: string
  /** A second rendering of a label shown elsewhere on the canvas: editable, but not a stop for gap navigation. */
  echo?: boolean
}

/**
 * One label on a canvas. Click (or Enter/F2 on focus) selects it for the
 * inspector and opens the inline editor for the canvas language. Enter
 * takes the text, Tab takes it and jumps to the next gap (Shift+Tab: the
 * previous one), Esc discards, Ctrl+Enter marks a probably untranslated
 * label "correct as is" and moves on. Read-only labels (not in the file)
 * only select.
 */
export function LabelText({ labelRef, hidden, className, empty, echo }: LabelTextProps) {
  const d = useDesigner()
  const onExhausted = useContext(CanvasNav)
  const box = useRef<HTMLSpanElement>(null)
  const [draft, setDraft] = useState<string | null>(null)
  // Enter/Tab/Esc already decided; the blur of the input that follows must not commit again.
  const handled = useRef(false)
  const { row, fallback, fromColumn } = labelRef
  const key = refKey(labelRef)
  const selected = d.selectedKey === key
  const base = row ? (row.values[d.baseLanguage] ?? '') : (fallback[d.baseLanguage] ?? '')
  const value = row ? (row.values[d.lcid] ?? '') : (fallback[d.lcid] ?? '')
  const state = row ? cellState(row, d.lcid, d.baseLanguage, d.acknowledged) : 'na'
  const gap = state === 'missing' || state === 'untranslated'
  const navGap = gap && !echo ? '1' : undefined
  // Read-only text (sitemap, formxml) without a translation: marked, but not a gap to navigate to.
  const roGap = !row && !!fallback[d.baseLanguage] && !fallback[d.lcid]
  const editable = row !== null && !d.readOnly
  const suggestion = row ? d.suggestions.get(cellId(row.key, d.lcid)) : undefined

  const cls = [
    'lt',
    `lt--${state}`,
    fromColumn ? 'lt--column' : '',
    roGap ? 'lt--rogap' : '',
    hidden ? 'lt--off' : '',
    selected ? 'lt--selected' : '',
    d.focusGaps && !gap && state !== 'changed' ? 'lt--quiet' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  /** Takes the text; false (editor stays open) when it is refused. */
  const commit = (text: string): boolean => {
    if (row && text !== value && text.length > MAX_LABEL_LENGTH) {
      d.onRefused(S.matrix.tooLong(MAX_LABEL_LENGTH))
      return false
    }
    setDraft(null)
    if (!row || text === value) return true
    if (text.trim() === '') {
      if ((row.original[d.lcid] ?? '') !== '') d.onRefused(S.matrix.cannotClear)
      d.onRevert(row.key, d.lcid)
      return true
    }
    d.onEdit(row.key, d.lcid, text)
    return true
  }

  // Closing the editor removes the focused input; keep the focus on the label so keys keep working.
  const refocus = () => window.requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-open]')?.focus())

  /** "Correct as is" for a label identical to the base text, then on to the next gap. */
  const acknowledge = () => {
    if (!row) return
    const from = box.current
    handled.current = true
    setDraft(null)
    d.onAcknowledge(row.key, d.lcid, true)
    window.requestAnimationFrame(() => {
      if (!jumpToGap(from, 1, null, onExhausted)) refocus()
    })
  }

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && state === 'untranslated' && e.currentTarget.value === value) {
      e.preventDefault()
      acknowledge()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handled.current = true
      setDraft(null)
      refocus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handled.current = true
      if (commit(e.currentTarget.value)) refocus()
      else handled.current = false
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const from = box.current
      const dir = e.shiftKey ? -1 : 1
      handled.current = true
      if (commit(e.currentTarget.value)) {
        window.requestAnimationFrame(() => {
          if (!jumpToGap(from, dir, null, onExhausted)) refocus()
        })
      } else handled.current = false
    }
  }

  const open = () => {
    d.select(labelRef)
    handled.current = false
    if (editable) setDraft(value)
  }

  const title = [
    `${languageLabel(d.baseLanguage)}: ${base || '—'}`,
    labelRef.role,
    fromColumn ? S.designer.fromColumn : '',
    row ? '' : S.designer.readOnlyText,
    hidden ? S.designer.labelOff : '',
  ]
    .filter(Boolean)
    .join('\n')

  if (draft !== null) {
    return (
      <span ref={box} className={`${cls} lt--editing`} data-label="1" data-gap={navGap}>
        <input
          className="lt__input"
          value={draft}
          // The input replaces the text the user just clicked.
          autoFocus
          size={Math.max(6, Math.min(56, draft.length + 2))}
          aria-label={`${labelRef.role}: ${base} (${languageLabel(d.lcid)})`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => {
            if (handled.current) handled.current = false
            else commit(e.currentTarget.value)
          }}
          onKeyDown={onInputKey}
        />
        {state === 'untranslated' && draft === value ? (
          <button
            type="button"
            className="lt__ack"
            title={`${S.matrix.acknowledge} · ${S.designer.ackKey}`}
            aria-label={S.matrix.acknowledge}
            // Keep the input focused: its blur would commit before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={acknowledge}
          >
            <CheckmarkRegular />
          </button>
        ) : null}
      </span>
    )
  }

  const shown = value || base || empty || ''
  return (
    <span ref={box} className={cls} title={title} data-label="1" data-gap={navGap}>
      <span
        className="lt__text"
        role="button"
        tabIndex={0}
        data-open="1"
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'F2') {
            e.preventDefault()
            open()
          }
        }}
      >
        {value ? value : <em className="lt__placeholder">{shown || '—'}</em>}
      </span>
      {state === 'changed' && !d.readOnly && row ? (
        <button type="button" className="lt__revert" title={S.matrix.revert} aria-label={S.matrix.revert} onClick={() => d.onRevert(row.key, d.lcid)}>
          <ArrowUndoRegular />
        </button>
      ) : null}
      {gap && editable && suggestion ? (
        <button
          type="button"
          className="lt__suggest"
          title={S.designer.takeSuggestion(suggestion.value)}
          aria-label={S.designer.takeSuggestion(suggestion.value)}
          onClick={() => d.onAccept(row, d.lcid, suggestion.value, false)}
        >
          <LightbulbFilled />
        </button>
      ) : null}
      {d.showBase && value && value !== base ? <span className="lt__base">{base}</span> : null}
    </span>
  )
}
