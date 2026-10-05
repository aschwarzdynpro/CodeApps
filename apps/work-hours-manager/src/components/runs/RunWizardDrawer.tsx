import { Badge, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle, Field, MessageBar, MessageBarBody, OverlayDrawer, ProgressBar, Radio, RadioGroup, Switch, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Textarea } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { useRef, useState } from 'react'
import { LIMITS } from '../../config'
import { getCalendarService, PrivilegeError } from '../../services/calendarService'
import { runPlan, type RunProgress } from '../../services/runCalendarPlan'
import { S } from '../../strings'
import type { CalendarTree, Resource, RunRecord, RunStepResult, WorkHourTemplate } from '../../types/calendar'
import { addDays, startOfIsoWeek } from '../../utils/dates'
import { emptyAbsenceSpec, type AbsenceSpec } from '../../utils/intents'
import { buildPlan, type RunParams, type RunPlan, type RunTargetInput } from '../../utils/plan'
import { markUndone, saveRun } from '../../utils/runHistory'
import { buildUndoPlan } from '../../utils/undo'
import { DateField, DaysField, TimeField } from '../rules/editorParts'
import { Btn, Select } from '../ui'

export type WizardMode = { kind: 'new'; templateId?: string } | { kind: 'undo'; record: RunRecord }

interface Props {
  mode: WizardMode
  /** Selected resources with their trees (new runs). */
  targets: RunTargetInput[]
  resources: Resource[]
  templates: WorkHourTemplate[]
  trees: Record<string, CalendarTree>
  today: string
  useV2: boolean
  onFinished: (record: RunRecord) => void
  onPrivilegeError: () => void
  onClose: () => void
}

type Step = 'targets' | 'action' | 'preview' | 'run'
const STEPS: Step[] = ['targets', 'action', 'preview', 'run']

const STATUS_COLOR: Record<RunStepResult['status'] | 'change', 'success' | 'danger' | 'warning' | 'informative' | 'subtle' | 'brand'> = {
  change: 'brand',
  skipped: 'subtle',
  done: 'success',
  failed: 'danger',
  pending: 'informative',
  aborted: 'warning',
}

