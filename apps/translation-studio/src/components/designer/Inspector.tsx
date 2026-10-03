import { useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUndoRegular, CheckmarkRegular, CursorClickRegular, InfoRegular, LightbulbRegular, LockClosedRegular, PanelRightContractRegular } from '@fluentui/react-icons'
import { cellId, type LabelRow, type Lcid } from '../../types/translation'
import { glossaryKey } from '../../utils/glossary'
import { languageLabel, languageName } from '../../utils/languages'
import { MAX_LABEL_LENGTH } from '../../utils/translationFile'
import { S } from '../../strings'
import { liveRow, liveState, useDesigner, useLiveState, type LabelRef, type Live } from './context'

/** The keyboard flow of the canvas, as a list of keys. */
export function KeyList() {
  return (
    <ul className="insp__keys">
      {S.designer.keys.map(([k, t]) => (
        <li key={k}>
          <kbd>{k}</kbd> {t}
        </li>
      ))}
    </ul>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="insp__close" title={S.designer.detailsHide} aria-label={S.designer.detailsHide} onClick={onClose}>
      <PanelRightContractRegular />
    </button>
  )
}

/**
 * The details panel: the selected label in every language, base text, one
 * editor per target language with glossary suggestion, "correct as is" and
 * undo. Without a selection it explains the keyboard flow. Can be closed
 * (the canvas then takes the width).
 */
export function Inspector({ labelRef, onClose }: { labelRef: LabelRef | null; onClose: () => void }) {
  const d = useDesigner()
  const live = useLiveState()
  if (!labelRef) {
    return (
      <aside className="insp insp--empty">
        <CloseButton onClose={onClose} />
        <CursorClickRegular className="insp__hero" aria-hidden />
        <strong>{S.designer.inspectorEmpty}</strong>
        <KeyList />
      </aside>
    )
  }
  // The current version of the selected row (by its key, so a repeated label never swaps in another row).
  const row = labelRef.row ? liveRow(live, d.pos, labelRef.row) : null
  const base = row ? (row.values[d.baseLanguage] ?? '') : (labelRef.fallback[d.baseLanguage] ?? '')

  return (
    <aside className="insp">
      <div className="insp__head">
        <CloseButton onClose={onClose} />
        <span className="insp__role">{labelRef.role}</span>
        <span className="insp__context">{labelRef.context}</span>
      </div>
      <div className="insp__base">
        <span className="insp__lang">{languageLabel(d.baseLanguage)}</span>
        <div className="insp__basetext">{base || <em className="muted">—</em>}</div>
      </div>
      {row ? (
        d.targets.map((l) => <LanguageEditor key={`${row.key}|${l}`} row={row} live={live} lcid={l} current={l === d.lcid} />)
      ) : (
        <>
          {d.targets.map((l) => (
            <div key={l} className="insp__field insp__field--ro">
              <span className="insp__lang">{languageLabel(l)}</span>
              <div className="insp__rotext">{labelRef.fallback[l] || <em className="muted">{S.designer.noText}</em>}</div>
            </div>
          ))}
          <p className="insp__note">
            <LockClosedRegular aria-hidden /> {S.designer.readOnlyText}
          </p>
        </>
      )}
      {labelRef.fromColumn ? (
        <p className="insp__note">
          <InfoRegular aria-hidden /> {S.designer.fromColumn}
        </p>
      ) : null}
      {row ? (
        <dl className="insp__meta">
          <dt>{S.designer.metaTable}</dt>
          <dd>{row.type || '—'}</dd>
          <dt>{S.designer.metaColumn}</dt>
          <dd className="mono">{row.column}</dd>
          <dt>{S.designer.metaId}</dt>
          <dd className="mono">{row.objectId}</dd>
        </dl>
      ) : null}
    </aside>
  )
}

function LanguageEditor({ row, live, lcid, current }: { row: LabelRow; live: Live; lcid: Lcid; current: boolean }) {
  const d = useDesigner()
  const value = row.values[lcid] ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  // Esc discards: the blur that follows must not commit the stale draft.
  const discard = useRef(false)
  const state = liveState(live, d.pos, row, lcid)
  const id = cellId(row.key, lcid)
  const suggestion = live.suggestions.get(id)
  const same = suggestion ? (live.sameBase.get(`${glossaryKey(row.values[d.baseLanguage] ?? '')}|${lcid}`) ?? 0) : 0
  const shown = draft ?? value
  const tooLong = shown.length > MAX_LABEL_LENGTH
  if (!state) {
    return (
      <div className="insp__field insp__field--ro">
        <span className="insp__lang">{languageName(lcid)}</span>
        <div className="insp__rotext muted">{S.designer.noColumn}</div>
      </div>
    )
  }

  const commit = () => {
    if (discard.current) {
      discard.current = false
      return
    }
    if (draft === null) return
    if (draft !== value && draft.length > MAX_LABEL_LENGTH) {
      // Refused: keep the text in the field so nothing typed is lost.
      d.onRefused(S.matrix.tooLong(MAX_LABEL_LENGTH))
      return
    }
    setDraft(null)
    if (draft === value) return
    if (draft.trim() === '') {
      if ((row.original[lcid] ?? '') !== '') d.onRefused(S.matrix.cannotClear)
      d.onRevert(row.key, lcid)
      return
    }
    d.onEdit(row.key, lcid, draft)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Take the text and stay in the field (blurring would drop keyboard users on the page body).
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      discard.current = true
      setDraft(null)
      e.currentTarget.blur()
    }
  }

  return (
    <div className={`insp__field insp__field--${state}${current ? ' insp__field--current' : ''}`}>
      <div className="insp__fieldhead">
        <span className="insp__lang">{languageName(lcid)}</span>
        <span className={`state state--${state} insp__state`}>{S.states[state]}</span>
      </div>
      <textarea
        className={`insp__input${tooLong ? ' insp__input--invalid' : ''}`}
        value={shown}
        rows={Math.min(5, Math.max(1, Math.ceil(shown.length / 34)))}
        readOnly={d.readOnly}
        placeholder={state === 'missing' ? S.designer.typeTranslation : undefined}
        aria-label={`${languageName(lcid)}: ${row.values[d.baseLanguage] ?? ''}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
      />
      {!d.readOnly ? (
        <div className="insp__actions">
          {suggestion && suggestion.value !== value ? (
            <>
              <button type="button" className="insp__chip insp__chip--suggest" title={S.matrix.suggestion(suggestion.value, suggestion.count)} onClick={() => d.onAccept(row, lcid, suggestion.value, false)}>
                <LightbulbRegular aria-hidden /> {suggestion.value}
              </button>
              {same > 1 ? (
                <button type="button" className="insp__chip" title={S.matrix.suggestionAll(same)} onClick={() => d.onAccept(row, lcid, suggestion.value, true)}>
                  {S.designer.acceptEverywhere(same)}
                </button>
              ) : null}
            </>
          ) : null}
          {state === 'untranslated' ? (
            <button type="button" className="insp__chip" title={S.matrix.acknowledge} onClick={() => d.onAcknowledge(row.key, lcid, true)}>
              <CheckmarkRegular aria-hidden /> {S.designer.acknowledgeShort}
            </button>
          ) : null}
          {state === 'changed' ? (
            <button type="button" className="insp__chip" onClick={() => d.onRevert(row.key, lcid)}>
              <ArrowUndoRegular aria-hidden /> {S.matrix.revert}
            </button>
          ) : null}
          {tooLong ? <span className="insp__warn">{S.matrix.tooLong(MAX_LABEL_LENGTH)}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
