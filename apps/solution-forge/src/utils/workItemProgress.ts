/**
 * Real Azure DevOps work-item progress: instead of guessing a percentage from a
 * numbered state name (the Schulz "01-…"–"15-…" convention), we use the actual
 * ordered state list of each work-item TYPE, as returned by the connector's
 * `ListWorkItemTypes` (each type carries its `states` in workflow order, with a
 * `category`: Proposed → InProgress → Resolved → Completed, plus Removed).
 */

/** One state in a work-item type's workflow. */
export interface StateRef {
  name: string
  /** Proposed | InProgress | Resolved | Completed | Removed (DevOps categories). */
  category: string
}

/** Ordered states per work-item type. Key = lower-cased type name. */
export type StateOrders = Map<string, StateRef[]>

/** Canonical progression of DevOps state categories. Unknown categories sort
 *  between InProgress and Resolved so a custom category still lands mid-flow. */
const CATEGORY_RANK: Record<string, number> = {
  proposed: 0,
  inprogress: 1,
  resolved: 2,
  completed: 3,
  removed: 4,
}
function categoryRank(category: string): number {
  return CATEGORY_RANK[category.toLowerCase()] ?? 1.5
}

/** The subset of a WorkItemType we read (kept loose so this stays independent of
 *  the generated model). The typed connector op returns `Name`; the raw REST
 *  passthrough returns `name` — accept both. */
interface RawWorkItemType {
  Name?: string
  name?: string
  states?: { name?: string; category?: string }[]
}

/**
 * Build the {@link StateOrders} map from a `ListWorkItemTypes` / `workitemtypes`
 * value array. Type names are lower-cased for case-insensitive lookup; the
 * per-type `states` order is preserved (it IS the workflow order). Types without
 * usable states are skipped.
 */
export function buildStateOrders(
  types: RawWorkItemType[] | null | undefined,
): StateOrders {
  const map: StateOrders = new Map()
  for (const t of types ?? []) {
    const name = (t?.Name ?? t?.name ?? '').trim()
    if (!name || !Array.isArray(t.states)) continue
    const states = t.states
      .map((s) => ({
        name: (s?.name ?? '').trim(),
        category: (s?.category ?? '').trim(),
      }))
      .filter((s) => s.name)
    if (!states.length) continue
    // Order by category (Proposed → InProgress → Resolved → Completed → Removed),
    // keeping the source order within a category (Array.sort is stable) — robust
    // even when the API returns the states array unordered.
    states.sort((a, b) => categoryRank(a.category) - categoryRank(b.category))
    map.set(name.toLowerCase(), states)
  }
  return map
}

/**
 * Position of a work item's current state within its type's real workflow.
 * Returns the percent (index / (count-1), floored at 6 so a first state is still
 * visible) and the state's category (for colour), or null when the type/state
 * can't be resolved — the caller then falls back to the numeric heuristic.
 */
export function deriveWorkItemProgress(
  typeName: string | undefined | null,
  state: string | undefined | null,
  orders: StateOrders,
): { pct: number; category: string } | null {
  if (!typeName || !state) return null
  const states = orders.get(typeName.trim().toLowerCase())
  if (!states || states.length === 0) return null
  const target = state.trim().toLowerCase()
  const idx = states.findIndex((s) => s.name.toLowerCase() === target)
  if (idx < 0) return null
  const pct =
    states.length <= 1
      ? 100
      : Math.max(6, Math.round((idx / (states.length - 1)) * 100))
  return { pct, category: states[idx].category }
}
