import { Badge, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, MessageBar, MessageBarBody, Radio, RadioGroup, Switch, Tab, TabList, Textarea } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { useActionState, useState } from 'react'
import { S } from '../../strings'
import type { CalendarTree, Closure, DayResolution, RuleBlock, Weekday } from '../../types/calendar'
import { WEEKDAY_SHORT, formatDate, formatDateWithDay, formatDuration } from '../../utils/dates'
import { spanLabel } from '../../utils/format'
import { daySpecFromBlock, emptyAbsenceSpec, emptyWorkSpec, specFromBlock, splitAtMidnight, validateSpec, type AbsenceSpec, type EditIntent, type EditTarget, type EventSpec, type WorkHoursSpec } from '../../utils/intents'
import { previewIntent } from '../../utils/preview'
import { describeBlock, groupBlocks } from '../../utils/rules'
import { timeZoneLabel } from '../../utils/timezones'
import { Btn } from '../ui'
import { DateField, DaysField, EffortField, SegmentsEditor, TimeField, TimeZoneField, WeekdayPicker } from './editorParts'

/** What opens the editor. */
export type EditorRequest =
  | { op: 'create'; kind: 'work' | 'timeoff' | 'nonwork'; date: string }
  | { op: 'edit'; block: RuleBlock }
  | { op: 'editDay'; block: RuleBlock; date: string }
  | { op: 'end'; block: RuleBlock }
  | { op: 'delete'; block: RuleBlock }

interface Props {
  request: EditorRequest
  targetName: string
  target: EditTarget
  tree: CalendarTree
  closures: Closure[]
  viewerTz: string
  today: string
  onSave: (intent: EditIntent) => Promise<void>
  onClose: () => void
}

type RecurrenceMode = 'once' | 'weekly' | 'varied'

function initialSpec(req: EditorRequest, tree: CalendarTree): EventSpec {
  switch (req.op) {
    case 'create':
      return req.kind === 'work' ? emptyWorkSpec(req.date) : emptyAbsenceSpec(req.date, req.kind)
    case 'edit':
    case 'end':
    case 'delete':
      return specFromBlock(req.block, tree.blocks)
    case 'editDay':
      return daySpecFromBlock(req.block, req.date)
  }
}

const summary = (d: DayResolution): string => {
  const work = d.segments.filter((s) => s.kind === 'work')
  if (work.length === 0) return d.reason !== 'none' ? S.reasons[d.reason] : S.calendar.noWork
  return `${work.map(spanLabel).join(', ')} · ${formatDuration(d.workMinutes)}`
}

