import type { SolutionComponentInfo } from '../types/solution'
import type {
  DetectivePhaseKey,
  Finding,
  PhaseState,
  Severity,
} from '../types/detective'
import { PHASE_LABELS, PHASE_ORDER, SEVERITY_ORDER } from '../types/detective'

/**
 * Pure derivation layer for the Analyze dashboard. The ALM Detective
 * ({@link runInvestigation}) produces the raw {@link Finding}s; everything the
 * dashboard shows on top of them — the deployment risk score, the readiness
 * matrix and the recommendations — is computed here so it stays testable and
 * free of any data access.
 */

export type RiskBand = 'low' | 'medium' | 'high'

export interface RiskScore {
  /** 0–100; higher is safer. 100 = nothing found. */
  score: number
  band: RiskBand
  /** "Low Risk" / "Medium Risk" / "High Risk". */
  label: string
}

/**
 * Penalty points subtracted from a perfect 100 per finding. Weighted so a
 * single critical (a blocked/broken import) dominates, while a handful of
 * low-severity notes barely move the needle.
 */
const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 22,
  high: 10,
  medium: 4,
  low: 1,
}

export function computeRiskScore(findings: Finding[]): RiskScore {
  const penalty = findings.reduce(
    (sum, f) => sum + (SEVERITY_WEIGHT[f.severity] ?? 0),
    0,
  )
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)))
  const band: RiskBand = score >= 80 ? 'low' : score >= 50 ? 'medium' : 'high'
  const label =
    band === 'low' ? 'Low Risk' : band === 'medium' ? 'Medium Risk' : 'High Risk'
  return { score, band, label }
}

export interface ComponentTypeCount {
  typeName: string
  count: number
}

export interface ComponentSummary {
  total: number
  /** Distinct component types, most populous first. */
  types: ComponentTypeCount[]
}

export function summarizeComponents(
  components: SolutionComponentInfo[],
): ComponentSummary {
  const counts = new Map<string, number>()
  for (const c of components)
    counts.set(c.typeName, (counts.get(c.typeName) ?? 0) + 1)
  const types = [...counts.entries()]
    .map(([typeName, count]) => ({ typeName, count }))
    .sort((a, b) => b.count - a.count || a.typeName.localeCompare(b.typeName))
  return { total: components.length, types }
}

export type ReadinessStatus = 'ok' | 'attention' | 'failed' | 'skipped'

export interface ReadinessCheck {
  phase: DetectivePhaseKey
  label: string
  status: ReadinessStatus
  /** Number of findings raised by this phase. */
  issues: number
  /** Short status note for the row. */
  note: string
}

/** Readiness-row labels — the deployment-facing framing of each phase. */
const READINESS_LABELS: Record<DetectivePhaseKey, string> = {
  dependencies: 'Dependencies',
  compare: 'Content & Status Drift',
  layers: 'Customization Layers',
  sharing: 'App Sharing',
}

/**
 * One readiness row per phase: compatible when the phase ran clean, attention
 * when it raised findings, and skipped/failed mirroring the phase outcome.
 */
export function buildReadiness(
  findings: Finding[],
  phaseStates: Record<string, PhaseState>,
): ReadinessCheck[] {
  return PHASE_ORDER.map((phase) => {
    const state = phaseStates[phase]
    const issues = findings.filter((f) => f.phase === phase).length
    let status: ReadinessStatus
    let note: string
    if (state?.status === 'skipped') {
      status = 'skipped'
      note = state.note || 'Not applicable'
    } else if (state?.status === 'failed') {
      status = 'failed'
      note = 'Check failed'
    } else if (issues === 0) {
      status = 'ok'
      note = 'Compatible'
    } else {
      status = 'attention'
      note = `${issues} issue${issues === 1 ? '' : 's'}`
    }
    return { phase, label: READINESS_LABELS[phase], status, issues, note }
  })
}

export interface Recommendation {
  id: string
  /** Worst severity in the underlying group — drives the dot colour. */
  severity: Severity
  text: string
}

/**
 * Turn a category of findings into one actionable sentence. Keyed by the
 * Detective's finding categories; unknown categories fall back to a generic
 * "review" line so a new check still surfaces something useful.
 */
function recommendationText(
  category: string,
  count: number,
  envLabel: string,
): string {
  const n = (noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
  switch (category) {
    case 'Missing dependency':
      return `Add the ${n(
        'missing dependency',
      )} to the release before importing into ${envLabel} — the import would otherwise fail.`
    case 'Unmanaged in target':
    case 'Unmanaged layer over managed':
      return `Remove ${n(
        'unmanaged customization',
      )} masking managed components in ${envLabel}.`
    case 'Unmanaged-only component':
      return `Review ${n(
        'unmanaged-only component',
      )} in ${envLabel} — they were never delivered through a managed solution.`
    case 'Status drift':
      return `Reconcile ${n(
        'component',
      )} whose activation state differs from DEV.`
    case 'Content drift':
      return `Review ${n(
        'component',
      )} whose definition differs from DEV and redeploy.`
    case 'Missing in target':
      return `Deploy the release — ${n(
        'component',
      )} are not present in ${envLabel} yet.`
    case 'Canvas app not shared':
      return `Share ${n('canvas app')} with the intended users or teams in ${envLabel}.`
    default:
      return `Review ${n('finding')} in the "${category}" check.`
  }
}

export function buildRecommendations(
  findings: Finding[],
  envLabel: string,
): Recommendation[] {
  if (findings.length === 0)
    return [
      {
        id: 'clean',
        severity: 'low',
        text: `No action required — the release looks deployment-ready for ${envLabel}.`,
      },
    ]

  // Group by category; remember the worst severity seen per category so the
  // recommendation inherits the right urgency colour.
  const groups = new Map<string, { count: number; severity: Severity }>()
  for (const f of findings) {
    const entry = groups.get(f.category)
    if (entry) {
      entry.count++
      if (
        SEVERITY_ORDER.indexOf(f.severity) < SEVERITY_ORDER.indexOf(entry.severity)
      )
        entry.severity = f.severity
    } else {
      groups.set(f.category, { count: 1, severity: f.severity })
    }
  }

  return [...groups.entries()]
    .sort(
      ([, a], [, b]) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
        b.count - a.count,
    )
    .map(([category, { count, severity }]) => ({
      id: category,
      severity,
      text: recommendationText(category, count, envLabel),
    }))
}

/** Phase-label re-export so the dashboard doesn't reach into detective types. */
export { PHASE_LABELS }
