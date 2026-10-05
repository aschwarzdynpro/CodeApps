import { LIMITS } from '../config'
import { S } from '../strings'
import type { CalendarTree, Resource, RuleBlock, TreeSnapshot, Weekday, WorkHourTemplate } from '../types/calendar'
import { addDays, formatDate, startOfIsoWeek } from './dates'
import { blockSegments, toRequests, type AbsenceSpec, type ApiRequest, type EditTarget, type WorkHoursSpec } from './intents'
import { applyRequests } from './preview'
import { expandTree } from './resolve'
import { activeWorkRecurrences, groupBlocks, isRecurrence } from './rules'

/**
 * Mass actions as plans: one step per resource with its requests, a
 * before/after summary from the server emulation and a status. The plan is
 * what the wizard previews and what `runCalendarPlan` executes — nothing is
 * written while planning.
 */

export interface TemplateRunParams {
  kind: 'applyTemplate'
  template: WorkHourTemplate
  templateTree: CalendarTree
  /** First day the template applies. */
  cutoff: string
  /** End the resources' existing work recurrences the day before the cutoff. */
  endExisting: boolean
  useV2: boolean
}

export interface TimeOffRunParams {
  kind: 'timeOff'
  absence: AbsenceSpec
  useV2: boolean
}

export type RunParams = TemplateRunParams | TimeOffRunParams

export interface RunStep {
  resourceId: string
  resourceName: string
  calendarId: string | null
  requests: ApiRequest[]
  status: 'change' | 'skipped'
  note: string
  /** Hours in the first week from the cutoff (or the absence week), before and after. */
  before: number
  after: number
  rulesBefore: number
  rulesAfter: number
  /** Inner calendar ids this step ends or deletes (recorded for undo). */
  endedInnerCalendarIds: string[]
  deletedInnerCalendarIds: string[]
}

export interface RunPlan {
  kind: RunParams['kind'] | 'undo'
  label: string
  summary: string
  steps: RunStep[]
  snapshot: Record<string, TreeSnapshot>
  /** Run this plan reverts (undo plans). */
  undoOf: string | null
}

export interface RunTargetInput {
  resource: Resource
  tree: CalendarTree | null
}

export const targetOf = (r: Resource, useV2: boolean): EditTarget => ({ entity: 'bookableresource', calendarId: r.calendarId ?? '', resourceId: r.type === 'user' ? r.userId : null, timeZoneCode: r.timeZoneCode, useV2 })

export const snapshotOf = (tree: CalendarTree): TreeSnapshot => ({
  outer: { calendarid: tree.calendarId, name: tree.name, description: null, type: 0, calendar_calendar_rules: [...tree.blocks.map((b) => b.raw.root), ...tree.unparsed] },
  inner: [...tree.blocks.map((b) => b.raw.inner).filter((c): c is NonNullable<typeof c> => !!c), ...tree.orphanInnerCalendars],
})

/** Net working hours of the ISO week containing `date`. */
export function weekHours(tree: CalendarTree | null, date: string): number {
  if (!tree) return 0
  const from = startOfIsoWeek(date)
  const minutes = expandTree(tree, from, addDays(from, 6)).work.reduce((sum, w) => sum + (w.end - w.start) / 60_000, 0)
  return Math.round((minutes / 60) * 100) / 100
}

/** The template's work recurrences as specs starting at the cutoff; occurrences and absences in a template are ignored. */
export function templateSpecs(templateTree: CalendarTree, cutoff: string): { specs: WorkHoursSpec[]; ignored: RuleBlock[] } {
  const specs: WorkHoursSpec[] = []
  const ignored: RuleBlock[] = []
  for (const group of groupBlocks(templateTree.blocks)) {
    const work = group.filter((b) => isRecurrence(b) && b.kind === 'work' && (b.end === null || b.end >= cutoff))
    ignored.push(...group.filter((b) => !work.includes(b)))
    if (work.length === 0) continue
    const effort = work[0].leaves.find((l) => l.kind === 'work')?.effort ?? 1
    if (group.length > 1 || work[0].groupId) {
      const varied: NonNullable<WorkHoursSpec['varied']> = {}
      for (const b of work) for (const d of b.weekdays ?? []) varied[d] = blockSegments(b)
      specs.push({ kind: 'work', date: cutoff, recurrence: { weekdays: Object.keys(varied).map(Number) as Weekday[], endDate: work[0].end }, segments: [], varied, allDay: false, days: 1, effort, observeClosure: true })
    } else {
      const b = work[0]
      specs.push({ kind: 'work', date: cutoff, recurrence: { weekdays: b.weekdays!, endDate: b.end }, segments: blockSegments(b), varied: null, allDay: false, days: 1, effort, observeClosure: true })
    }
  }
  return { specs, ignored }
}