export function RuleEditorDialog({ request, targetName, target, tree, closures, viewerTz, today, onSave, onClose }: Props) {
  const [spec, setSpec] = useState<EventSpec>(() => initialSpec(request, tree))
  const [recurrenceMode, setRecurrenceMode] = useState<RecurrenceMode>(() => (spec.kind === 'work' ? (spec.varied ? 'varied' : spec.recurrence ? 'weekly' : 'once') : 'once'))
  const [split, setSplit] = useState(false)
  const [splitDate, setSplitDate] = useState(today)
  const [lastDay, setLastDay] = useState(() => (request.op === 'end' ? (request.block.end ?? today) : today))
  const [timeZoneCode, setTimeZoneCode] = useState(target.timeZoneCode)
  const [tab, setTab] = useState<'form' | 'preview'>(request.op === 'delete' || request.op === 'end' ? 'preview' : 'form')
  const [showUnchanged, setShowUnchanged] = useState(false)
  const [variedDay, setVariedDay] = useState<Weekday>(1)

  const block = 'block' in request ? request.block : null
  const group = block ? (groupBlocks(tree.blocks).find((g) => g.includes(block)) ?? [block]) : []
  const effectiveTarget: EditTarget = { ...target, timeZoneCode }

  const intent: EditIntent = (() => {
    switch (request.op) {
      case 'create':
        return { op: 'create', target: effectiveTarget, spec }
      case 'edit':
        return { op: 'edit', target: effectiveTarget, block: request.block, spec: split && spec.kind === 'work' ? { ...spec, date: splitDate } : spec, split: split && spec.kind === 'work', group }
      case 'editDay':
        return { op: 'editDay', target: effectiveTarget, block: request.block, spec: spec as WorkHoursSpec }
      case 'end':
        return { op: 'end', target: effectiveTarget, block: request.block, lastDay }
      case 'delete':
        return { op: 'delete', target: effectiveTarget, block: request.block }
    }
  })()

  const errors = request.op === 'delete' || request.op === 'end' ? [] : validateSpec(intent.op === 'edit' || intent.op === 'create' || intent.op === 'editDay' ? intent.spec : spec)
  const preview = tab === 'preview' ? previewIntent(tree, intent, { closures, viewerTz, useV2: target.useV2, today }) : null

  const [result, submit, pending] = useActionState<{ error: string | null }, EditIntent>(
    async (_prev, next) => {
      try {
        await onSave(next)
        onClose()
        return { error: null }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
    { error: null },
  )

  const title =
    request.op === 'create' ? (request.kind === 'work' ? S.editor.titleCreate : S.editor.titleCreateAbsence) : request.op === 'edit' ? S.editor.titleEdit : request.op === 'editDay' ? S.editor.titleEditDay(formatDate(request.date)) : request.op === 'end' ? S.editor.titleEnd : S.editor.titleDelete

  const work = spec.kind === 'work' ? spec : null
  const absence = spec.kind !== 'work' ? spec : null
  const setWork = (patch: Partial<WorkHoursSpec>) => work && setSpec({ ...work, ...patch })
  const setAbsence = (patch: Partial<AbsenceSpec>) => absence && setSpec({ ...absence, ...patch })
  const nightShift = work && !work.allDay && (work.varied ? Object.values(work.varied).some((s) => s && splitAtMidnight(s).tomorrow.length) : splitAtMidnight(work.segments).tomorrow.length > 0)
  const canChangeRecurrence = request.op === 'create' || request.op === 'edit'

  const changeRecurrence = (mode: RecurrenceMode) => {
    if (!work) return
    setRecurrenceMode(mode)
    if (mode === 'once') setWork({ recurrence: null, varied: null })
    else if (mode === 'weekly') setWork({ recurrence: work.recurrence ?? { weekdays: [1, 2, 3, 4, 5], endDate: null }, varied: null, allDay: false })
    else {
      const days = work.recurrence?.weekdays.length ? work.recurrence.weekdays : ([1, 2, 3, 4, 5] as Weekday[])
      setWork({ recurrence: { weekdays: days, endDate: work.recurrence?.endDate ?? null }, varied: Object.fromEntries(days.map((d) => [d, work.segments])), allDay: false })
      setVariedDay(days[0])
    }
  }

  const changeVariedDays = (days: Weekday[]) => {
    if (!work?.varied) return
    const varied: NonNullable<WorkHoursSpec['varied']> = {}
    for (const d of days) varied[d] = work.varied[d] ?? work.segments
    setWork({ recurrence: { weekdays: days, endDate: work.recurrence?.endDate ?? null }, varied })
    if (!days.includes(variedDay) && days.length) setVariedDay(days[0])
  }

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && !pending && onClose()}>
      <DialogSurface className="editor" aria-label={title}>
        <DialogBody>
          <DialogTitle action={<Btn kind="ghost" aria-label={S.editor.cancel} icon={<DismissRegular />} onClick={onClose} disabled={pending} />}>
            {title}
            <div className="editor__sub muted small">
              {targetName} · {timeZoneLabel(target.timeZoneCode)}
              {block ? ` · ${describeBlock(block)}` : ''}
            </div>
          </DialogTitle>
          <DialogContent className="editor__body">
            {request.op !== 'delete' ? (
              <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as 'form' | 'preview')}>
                <Tab value="form">{S.editor.tabs.form}</Tab>
                <Tab value="preview">
                  {S.editor.tabs.preview}
                  {preview && preview.changedCount > 0 ? <Badge size="small" appearance="tint" className="ml-6">{preview.changedCount}</Badge> : null}
                </Tab>
              </TabList>
            ) : null}

            {request.op === 'delete' ? (
              <>
                <MessageBar intent="warning" layout="multiline">
                  <MessageBarBody>{S.editor.confirmDelete(block ? describeBlock(block) : '')}</MessageBarBody>
                </MessageBar>
                {block?.groupId ? (
                  <MessageBar intent="info" layout="multiline">
                    <MessageBarBody>{S.editor.hints.varied}</MessageBarBody>
                  </MessageBar>
                ) : null}
                <MessageBar intent="info" layout="multiline">
                  <MessageBarBody>{S.editor.hints.noSingleDelete}</MessageBarBody>
                </MessageBar>
              </>
            ) : null}

            {tab === 'form' && request.op === 'end' ? (
              <Field label={S.editor.lastDay} required>
                <DateField value={lastDay} onChange={(d) => d && setLastDay(d)} ariaLabel={S.editor.lastDay} minDate={block?.start} />
              </Field>
            ) : null}

            {tab === 'form' && (request.op === 'create' || request.op === 'edit' || request.op === 'editDay') ? (
              <div className="editor__form">
                {request.op === 'edit' && work?.recurrence && block?.weekdays ? (
                  <Field label={S.editor.scope}>
                    <RadioGroup layout="horizontal" value={split ? 'following' : 'series'} onChange={(_, d) => setSplit(d.value === 'following')}>
                      <Radio value="series" label={S.editor.scopes.series} />
                      <Radio value="following" label={S.editor.scopes.following} />
                    </RadioGroup>
                    {split ? <DateField value={splitDate} onChange={(d) => d && setSplitDate(d)} ariaLabel={S.editor.scopes.following} minDate={block.start} /> : null}
                  </Field>
                ) : null}

                {work ? (
                  <>
                    {canChangeRecurrence ? (
                      <Field label={S.editor.recurrence}>
                        <RadioGroup layout="horizontal" value={recurrenceMode} onChange={(_, d) => changeRecurrence(d.value as RecurrenceMode)}>
                          <Radio value="once" label={S.editor.recurrences.once} />
                          <Radio value="weekly" label={S.editor.recurrences.weekly} />
                          <Radio value="varied" label={S.editor.recurrences.varied} />
                        </RadioGroup>
                      </Field>
                    ) : null}
                    <div className="editor__row">
                      <Field label={work.recurrence ? S.editor.startDate : S.editor.date} required>
                        <DateField value={work.date} onChange={(d) => d && setWork({ date: d })} ariaLabel={S.editor.date} />
                      </Field>
                      {work.recurrence ? (
                        <Field label={S.editor.endDate} hint={work.recurrence.endDate ? undefined : S.editor.noEnd}>
                          <DateField value={work.recurrence.endDate} allowEmpty onChange={(d) => setWork({ recurrence: { ...work.recurrence!, endDate: d } })} ariaLabel={S.editor.endDate} minDate={work.date} placeholder={S.editor.noEnd} />
                        </Field>
                      ) : null}
                    </div>
                    {work.recurrence ? (
                      <Field label={S.editor.weekdays} required>
                        <WeekdayPicker value={work.recurrence.weekdays} onChange={(days) => (work.varied ? changeVariedDays(days) : setWork({ recurrence: { ...work.recurrence!, weekdays: days } }))} />
                      </Field>
                    ) : null}
                    {!work.recurrence ? (
                      <div className="editor__row">
                        <Switch label={S.editor.allDay} checked={work.allDay} onChange={(_, d) => setWork({ allDay: d.checked })} />
                        {work.allDay ? (
                          <Field label={S.editor.days}>
                            <DaysField value={work.days} onChange={(days) => setWork({ days })} />
                          </Field>
                        ) : null}
                      </div>
                    ) : null}
                    {!work.allDay ? (
                      <Field label={S.editor.times} required>
                        {work.varied ? (
                          <>
                            <TabList size="small" selectedValue={variedDay} onTabSelect={(_, d) => setVariedDay(d.value as Weekday)}>
                              {(work.recurrence?.weekdays ?? []).map((d) => (
                                <Tab key={d} value={d}>
                                  {WEEKDAY_SHORT[d - 1]}
                                </Tab>
                              ))}
                            </TabList>
                            <SegmentsEditor segments={work.varied[variedDay] ?? []} onChange={(segments) => setWork({ varied: { ...work.varied, [variedDay]: segments } })} />
                          </>
                        ) : (
                          <SegmentsEditor segments={work.segments} onChange={(segments) => setWork({ segments })} />
                        )}
                      </Field>
                    ) : null}
                    <div className="editor__row">
                      <Field label={S.editor.effort}>
                        <EffortField value={work.effort} onChange={(effort) => setWork({ effort })} />
                      </Field>
                      {work.recurrence ? <Switch label={S.editor.observeClosure} checked={work.observeClosure} onChange={(_, d) => setWork({ observeClosure: d.checked })} /> : null}
                    </div>
                  </>
                ) : null}

                {absence ? (
                  <>
                    <Field label={S.editor.kind}>
                      <RadioGroup layout="horizontal" value={absence.kind} onChange={(_, d) => setAbsence({ kind: d.value as AbsenceSpec['kind'] })} disabled={request.op !== 'create'}>
                        <Radio value="timeoff" label={S.editor.kinds.timeoff} />
                        <Radio value="nonwork" label={S.editor.kinds.nonwork} />
                      </RadioGroup>
                    </Field>
                    <div className="editor__row">
                      <Field label={S.editor.date} required>
                        <DateField value={absence.date} onChange={(d) => d && setAbsence({ date: d })} ariaLabel={S.editor.date} />
                      </Field>
                      <Switch label={S.editor.allDay} checked={absence.allDay} onChange={(_, d) => setAbsence({ allDay: d.checked })} />
                      {absence.allDay ? (
                        <Field label={S.editor.days}>
                          <DaysField value={absence.days} onChange={(days) => setAbsence({ days })} />
                        </Field>
                      ) : (
                        <>
                          <Field label={S.editor.from}>
                            <TimeField value={absence.start} onChange={(start) => setAbsence({ start })} ariaLabel={S.editor.from} />
                          </Field>
                          <Field label={S.editor.to}>
                            <TimeField value={absence.end} onChange={(end) => setAbsence({ end })} ariaLabel={S.editor.to} />
                          </Field>
                        </>
                      )}
                    </div>
                    {absence.kind === 'timeoff' ? (
                      <Field label={S.editor.reason}>
                        <Textarea size="small" resize="vertical" value={absence.reason} placeholder={S.editor.reasonPlaceholder} onChange={(_, d) => setAbsence({ reason: d.value })} />
                      </Field>
                    ) : null}
                    <MessageBar intent="info" layout="multiline">
                      <MessageBarBody>{S.editor.hints.noAbsenceRecurrence}</MessageBarBody>
                    </MessageBar>
                  </>
                ) : null}

                <Field label={S.editor.timeZone} hint={timeZoneCode !== target.timeZoneCode ? S.rules.zoneMismatch(timeZoneLabel(timeZoneCode), timeZoneLabel(target.timeZoneCode)) : undefined}>
                  <TimeZoneField value={timeZoneCode} onChange={setTimeZoneCode} />
                </Field>

                {nightShift ? (
                  <MessageBar intent="info" layout="multiline">
                    <MessageBarBody>{S.editor.hints.nightShift}</MessageBarBody>
                  </MessageBar>
                ) : null}
                {work?.varied ? (
                  <MessageBar intent="info" layout="multiline">
                    <MessageBarBody>{S.editor.hints.varied}</MessageBarBody>
                  </MessageBar>
                ) : null}
                {errors.length ? (
                  <MessageBar intent="error" layout="multiline">
                    <MessageBarBody>{errors.join(' ')}</MessageBarBody>
                  </MessageBar>
                ) : null}
              </div>
            ) : null}

            {preview ? (
              <div className="preview">
                {preview.error ? (
                  <MessageBar intent="error" layout="multiline">
                    <MessageBarBody>
                      {S.editor.preview.error}: {preview.error}
                    </MessageBarBody>
                  </MessageBar>
                ) : (
                  <>
                    <p className="muted small">{S.editor.preview.intro}</p>
                    <div className="preview__head">
                      <strong>{S.editor.preview.title}</strong>
                      <span className="muted small">{preview.changedCount ? S.editor.preview.changed(preview.changedCount) : S.editor.preview.noChange}</span>
                      <Switch label={S.editor.preview.unchangedHidden(preview.days.length - preview.changedCount)} checked={showUnchanged} onChange={(_, d) => setShowUnchanged(d.checked)} />
                    </div>
                    <table className="preview__table">
                      <thead>
                        <tr>
                          <th>{S.editor.date}</th>
                          <th>{S.editor.preview.before}</th>
                          <th>{S.editor.preview.after}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.days
                          .filter((d) => showUnchanged || d.changed)
                          .map((d) => (
                            <tr key={d.date} className={d.changed ? 'is-changed' : undefined}>
                              <td>{formatDateWithDay(d.date)}</td>
                              <td className="preview__before">{summary(d.before)}</td>
                              <td className="preview__after">{summary(d.after)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    <details className="preview__requests">
                      <summary>
                        {S.editor.preview.requests} ({preview.requests.length})
                      </summary>
                      <ul>
                        {preview.descriptions.map((d, i) => (
                          <li key={i} className="mono">
                            {d}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </>
                )}
              </div>
            ) : null}

            {result.error ? (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>{result.error}</MessageBarBody>
              </MessageBar>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Btn onClick={onClose} disabled={pending}>
              {S.editor.cancel}
            </Btn>
            <form action={() => submit(intent)} className="inline-form">
              <Btn type="submit" kind={request.op === 'delete' ? 'danger' : 'primary'} disabled={pending || errors.length > 0}>
                {pending ? S.editor.saving : request.op === 'delete' ? S.editor.delete : request.op === 'end' ? S.editor.end : S.editor.save}
              </Btn>
            </form>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
