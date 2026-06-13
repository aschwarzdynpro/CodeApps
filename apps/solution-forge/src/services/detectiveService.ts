import type { WorkingSolution } from '../types/solution'
import type { EnvKey } from '../types/comparison'
import { ALM_KIND_LABELS } from '../types/comparison'
import type {
  DetectivePhaseKey,
  DetectiveResult,
  Finding,
  PhaseState,
  Severity,
} from '../types/detective'
import { PHASE_ORDER, SEVERITY_ORDER } from '../types/detective'
import { comparisonService } from './comparisonService'
import { solutionService } from './solutionService'
import { sharingService } from './sharingService'

/**
 * ALM Detective orchestrator. Runs the selected phases sequentially against
 * one release solution, mapping each underlying service's output to
 * normalized {@link Finding}s ranked by severity. It composes the existing
 * services, so the mock fallback applies automatically outside a host.
 */

interface InvestigateOptions {
  solution: WorkingSolution
  /** Target environment for the single-env phases (layers, dependencies). */
  targetEnv: 'uat' | 'prod'
  phases: DetectivePhaseKey[]
  onPhase: (state: PhaseState) => void
}

const TARGET_ENVS: EnvKey[] = ['uat', 'prod']

export async function runInvestigation({
  solution,
  targetEnv,
  phases,
  onPhase,
}: InvestigateOptions): Promise<DetectiveResult> {
  const findings: Finding[] = []
  const add = (f: Finding) => findings.push(f)
  const selected = PHASE_ORDER.filter((p) => phases.includes(p))

  for (const key of selected) {
    onPhase({ key, status: 'running', message: 'Starting…' })
    const before = findings.length
    try {
      if (key === 'dependencies') {
        if (solution.kind !== 'deployment') {
          onPhase({
            key,
            status: 'skipped',
            note: 'Only release solutions have a dependency check.',
          })
          continue
        }
        await runDependencies(solution, targetEnv, add, onPhase)
      } else if (key === 'compare') {
        await runCompare(solution, add, onPhase)
      } else if (key === 'layers') {
        await runLayers(solution, targetEnv, add, onPhase)
      } else if (key === 'sharing') {
        await runSharing(solution, add, onPhase)
      }
      onPhase({ key, status: 'done', findings: findings.length - before })
    } catch (err) {
      onPhase({
        key,
        status: 'failed',
        note: err instanceof Error ? err.message : String(err),
      })
    }
  }

  findings.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.category.localeCompare(b.category) ||
      a.subject.localeCompare(b.subject),
  )
  return { findings }
}

async function runDependencies(
  solution: WorkingSolution,
  targetEnv: 'uat' | 'prod',
  add: (f: Finding) => void,
  onPhase: (s: PhaseState) => void,
): Promise<void> {
  const res = await solutionService.checkDependencies(solution, targetEnv, (m) =>
    onPhase({ key: 'dependencies', status: 'running', message: m }),
  )
  for (const item of res.items) {
    if (item.targetStatus !== 'missing') continue
    add({
      severity: 'critical',
      phase: 'dependencies',
      category: 'Missing dependency',
      subject: item.requiredName ?? item.requiredTypeName,
      detail: `${item.requiredTypeName} — required by ${item.dependentTypeName} ${
        item.dependentName ?? ''
      }`.trim(),
      env: targetEnv,
    })
  }
}

async function runCompare(
  solution: WorkingSolution,
  add: (f: Finding) => void,
  onPhase: (s: PhaseState) => void,
): Promise<void> {
  let result = await comparisonService.compareSolution(solution.id, (m) =>
    onPhase({ key: 'compare', status: 'running', message: m }),
  )
  // Content drift is part of Compare's scope — run the second pass too.
  onPhase({ key: 'compare', status: 'running', message: 'Hashing definitions…' })
  result = await comparisonService.checkContentDrift(result, (done, total) =>
    onPhase({
      key: 'compare',
      status: 'running',
      message: `Content drift ${done}/${total}`,
    }),
  )

  for (const row of result.rows) {
    const dev = row.byEnv.dev
    const kindLabel = ALM_KIND_LABELS[row.ref.kind]
    if (!dev?.present) continue
    for (const envKey of TARGET_ENVS) {
      const target = row.byEnv[envKey]
      if (!target) continue
      if (!target.present) {
        add({
          severity: 'low',
          phase: 'compare',
          category: 'Missing in target',
          subject: row.ref.name,
          detail: kindLabel,
          env: envKey,
        })
        continue
      }
      if (target.isManaged === false) {
        add({
          severity: 'high',
          phase: 'compare',
          category: 'Unmanaged in target',
          subject: row.ref.name,
          detail: kindLabel,
          env: envKey,
        })
      }
      if (
        dev.active !== undefined &&
        target.active !== undefined &&
        dev.active !== target.active
      ) {
        add({
          severity: 'medium',
          phase: 'compare',
          category: 'Status drift',
          subject: row.ref.name,
          detail: `DEV ${dev.stateLabel ?? '—'} → ${target.stateLabel ?? '—'}`,
          env: envKey,
        })
      }
    }
    if (row.deviations.includes('content')) {
      add({
        severity: 'medium',
        phase: 'compare',
        category: 'Content drift',
        subject: row.ref.name,
        detail: `${kindLabel} — definition differs across environments`,
      })
    }
  }
}

async function runLayers(
  solution: WorkingSolution,
  targetEnv: 'uat' | 'prod',
  add: (f: Finding) => void,
  onPhase: (s: PhaseState) => void,
): Promise<void> {
  const res = await solutionService.inspectLayers(solution, targetEnv, (done, total) =>
    onPhase({
      key: 'layers',
      status: 'running',
      message: `${done}/${total} components`,
    }),
  )
  for (const stack of res.stacks) {
    const subject = stack.component.displayName
    if (stack.verdict === 'overridden') {
      add({
        severity: 'high',
        phase: 'layers',
        category: 'Unmanaged layer over managed',
        subject,
        detail: stack.component.typeName,
        env: targetEnv,
      })
    } else if (stack.verdict === 'unmanagedOnly') {
      add({
        severity: 'low',
        phase: 'layers',
        category: 'Unmanaged-only component',
        subject,
        detail: stack.component.typeName,
        env: targetEnv,
      })
    } else if (stack.verdict === 'error') {
      add({
        severity: 'low',
        phase: 'layers',
        category: 'Layer lookup failed',
        subject,
        detail: stack.component.typeName,
        env: targetEnv,
      })
    }
  }
}

async function runSharing(
  solution: WorkingSolution,
  add: (f: Finding) => void,
  onPhase: (s: PhaseState) => void,
): Promise<void> {
  const res = await sharingService.checkAppSharing(solution.id, (m) =>
    onPhase({ key: 'sharing', status: 'running', message: m }),
  )
  for (const row of res.rows) {
    if (row.kind === 'custompage') continue
    for (const envKey of TARGET_ENVS) {
      const state = row.byEnv[envKey]
      if (!state?.present) continue
      if (state.error) {
        add({
          severity: 'low',
          phase: 'sharing',
          category: 'Sharing lookup failed',
          subject: row.displayName,
          env: envKey,
        })
      } else if (state.principals.length === 0) {
        add({
          severity: 'high',
          phase: 'sharing',
          category: 'Canvas app not shared',
          subject: row.displayName,
          detail: 'Reaches no users or teams in this environment',
          env: envKey,
        })
      }
    }
  }
}

/** Severity tally helper for the UI. */
export function severityCounts(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  }
  for (const f of findings) counts[f.severity]++
  return counts
}
