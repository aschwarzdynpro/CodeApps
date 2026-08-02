import type { SolutionComponentInfo } from '../types/solution'

/**
 * `rootcomponentbehavior` of a table row in `solutioncomponent`:
 * 0 = include all subcomponents, 1 = do not include them, 2 = shell only.
 */
export const BEHAVIOR_INCLUDE_SUBCOMPONENTS = 0

/** What the merge does with one source component. */
export type MergeAction = 'add' | 'widen' | 'skip' | 'excluded'

/**
 * Decide what a merge should do with one source component, given what the
 * target already carries.
 *
 * `widen` exists because a `solutioncomponent` row is NOT identified by its
 * objectId alone — a table row also carries a `rootcomponentbehavior`. A
 * target holding the table as a shell (1/2) is not equivalent to a source
 * holding it with all its subcomponents (0): skipping on objectId alone
 * silently drops every column, form and view the source contributes. That was
 * the live failure mode (verified against INT-11 on 2026-08-01, and found in
 * the merge history for `sst_roundedtimeentries` → `SSTCoreV2`). Re-issuing
 * `AddSolutionComponent` with `DoNotIncludeSubcomponents=false` upgrades the
 * existing row in place — no duplicate row.
 *
 * Only widening is ever issued. Dataverse never narrows an existing row (a
 * behavior-0 table re-added as a shell stays at 0 — also verified live), so
 * the reverse call would be a no-op and we don't spend it.
 */
export function decideMergeAction(
  component: SolutionComponentInfo,
  /** objectId (lowercased) → rootBehavior of the row already in the target. */
  targetBehaviorByObjectId: ReadonlyMap<string, number | undefined>,
  isAllowed: (typeCode: number) => boolean,
): MergeAction {
  if (!isAllowed(component.typeCode)) return 'excluded'
  const key = component.objectId.toLowerCase()
  if (!targetBehaviorByObjectId.has(key)) return 'add'
  // Present already — only a source that carries the whole table can still
  // contribute something the target doesn't have.
  if (component.rootBehavior !== BEHAVIOR_INCLUDE_SUBCOMPONENTS) return 'skip'
  return targetBehaviorByObjectId.get(key) === BEHAVIOR_INCLUDE_SUBCOMPONENTS
    ? 'skip'
    : 'widen'
}
