/**
 * Dataverse Process ("workflow") categories — the essential automation types the
 * Flow Comparer surfaces. The `category` option on the `workflow` table decides
 * which kind of process a row is; crucially they ALL share solution-component
 * type 29 and the same statecode activation semantics (statecode 1 = Activated),
 * so one comparer + one turn-on/off write covers every one of them.
 *
 * Categories (from the `workflow.category` option set):
 *   0 = Workflow (classic background / real-time), 1 = Dialog (deprecated),
 *   2 = Business Rule, 3 = Action, 4 = Business Process Flow,
 *   5 = Modern Flow (cloud flow / Power Automate), 6 = Desktop Flow.
 */
export interface ProcessType {
  category: number
  /** Plural group-header label (also shown in the "Group by" dropdown). */
  label: string
}

/** Ordered most-common first — this is also the group order in the matrix. */
export const PROCESS_TYPES: ProcessType[] = [
  { category: 5, label: 'Cloud flows' },
  { category: 0, label: 'Workflows' },
  { category: 2, label: 'Business rules' },
  { category: 3, label: 'Actions' },
  { category: 4, label: 'Business process flows' },
  { category: 6, label: 'Desktop flows' },
  { category: 1, label: 'Dialogs' },
]

/** Label used for any category not in {@link PROCESS_TYPES}. */
export const OTHER_PROCESSES = 'Other processes'

const BY_CATEGORY = new Map(PROCESS_TYPES.map((p) => [p.category, p.label]))

/** Group-header label for a workflow category; unknown → "Other processes". */
export function processTypeLabel(category: number): string {
  return BY_CATEGORY.get(category) ?? OTHER_PROCESSES
}

/** Preferred group order for the "process type" grouping (label values). */
export const PROCESS_TYPE_ORDER: string[] = [
  ...PROCESS_TYPES.map((p) => p.label),
  OTHER_PROCESSES,
]

/** Rank of a process-type label in the preferred order (unknown sorts last). */
export function processTypeRank(label: string | undefined): number {
  const i = PROCESS_TYPE_ORDER.indexOf(label ?? '')
  return i < 0 ? PROCESS_TYPE_ORDER.length : i
}
