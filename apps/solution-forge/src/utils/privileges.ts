import type {
  PrivilegeAction,
  PrivilegeDepthMask,
} from '../types/roles'
import { PRIVILEGE_DEPTHS } from '../types/roles'

/**
 * Pure decoders for the Dataverse privilege model — no I/O, unit-testable.
 */

/** privilege.accessright bit → matrix action (AccessRights EnumType). */
const ACTION_BY_ACCESS_RIGHT: Record<number, PrivilegeAction> = {
  32: 'Create',
  1: 'Read',
  2: 'Write',
  65536: 'Delete',
  4: 'Append',
  16: 'AppendTo',
  524288: 'Assign',
  262144: 'Share',
}

/** Map an accessright bit to its matrix action, or null for misc privileges. */
export function actionFromAccessRight(
  accessRight: number,
): PrivilegeAction | null {
  return ACTION_BY_ACCESS_RIGHT[accessRight] ?? null
}

/**
 * Fallback for privileges whose accessright the org doesn't expose: derive
 * the action from the canonical `prv<Action><Entity>` name.
 */
export function actionFromPrivilegeName(
  name: string,
): PrivilegeAction | null {
  const match = /^prv(Create|Read|Write|Delete|AppendTo|Append|Assign|Share)/.exec(
    name,
  )
  return (match?.[1] as PrivilegeAction | undefined) ?? null
}

/**
 * Normalize a `privilegedepthmask` to the single depth it grants. Dataverse
 * stores exactly one bit per roleprivileges row, but defensive callers may
 * hand in combined masks — the DEEPEST wins (Org > Parent > BU > User).
 */
export function depthFromMask(mask: number): PrivilegeDepthMask {
  if (mask & 8) return 8
  if (mask & 4) return 4
  if (mask & 2) return 2
  if (mask & 1) return 1
  return 0
}

/** The deeper of two depths (for aggregating role copies / multiple roles). */
export function maxDepth(
  a: PrivilegeDepthMask,
  b: PrivilegeDepthMask,
): PrivilegeDepthMask {
  return a >= b ? a : b
}

/** Short badge label for a depth (— / U / BU / P / O). */
export function depthShort(depth: PrivilegeDepthMask): string {
  return PRIVILEGE_DEPTHS.find((d) => d.mask === depth)?.short ?? '—'
}

/** Full label for a depth ("Business Unit", …). */
export function depthLabel(depth: PrivilegeDepthMask): string {
  return PRIVILEGE_DEPTHS.find((d) => d.mask === depth)?.label ?? 'None'
}
