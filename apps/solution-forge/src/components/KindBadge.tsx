import type { SolutionKind } from '../types/solution'

const LABELS: Record<SolutionKind, string> = {
  feature: 'Feature',
  bug: 'Bug',
  // Internal key kept as 'deployment'; the business wording is "Release"
  // (sst_type_opt choice on ssid_workingsolution).
  deployment: 'Release',
  other: 'Other',
}

export function KindBadge({ kind }: { kind: SolutionKind }) {
  return <span className={`kind-badge kind-${kind}`}>{LABELS[kind]}</span>
}

/**
 * Fixed-width, full-height variant used as the left banner of a solution-list
 * row, so the rows line up in a clean left column.
 */
export function KindBanner({ kind }: { kind: SolutionKind }) {
  return <span className={`kind-banner kind-${kind}`}>{LABELS[kind]}</span>
}