/** Three steps (selection → action → preview), then execution with progress; undo runs start at the preview. */
export function RunWizardDrawer({ mode, targets, resources, templates, trees, today, useV2, onFinished, onPrivilegeError, onClose }: Props) {
  const [step, setStep] = useState<Step>(mode.kind === 'undo' ? 'preview' : 'targets')
  const [actionKind, setActionKind] = useState<RunParams['kind']>('applyTemplate')
  const [templateId, setTemplateId] = useState<string>(mode.kind === 'new' && mode.templateId ? mode.templateId : (templates[0]?.id ?? ''))
  const [cutoff, setCutoff] = useState(addDays(startOfIsoWeek(today), 7))
  const [endExisting, setEndExisting] = useState(true)
  const [absence, setAbsence] = useState<AbsenceSpec>(() => ({ ...emptyAbsenceSpec(addDays(today, 1)), reason: '' }))
  const [progress, setProgress] = useState<{ results: RunStepResult[]; running: boolean; record: RunRecord | null; error: string | null }>({ results: [], running: false, record: null, error: null })
  const abort = useRef<AbortController | null>(null)

  const template = templates.find((t) => t.id === templateId) ?? null
  const templateTree = template?.calendarId ? trees[template.calendarId.toLowerCase()] : undefined

  const plan: RunPlan | null = (() => {
    if (step !== 'preview' && step !== 'run') return null
    if (mode.kind === 'undo') return buildUndoPlan(mode.record, trees, resources, useV2, today)
    if (actionKind === 'applyTemplate') return template && templateTree ? buildPlan({ kind: 'applyTemplate', template, templateTree, cutoff, endExisting, useV2 }, targets) : null
    return buildPlan({ kind: 'timeOff', absence, useV2 }, targets)
  })()

  const actionReady = actionKind === 'timeOff' ? absence.days >= 1 : !!templateTree
  const changing = plan?.steps.filter((s) => s.status === 'change').length ?? 0
  const requestsTotal = plan?.steps.reduce((n, s) => n + s.requests.length, 0) ?? 0

  const execute = async () => {
    if (!plan) return
    abort.current = new AbortController()
    setStep('run')
    setProgress({ results: plan.steps.map((s) => ({ resourceId: s.resourceId, resourceName: s.resourceName, calendarId: s.calendarId, status: s.status === 'skipped' ? 'skipped' : 'pending', message: s.note, createdInnerCalendarIds: [], deletedInnerCalendarIds: [], endedInnerCalendarIds: [] })), running: true, record: null, error: null })
    try {
      const svc = await getCalendarService()
      const record = await runPlan(plan, svc, {
        signal: abort.current.signal,
        onProgress: (p: RunProgress) => setProgress((prev) => ({ ...prev, results: prev.results.map((r, i) => (i === p.index ? { ...p.step } : r)) })),
      })
      saveRun(record)
      if (mode.kind === 'undo') markUndone(mode.record.id, record.id)
      setProgress((prev) => ({ ...prev, running: false, record }))
      if (record.steps.some((s) => s.status === 'failed' && /privilege|berechtigung/i.test(s.message))) onPrivilegeError()
      onFinished(record)
    } catch (err) {
      if (err instanceof PrivilegeError) onPrivilegeError()
      setProgress((prev) => ({ ...prev, running: false, error: err instanceof Error ? err.message : String(err) }))
    }
  }

  const done = progress.results.filter((r) => r.status === 'done').length
  const failed = progress.results.find((r) => r.status === 'failed')
  const aborted = progress.results.some((r) => r.status === 'aborted')
  const stepIndex = STEPS.indexOf(step)

  return (
    <OverlayDrawer open position="end" size="large" className="wizard" onOpenChange={(_, d) => !d.open && !progress.running && onClose()}>
      <DrawerHeader>
        <DrawerHeaderTitle action={<Btn kind="ghost" aria-label={S.runs.close} icon={<DismissRegular />} onClick={onClose} disabled={progress.running} />}>
          {mode.kind === 'undo' ? S.runs.labelUndo(mode.record.label) : S.runs.wizardTitle}
        </DrawerHeaderTitle>
        <ol className="wizard__steps" aria-label={S.runs.wizardTitle}>
          {STEPS.map((s, i) => (
            <li key={s} className={`wizard__step${i === stepIndex ? ' is-active' : i < stepIndex ? ' is-done' : ''}`}>
              <span className="wizard__num">{i + 1}</span> {S.runs.steps[s]}
            </li>
          ))}
        </ol>
      </DrawerHeader>
      <DrawerBody className="wizard__body">
        {step === 'targets' ? (
          <>
            <p>{S.runs.targetsIntro(targets.length, LIMITS.maxRunResources)}</p>
            {targets.length > LIMITS.maxRunResources ? (
              <MessageBar intent="warning" layout="multiline">
                <MessageBarBody>{S.runs.tooMany(LIMITS.maxRunResources)}</MessageBarBody>
              </MessageBar>
            ) : null}
            {targets.length === 0 ? <p className="empty">{S.runs.noTargets}</p> : null}
            <ul className="wizard__targets">
              {targets.map((t) => (
                <li key={t.resource.id}>
                  {t.resource.name}
                  {!t.tree ? <Badge size="small" appearance="tint" color="warning" className="ml-6">{S.runs.skipNoCalendar}</Badge> : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {step === 'action' ? (
          <div className="wizard__form">
            <Field label={S.runs.actionKind}>
              <RadioGroup value={actionKind} onChange={(_, d) => setActionKind(d.value as RunParams['kind'])}>
                <Radio value="applyTemplate" label={S.runs.actions.applyTemplate} />
                <Radio value="timeOff" label={S.runs.actions.timeOff} />
              </RadioGroup>
            </Field>
            {actionKind === 'applyTemplate' ? (
              <>
                <Field label={S.runs.template} required>
                  <Select value={templateId} options={templates.filter((t) => t.calendarId).map((t) => ({ value: t.id, label: t.name }))} onChange={setTemplateId} placeholder={S.runs.templatePlaceholder} aria-label={S.runs.template} />
                </Field>
                <Field label={S.runs.cutoff} required>
                  <DateField value={cutoff} onChange={(d) => d && setCutoff(d)} ariaLabel={S.runs.cutoff} minDate={today} />
                </Field>
                <Switch label={S.runs.endExisting} checked={endExisting} onChange={(_, d) => setEndExisting(d.checked)} />
                <p className="muted small">{S.runs.endExistingHint}</p>
              </>
            ) : (
              <>
                <Field label={S.editor.kind}>
                  <RadioGroup layout="horizontal" value={absence.kind} onChange={(_, d) => setAbsence({ ...absence, kind: d.value as AbsenceSpec['kind'] })}>
                    <Radio value="timeoff" label={S.editor.kinds.timeoff} />
                    <Radio value="nonwork" label={S.editor.kinds.nonwork} />
                  </RadioGroup>
                </Field>
                <div className="editor__row">
                  <Field label={S.editor.date} required>
                    <DateField value={absence.date} onChange={(d) => d && setAbsence({ ...absence, date: d })} ariaLabel={S.editor.date} />
                  </Field>
                  <Switch label={S.editor.allDay} checked={absence.allDay} onChange={(_, d) => setAbsence({ ...absence, allDay: d.checked })} />
                  {absence.allDay ? (
                    <Field label={S.editor.days}>
                      <DaysField value={absence.days} onChange={(days) => setAbsence({ ...absence, days })} />
                    </Field>
                  ) : (
                    <>
                      <Field label={S.editor.from}>
                        <TimeField value={absence.start} onChange={(start) => setAbsence({ ...absence, start })} ariaLabel={S.editor.from} />
                      </Field>
                      <Field label={S.editor.to}>
                        <TimeField value={absence.end} onChange={(end) => setAbsence({ ...absence, end })} ariaLabel={S.editor.to} />
                      </Field>
                    </>
                  )}
                </div>
                {absence.kind === 'timeoff' ? (
                  <Field label={S.editor.reason}>
                    <Textarea size="small" value={absence.reason} placeholder={S.editor.reasonPlaceholder} onChange={(_, d) => setAbsence({ ...absence, reason: d.value })} />
                  </Field>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {step === 'preview' && plan ? (
          <>
            <p>
              <strong>{plan.label}</strong>
              <br />
              <span className="muted small">{plan.summary}</span>
            </p>
            <p className="muted small">
              {S.runs.counts(changing, plan.steps.length - changing)} · {S.runs.requestsTotal(requestsTotal)}
            </p>
            <PlanTable plan={plan} />
          </>
        ) : null}

        {step === 'run' && plan ? (
          <>
            <ProgressBar value={plan.steps.length ? progress.results.filter((r) => r.status !== 'pending').length / plan.steps.length : 1} />
            <p className="muted small">{S.runs.progress(progress.results.filter((r) => r.status !== 'pending').length, plan.steps.length)}</p>
            {!progress.running && progress.record ? (
              <MessageBar intent={failed ? 'error' : aborted ? 'warning' : 'success'} layout="multiline">
                <MessageBarBody>{failed ? S.runs.resultFailed(failed.resourceName) : aborted ? S.runs.resultAborted : S.runs.resultOk(done)}</MessageBarBody>
              </MessageBar>
            ) : null}
            {progress.error ? (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>{progress.error}</MessageBarBody>
              </MessageBar>
            ) : null}
            <ul className="run-results">
              {progress.results.map((r) => (
                <li key={r.resourceId} className="run-result">
                  <Badge size="small" appearance="filled" color={STATUS_COLOR[r.status]}>
                    {S.runs.status[r.status]}
                  </Badge>
                  <span>{r.resourceName}</span>
                  <span className="muted small">{r.message}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </DrawerBody>
      <DrawerFooter className="wizard__footer">
        {step === 'targets' ? (
          <Btn kind="primary" onClick={() => setStep('action')} disabled={targets.length === 0}>
            {S.runs.next}
          </Btn>
        ) : null}
        {step === 'action' ? (
          <>
            <Btn onClick={() => setStep('targets')}>{S.runs.back}</Btn>
            <Btn kind="primary" onClick={() => setStep('preview')} disabled={!actionReady}>
              {S.runs.next}
            </Btn>
          </>
        ) : null}
        {step === 'preview' ? (
          <>
            {mode.kind === 'new' ? <Btn onClick={() => setStep('action')}>{S.runs.back}</Btn> : null}
            <Btn kind="primary" onClick={execute} disabled={!plan || changing === 0}>
              {S.runs.execute}
            </Btn>
          </>
        ) : null}
        {step === 'run' ? (
          progress.running ? (
            <Btn kind="danger" onClick={() => abort.current?.abort()}>
              {S.runs.abort}
            </Btn>
          ) : (
            <Btn kind="primary" onClick={onClose}>
              {S.runs.done}
            </Btn>
          )
        ) : null}
      </DrawerFooter>
    </OverlayDrawer>
  )
}

function PlanTable({ plan }: { plan: RunPlan }) {
  const h = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 })
  return (
    <Table size="small" aria-label={S.runs.steps.preview} className="plan-table">
      <TableHeader>
        <TableRow>
          <TableHeaderCell>{S.runs.previewColumns.resource}</TableHeaderCell>
          <TableHeaderCell>{S.runs.previewColumns.before}</TableHeaderCell>
          <TableHeaderCell>{S.runs.previewColumns.after}</TableHeaderCell>
          <TableHeaderCell>{S.runs.previewColumns.rules}</TableHeaderCell>
          <TableHeaderCell>{S.runs.previewColumns.status}</TableHeaderCell>
          <TableHeaderCell>{S.runs.previewColumns.note}</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {plan.steps.map((s) => (
          <TableRow key={s.resourceId}>
            <TableCell>{s.resourceName}</TableCell>
            <TableCell className="muted">{h(s.before)}</TableCell>
            <TableCell className={s.status === 'change' ? 'bold' : 'muted'}>{h(s.after)}</TableCell>
            <TableCell>
              {s.rulesBefore} → {s.rulesAfter}
            </TableCell>
            <TableCell>
              <Badge size="small" appearance="tint" color={STATUS_COLOR[s.status]}>
                {S.runs.status[s.status]}
              </Badge>
            </TableCell>
            <TableCell className="small">{s.note}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

