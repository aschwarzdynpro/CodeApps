import { useState, type ReactNode } from 'react'
import { Input } from '@fluentui/react-components'
import type { Issue, Ref } from '../types/series'
import { formatDateWithDay, formatTime, isoWeek, isValidDate, isValidTime, parseTime } from '../utils/dates'
import { isBlocking, issueText } from '../utils/availability'
import { LookupPicker } from './LookupPicker'
import { Modal } from './Modal'
import { Btn } from './ui'

/** Status chips of an occurrence row; colors live in App.css. */
export type RowStatus =
  | 'new'
  | 'planned'
  | 'scheduled'
  | 'unscheduled'
  | 'inProgress'
  | 'completed'
  | 'skipped'
  | 'canceled'
  | 'deviates'
  | 'missing'
  | 'past'
  | 'orphan'

const STATUS_LABEL: Record<RowStatus, string> = {
  new: 'neu',
  planned: 'geplant',
  scheduled: 'gebucht',
  unscheduled: 'nicht gebucht',
  inProgress: 'in Arbeit',
  completed: 'erledigt',
  skipped: 'fällt aus',
  canceled: 'abgesagt',
  deviates: 'abweichend',
  missing: 'fehlt',
  past: 'vergangen',
  orphan: 'nicht im Muster',
}

const STATUS_HINT: Partial<Record<RowStatus, string>> = {
  deviates: 'Die Buchung wurde außerhalb der Serie geändert (z. B. auf dem Schedule Board). Serienänderungen lassen sie in Ruhe.',
  missing: 'Laut Muster geplant, aber noch kein Arbeitsauftrag — „Abgleichen“ legt ihn an.',
  orphan: 'Arbeitsauftrag der Serie, dessen Datum nicht (mehr) im Muster liegt — „Abgleichen“ sagt ihn ab.',
  canceled: 'Außerhalb der Serie abgesagt. Wird nicht neu angelegt, außer über „Wiederherstellen“.',
}

export function StatusChip({ status, moved }: { status: RowStatus; moved?: boolean }) {
  return (
    <span className={`status status--${status}`} title={STATUS_HINT[status]}>
      {STATUS_LABEL[status]}
      {moved ? ' · verschoben' : ''}
    </span>
  )
}

export function IssueList({ issues, muted }: { issues: Issue[]; muted?: boolean }) {
  if (issues.length === 0) return null
  return (
    <ul className="issues">
      {issues.map((i, n) => (
        <li key={n} className={`issue issue--${muted ? 'muted' : isBlocking(i) ? 'block' : 'warn'}`}>
          {issueText(i)}
        </li>
      ))}
    </ul>
  )
}

export function DateCell({ date, original }: { date: string; original?: string }) {
  return (
    <span className="datecell">
      <span className="datecell__date">{formatDateWithDay(date)}</span>
      <span className="datecell__week">KW {isoWeek(date)}</span>
      {original && original !== date ? <span className="datecell__orig">statt {formatDateWithDay(original)}</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

export interface MoveValue {
  date: string
  startTime: string
  durationMinutes: number
}

/** Move one occurrence; suggestions are free nearby days. */
export function MoveDialog({
  title,
  initial,
  suggestions,
  hint,
  onClose,
  onConfirm,
}: {
  title: string
  initial: MoveValue
  suggestions: string[]
  hint?: ReactNode
  onClose: () => void
  onConfirm: (value: MoveValue) => void
}) {
  const [date, setDate] = useState(initial.date)
  const [from, setFrom] = useState(initial.startTime)
  const [to, setTo] = useState(formatTime(parseTime(initial.startTime) + initial.durationMinutes))
  const duration = parseTime(to) - parseTime(from)
  const valid = isValidDate(date) && isValidTime(from) && isValidTime(to) && duration > 0
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Abbrechen</Btn>
          <Btn kind="primary" disabled={!valid} onClick={() => onConfirm({ date, startTime: from, durationMinutes: duration })}>
            Übernehmen
          </Btn>
        </>
      }
    >
      {hint ? <div className="small muted">{hint}</div> : null}
      {suggestions.length ? (
        <div className="form-row">
          <span>Freie Tage in der Nähe</span>
          <div className="chips">
            {suggestions.map((s) => (
              <Btn key={s} small kind={s === date ? 'primary' : 'default'} onClick={() => setDate(s)}>
                {formatDateWithDay(s)}
              </Btn>
            ))}
          </div>
        </div>
      ) : (
        <p className="small muted">Kein freier Tag innerhalb einer Woche gefunden — Datum frei wählen.</p>
      )}
      <div className="form-grid">
        <label className="form-row">
          <span>Datum</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="form-row">
          <span>Von</span>
          <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="form-row">
          <span>Bis</span>
          <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
    </Modal>
  )
}

export function ResourceDialog({ title, initial, onClose, onConfirm }: { title: string; initial: Ref | null; onClose: () => void; onConfirm: (r: Ref) => void }) {
  const [value, setValue] = useState<Ref | null>(initial)
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Abbrechen</Btn>
          <Btn kind="primary" disabled={!value} onClick={() => value && onConfirm(value)}>
            Übernehmen
          </Btn>
        </>
      }
    >
      <label className="form-row">
        <span>Ressource</span>
        <LookupPicker kind="resource" aria-label="Ressource" value={value} onChange={setValue} clearable={false} />
      </label>
    </Modal>
  )
}

export function ReasonDialog({
  title,
  message,
  initial,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string
  message: ReactNode
  initial: string
  confirmLabel: string
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState(initial)
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Abbrechen</Btn>
          <Btn kind="danger" disabled={reason.trim() === ''} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <div className="small">{message}</div>
      <label className="form-row">
        <span>Grund</span>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
    </Modal>
  )
}
