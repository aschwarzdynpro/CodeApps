import type { SolutionKind } from '../types/solution'

const LABELS: Record<SolutionKind, string> = {
  feature: 'Feature',
  bug: 'Bug',
  deployment: 'Deployment',
  other: 'Other',
}

export function KindBadge({ kind }: { kind: SolutionKind }) {
  return <span className={`kind-badge kind-${kind}`}>{LABELS[kind]}</span>
}