function stepFor(target: RunTargetInput, requests: ApiRequest[], note: string, weekOf: string, ended: string[], deleted: string[]): RunStep {
  const base = { resourceId: target.resource.id, resourceName: target.resource.name, calendarId: target.resource.calendarId, endedInnerCalendarIds: ended, deletedInnerCalendarIds: deleted }
  if (!target.tree) return { ...base, requests: [], status: 'skipped', note: S.runs.skipNoCalendar, before: 0, after: 0, rulesBefore: 0, rulesAfter: 0 }
  if (requests.length === 0) return { ...base, requests: [], status: 'skipped', note: note || S.runs.skipNothing, before: weekHours(target.tree, weekOf), after: weekHours(target.tree, weekOf), rulesBefore: target.tree.blocks.length, rulesAfter: target.tree.blocks.length }
  try {
    const after = applyRequests(target.tree, requests)
    return { ...base, requests, status: 'change', note, before: weekHours(target.tree, weekOf), after: weekHours(after, weekOf), rulesBefore: target.tree.blocks.length, rulesAfter: after.blocks.length }
  } catch (err) {
    return { ...base, requests: [], status: 'skipped', note: `${S.runs.skipError}: ${err instanceof Error ? err.message : String(err)}`, before: weekHours(target.tree, weekOf), after: weekHours(target.tree, weekOf), rulesBefore: target.tree.blocks.length, rulesAfter: target.tree.blocks.length }
  }
}

export function buildPlan(params: RunParams, targets: RunTargetInput[]): RunPlan {
  const limited = targets.slice(0, LIMITS.maxRunResources)
  const snapshot: Record<string, TreeSnapshot> = {}
  for (const t of limited) if (t.tree) snapshot[t.tree.calendarId.toLowerCase()] = snapshotOf(t.tree)

  if (params.kind === 'timeOff') {
    const steps = limited.map((t) => {
      if (!t.tree || !t.resource.calendarId) return stepFor(t, [], '', params.absence.date, [], [])
      const requests = toRequests({ op: 'create', target: targetOf(t.resource, params.useV2), spec: params.absence })
      return stepFor(t, requests, S.runs.noteAbsence(params.absence.days), params.absence.date, [], [])
    })
    const label = params.absence.kind === 'timeoff' ? S.runs.labelTimeOff(params.absence.reason || S.kinds.timeoff) : S.runs.labelNonwork
    return { kind: 'timeOff', label, summary: S.runs.summaryAbsence(formatDate(params.absence.date), params.absence.days, limited.length), steps, snapshot, undoOf: null }
  }

  const { specs, ignored } = templateSpecs(params.templateTree, params.cutoff)
  const steps = limited.map((t) => {
    if (!t.tree || !t.resource.calendarId) return stepFor(t, [], '', params.cutoff, [], [])
    if (specs.length === 0) return stepFor(t, [], S.runs.skipTemplateEmpty, params.cutoff, [], [])
    const target = targetOf(t.resource, params.useV2)
    const requests: ApiRequest[] = []
    const ended: string[] = []
    const deleted: string[] = []
    const notes: string[] = []
    if (params.endExisting) {
      for (const b of activeWorkRecurrences(t.tree, params.cutoff)) {
        if (!b.innerCalendarId) continue
        if (b.start >= params.cutoff) {
          requests.push(...toRequests({ op: 'delete', target, block: b }))
          deleted.push(b.innerCalendarId)
        } else if (b.end === null || b.end >= params.cutoff) {
          requests.push(...toRequests({ op: 'end', target, block: b, lastDay: addDays(params.cutoff, -1) }))
          ended.push(b.innerCalendarId)
        }
      }
      if (ended.length) notes.push(S.runs.noteEnded(ended.length))
      if (deleted.length) notes.push(S.runs.noteDeleted(deleted.length))
    }
    for (const spec of specs) requests.push(...toRequests({ op: 'create', target, spec }))
    notes.push(S.runs.noteCreated(specs.length))
    return stepFor(t, requests, notes.join(' · '), params.cutoff, ended, deleted)
  })
  const summary = S.runs.summaryTemplate(params.template.name, formatDate(params.cutoff), limited.length, params.endExisting) + (ignored.length ? ` · ${S.runs.templateIgnored(ignored.length)}` : '')
  return { kind: 'applyTemplate', label: S.runs.labelTemplate(params.template.name), summary, steps, snapshot, undoOf: null }
}
