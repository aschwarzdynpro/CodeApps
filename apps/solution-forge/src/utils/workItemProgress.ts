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

/** The subset of the connector's WorkItemType shape we read (kept loose so this
 *  stays independent of the generated model). */
interface RawWorkItemType {
  Name?: string
  states?: { name?: string; category?: string }[]
}

/**
 * Build the {@link StateOrders} map from the connector's `ListWorkItemTypes`
 * value array. Type names are lower-cased for case-insensitive lookup; the
 * per-type `states` order is preserved (it IS the workflow order). Types without
 * usable states are skipped.
 */
export function buildStateOrders(
  types: RawWorkItemType[] | null | undefined,
): StateOrders {
  const map: StateOrders = new Map()
  for (const t of types ?? []) {
    const name = (t?.Name ?? '').trim()
    if (!name || !Array.isArray(t.states)) continue
    const states = t.states
      .map((s) => ({
        name: (s?.name ?? '').trim(),
        category: (s?.category ?? '').trim(),
      }))
      .filter((s) => s.name)
    if (states.length) map.set(name.toLowerCase(), states)
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
