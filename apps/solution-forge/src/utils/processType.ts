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
  /** Emoji marker shown per row (and in the group header) for this kind. */
  icon: string
}

/** Ordered most-common first — this is also the group order in the matrix. */
export const PROCESS_TYPES: ProcessType[] = [
  { category: 5, label: 'Cloud flows', icon: '☁️' },
  { category: 0, label: 'Workflows', icon: '⚙️' },
  { category: 2, label: 'Business rules', icon: '📏' },
  { category: 3, label: 'Actions', icon: '⚡' },
  { category: 4, label: 'Business process flows', icon: '🧭' },
  { category: 6, label: 'Desktop flows', icon: '🖥️' },
  { category: 1, label: 'Dialogs', icon: '💬' },
]

/** Label used for any category not in {@link PROCESS_TYPES}. */
export const OTHER_PROCESSES = 'Other processes'
/** Icon used for any category not in {@link PROCESS_TYPES}. */
export const OTHER_PROCESSES_ICON = '🔧'

const BY_CATEGORY = new Map(PROCESS_TYPES.map((p) => [p.category, p]))

/** Group-header label for a workflow category; unknown → "Other processes". */
export function processTypeLabel(category: number): string {
  return BY_CATEGORY.get(category)?.label ?? OTHER_PROCESSES
}

/** Emoji marker for a workflow category; unknown → the wrench fallback. */
export function processTypeIcon(category: number): string {
  return BY_CATEGORY.get(category)?.icon ?? OTHER_PROCESSES_ICON
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
