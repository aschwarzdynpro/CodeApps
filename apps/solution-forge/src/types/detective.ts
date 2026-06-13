import type { EnvKey } from './comparison'

/**
 * ALM Detective model: a phased investigation that runs the selected ALM
 * checks (Compare incl. content drift, Layer Inspector, App Sharing,
 * Dependency Check) against one release solution and collects normalized
 * findings ranked by criticality.
 */

export type DetectivePhaseKey = 'compare' | 'layers' | 'sharing' | 'dependencies'

/** Execution order of the phases. */
export const PHASE_ORDER: DetectivePhaseKey[] = [
  'dependencies',
  'compare',
  'layers',
  'sharing',
]

export const PHASE_LABELS: Record<DetectivePhaseKey, string> = {
  dependencies: 'Dependency Check',
  compare: 'Compare',
  layers: 'Layer Inspector',
  sharing: 'App Sharing',
}

export const PHASE_HINTS: Record<DetectivePhaseKey, string> = {
  dependencies: 'Required components missing in the target',
  compare: 'Status / content drift and unmanaged layers across environments',
  layers: 'Unmanaged customizations masking deployed components',
  sharing: 'Canvas apps deployed but not shared with users',
}

export type PhaseStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

/** Live state of one phase, surfaced to the stepper. */
export interface PhaseState {
  key: DetectivePhaseKey
  status: PhaseStatus
  /** Progress text while running. */
  message?: string
  /** Findings raised by this phase (when done). */
  findings?: number
  /** Reason for skipped / failed. */
  note?: string
}

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low']

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/** One normalized finding from any phase. */
export interface Finding {
  severity: Severity
  phase: DetectivePhaseKey
  /** Short finding type, e.g. "Missing dependency", "Unmanaged layer". */
  category: string
  /** The component / app the finding is about. */
  subject: string
  /** Optional extra context. */
  detail?: string
  /** Environment the finding pertains to, when applicable. */
  env?: EnvKey
}

export interface DetectiveResult {
  findings: Finding[]
}
