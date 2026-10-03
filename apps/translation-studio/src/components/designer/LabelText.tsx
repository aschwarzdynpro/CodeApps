import { memo, useContext, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUndoRegular, CheckmarkRegular, LightbulbFilled } from '@fluentui/react-icons'
import { cellId, type Lcid } from '../../types/translation'
import { languageLabel } from '../../utils/languages'
import { MAX_LABEL_LENGTH } from '../../utils/translationFile'
import { S } from '../../strings'
import { refKey, useDesigner, useLiveValue, type LabelRef } from './context'
import { CanvasNav, findGap, jumpToGap, markCurrent, openLabel } from './nav'

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

const SEP = '\u0001'

/**
 * One label on a canvas. Click (or Enter/F2/Space on focus) selects it for
 * the details panel and opens the inline editor for the canvas language.
 * Enter takes the text, Tab takes it and jumps to the next gap (Shift+Tab:
 * the previous one), Esc discards, Ctrl+Enter marks a probably untranslated
 * label "correct as is" and moves on. Read-only labels (not in the file)
 * only select.
 *
 * Subscribes to its own text, state, suggestion and selection only, so an
 * edit re-renders the labels it touches, not the whole canvas.
 */
export const LabelText = memo(function LabelText({ labelRef, hidden, className, empty, echo }: LabelTextProps) {
  const d = useDesigner()
  const onExhausted = useContext(CanvasNav)
  const box = useRef<HTMLSpanElement>(null)
  const input = useRef<HTMLInputElement>(null)
  // The draft belongs to one language: switching the canvas language leaves it behind unsaved.
  const [draftState, setDraftState] = useState<{ lcid: Lcid; text: string } | null>(null)
  // Enter/Tab/Esc already decided; the blur of the input that follows must not commit again.
  const handled = useRef(false)
  const { row, fallback, fromColumn } = labelRef
  const key = refKey(labelRef)

  const sig = useLiveValue((live) => {
    const sel = live.selectedKey === key ? '1' : ''
    if (!row) return sel
    const i = d.pos.get(row.key)
    if (i === undefined) return sel
    const g = live.gaps[i]
    const suggestion = d.readOnly ? undefined : live.suggestions.get(cellId(row.key, d.lcid))
    return [sel, g.row.values[d.lcid] ?? '', g.states[d.lcid] ?? 'na', suggestion?.value ?? ''].join(SEP)
  })
  const [sel, liveValue = '', liveState = 'na', suggestion = ''] = sig.split(SEP)
  const selected = sel === '1'
  const base = row ? (row.values[d.baseLanguage] ?? '') : (fallback[d.baseLanguage] ?? '')
  const value = row ? liveValue : (fallback[d.lcid] ?? '')
  const state = row ? liveState : 'na'
  const gap = state === 'missing' || state === 'untranslated'
  const navGap = gap && !echo ? '1' : undefined
  // Read-only text (sitemap, formxml) without a translation: marked, but not a gap to navigate to.
  const roGap = !row && !!fallback[d.baseLanguage] && !fallback[d.lcid]
  const editable = row !== null && !d.readOnly && state !== 'na'
  const draft = draftState && draftState.lcid === d.lcid ? draftState.text : null
  const setDraft = (text: string | null) => setDraftState(text === null ? null : { lcid: d.lcid, text })

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

  // Closing the editor removes the focused input; keep the focus on the label so keys keep working —
  // unless the focus has moved on in the meantime (F8 right after Esc opened the next label).
  const refocus = () =>
    window.requestAnimationFrame(() => {
      const el = document.activeElement
      if (el && el !== document.body && !box.current?.contains(el)) return
      box.current?.querySelector<HTMLElement>('[data-open]')?.focus()
    })

  /** "Correct as is" for a label identical to the base text, then on to the next gap. */
  const acknowledge = () => {
    if (!row) return
    const from = box.current
    const canvas = from?.closest('[data-canvas]') ?? null
    // Decide where to go first: with "Nur offene" the label leaves the canvas once it is acknowledged.
    const next = canvas && from ? findGap(canvas, from, 1, false) : null
    handled.current = true
    setDraft(null)
    d.onAcknowledge(row.key, d.lcid, true)
    window.requestAnimationFrame(() => {
      if (next?.isConnected) openLabel(next)
      else if (!jumpToGap(from?.isConnected ? from : null, 1, canvas, onExhausted)) refocus()
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
    markCurrent(box.current)
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
      <span ref={box} className={`${cls} lt--editing`} data-label="1" data-gap={navGap} data-echo={echo ? '1' : undefined}>
        <input
          ref={input}
          className="lt__input"
          value={draft}
          // The input replaces the text the user just clicked.
          autoFocus
          size={Math.max(6, Math.min(56, draft.length + 2))}
          aria-label={`${labelRef.role}: ${base} (${languageLabel(d.lcid)})`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => {
            if (handled.current) handled.current = false
            // Refused (too long): stay in the field so the text isn't lost unnoticed.
            else if (!commit(e.currentTarget.value)) window.requestAnimationFrame(() => input.current?.focus())
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
  const stateWord = state === 'missing' || state === 'untranslated' || state === 'changed' ? S.states[state] : ''
  return (
    <span ref={box} className={cls} title={title} data-label="1" data-gap={navGap} data-echo={echo ? '1' : undefined}>
      <span
        className="lt__text"
        role="button"
        tabIndex={0}
        data-open="1"
        aria-label={[shown || '—', labelRef.role, stateWord].filter(Boolean).join(' · ')}
        aria-pressed={selected}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'F2' || e.key === ' ') {
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
          title={S.designer.takeSuggestion(suggestion)}
          aria-label={S.designer.takeSuggestion(suggestion)}
          onClick={() => d.onAccept(row, d.lcid, suggestion, false)}
        >
          <LightbulbFilled />
        </button>
      ) : null}
      {d.showBase && value && value !== base ? <span className="lt__base">{base}</span> : null}
    </span>
  )
})
