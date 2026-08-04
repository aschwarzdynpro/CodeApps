/**
 * Pure comparison logic for the cross-environment Role Comparer. Everything
 * here is a function of the loaded {@link SecurityModel}s — no service, no
 * fetch, no React — so it is fully Vitest-covered.
 */

import {
  PRIVILEGE_ACTIONS,
  type PrivilegeAction,
  type PrivilegeDepthMask,
  type RoleEntityMatrix,
  type SecurityModel,
} from '../types/roles'
import type {
  RoleComparerFilter,
  RoleComparerResult,
  RoleComparerRow,
  RoleEnvState,
  RoleMiscDiffRow,
  RolePrivilegeDiff,
  RolePrivilegeDiffRow,
} from '../types/roleComparer'

/**
 * Match key for a role. Roles are matched by name across environments (see
 * the header of types/roleComparer.ts); trimming and case-folding absorbs the
 * cosmetic differences a hand-rebuilt role tends to pick up.
 */
export function roleMatchKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Canonical, order-independent rendering of a role's whole privilege set.
 * Two roles grant the same rights exactly when their canonical strings are
 * equal — drift is decided on THESE strings, never on a hash, because a hash
 * collision would report "no drift" for a role that actually differs, and a
 * false green is the one failure mode this app refuses (cf. gotcha #13).
 */
export function canonicalPrivileges(
  matrix: RoleEntityMatrix | undefined,
  misc: string[] | undefined,
): string {
  const parts: string[] = []
  if (matrix) {
    for (const entity of [...matrix.keys()].sort()) {
      const actions = matrix.get(entity)
      if (!actions) continue
      for (const action of PRIVILEGE_ACTIONS) {
        const depth = actions.get(action)
        if (depth) parts.push(`${entity}:${action}=${depth}`)
      }
    }
  }
  const miscPart = [...(misc ?? [])].sort().join(',')
  return `${parts.join(';')}|${miscPart}`
}

/** A role's rights in one environment, as needed for counting differences. */
interface Grants {
  matrix?: RoleEntityMatrix
  misc: string[]
}

/**
 * How many privileges two environments grant differently: table grants whose
 * depth deviates (a grant missing on one side counts, its depth being 0) plus
 * misc privileges present on only one side. Symmetric.
 */
export function countPrivilegeDifferences(a: Grants, b: Grants): number {
  const pairs = new Set<string>()
  for (const grants of [a, b]) {
    if (!grants.matrix) continue
    for (const [entity, actions] of grants.matrix) {
      for (const [action, depth] of actions) {
        if (depth) pairs.add(`${entity} ${action}`)
      }
    }
  }
  let differences = 0
  for (const pair of pairs) {
    const [entity, action] = pair.split(' ') as [string, PrivilegeAction]
    const left = a.matrix?.get(entity)?.get(action) ?? 0
    const right = b.matrix?.get(entity)?.get(action) ?? 0
    if (left !== right) differences++
  }
  const miscA = new Set(a.misc)
  const miscB = new Set(b.misc)
  for (const name of new Set([...miscA, ...miscB])) {
    if (miscA.has(name) !== miscB.has(name)) differences++
  }
  return differences
}

/** Number of entity × action grants in a matrix. */
function countGrants(matrix: RoleEntityMatrix | undefined): number {
  if (!matrix) return 0
  let n = 0
  for (const actions of matrix.values()) {
    for (const depth of actions.values()) if (depth) n++
  }
  return n
}

/** An environment's roles indexed by match key. */
interface EnvIndex {
  byKey: Map<
    string,
    { name: string; state: RoleEnvState; canonical: string; matrix?: RoleEntityMatrix; misc: string[] }
  >
}

function indexModel(model: SecurityModel): EnvIndex {
  const byKey = new Map<
    string,
    { name: string; state: RoleEnvState; canonical: string; matrix?: RoleEntityMatrix; misc: string[] }
  >()
  for (const role of model.roles) {
    const matrix = model.matrices.get(role.rootRoleId)
    const misc = model.miscPrivileges.get(role.rootRoleId) ?? []
    const canonical = canonicalPrivileges(matrix, misc)
    byKey.set(roleMatchKey(role.name), {
      name: role.name,
      matrix,
      misc,
      canonical,
      state: {
        present: true,
        rootRoleId: role.rootRoleId,
        isManaged: role.isManaged,
        copyCount: role.copyCount,
        privilegeCount: countGrants(matrix),
        miscCount: misc.length,
        // Filled in once the row's baseline environment is known.
        driftCount: null,
      },
    })
  }
  return { byKey }
}

/** A readable environment where the role simply does not exist. */
function absentState(): RoleEnvState {
  return {
    present: false,
    rootRoleId: '',
    isManaged: false,
    copyCount: 0,
    privilegeCount: 0,
    miscCount: 0,
    driftCount: null,
  }
}

export interface BuildRoleComparisonInput {
  /** Loaded model per environment key; null = the environment failed to load. */
  models: Record<string, SecurityModel | null>
  /** Environment keys in display order. */
  envKeys: string[]
  /** The host environment — decides "missing" vs "extra". */
  hostKey: string
  /** Per-environment load errors, passed through to the result. */
  envErrors: Record<string, string>
  loadedAt: Date
}

/**
 * Build the comparison matrix: one row per role name seen in ANY readable
 * environment, with the per-environment state and the drift flags.
 */
export function buildRoleComparison(
  input: BuildRoleComparisonInput,
): RoleComparerResult {
  const { models, envKeys, hostKey, envErrors, loadedAt } = input
  const indexes = new Map<string, EnvIndex | null>()
  for (const key of envKeys) {
    const model = models[key]
    indexes.set(key, model ? indexModel(model) : null)
  }

  // Every role name seen anywhere, with the host's spelling winning.
  const names = new Map<string, string>()
  for (const key of envKeys) {
    const index = indexes.get(key)
    if (!index) continue
    for (const [matchKey, entry] of index.byKey) {
      if (!names.has(matchKey) || key === hostKey) names.set(matchKey, entry.name)
    }
  }

  const rows: RoleComparerRow[] = []
  for (const [matchKey, name] of names) {
    const byEnv: Record<string, RoleEnvState | null> = {}
    const canonicals: string[] = []
    const rootIds: string[] = []
    const managedFlags: boolean[] = []
    let missingSomewhere = false
    let extraSomewhere = false

    const grantsByEnv = new Map<string, Grants>()
    for (const key of envKeys) {
      const index = indexes.get(key)
      if (!index) {
        byEnv[key] = null
        continue
      }
      const entry = index.byKey.get(matchKey)
      if (!entry) {
        byEnv[key] = absentState()
        continue
      }
      // Copied so the per-row baseline never leaks into another row's state.
      byEnv[key] = { ...entry.state }
      grantsByEnv.set(key, { matrix: entry.matrix, misc: entry.misc })
      canonicals.push(entry.canonical)
      rootIds.push(entry.state.rootRoleId)
      managedFlags.push(entry.state.isManaged)
    }

    // Baseline = the host when it has the role, else the first environment
    // that does; every other environment reports how far it deviates from it.
    const baselineKey = grantsByEnv.has(hostKey)
      ? hostKey
      : (envKeys.find((key) => grantsByEnv.has(key)) ?? null)
    const baseline = baselineKey ? grantsByEnv.get(baselineKey) : undefined
    if (baseline) {
      for (const [key, grants] of grantsByEnv) {
        const cell = byEnv[key]
        if (!cell || key === baselineKey) continue
        cell.driftCount = countPrivilegeDifferences(grants, baseline)
      }
    }

    const inHost = byEnv[hostKey]?.present === true
    for (const key of envKeys) {
      if (key === hostKey) continue
      const cell = byEnv[key]
      if (!cell) continue // unreadable — never counts as a finding
      if (inHost && !cell.present) missingSomewhere = true
      if (!inHost && cell.present) extraSomewhere = true
    }

    rows.push({
      key: matchKey,
      name,
      byEnv,
      drift: new Set(canonicals).size > 1,
      missingSomewhere,
      extraSomewhere,
      identityDrift: new Set(rootIds).size > 1,
      managedDrift: new Set(managedFlags).size > 1,
    })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name))
  return { rows, envErrors, hostKey, envKeys, loadedAt }
}

/** Whether a row has anything worth looking at. */
export function rowHasFinding(row: RoleComparerRow): boolean {
  return (
    row.drift ||
    row.missingSomewhere ||
    row.extraSomewhere ||
    row.identityDrift ||
    row.managedDrift
  )
}

/**
 * Drill-down for one role: every entity × action it grants in any environment,
 * with the depth per environment, plus the misc privileges.
 */
export function buildPrivilegeDiff(
  matchKey: string,
  models: Record<string, SecurityModel | null>,
  envKeys: string[],
): RolePrivilegeDiff {
  // Resolve the role's matrix per environment (matched by name, as everywhere).
  const perEnv = new Map<
    string,
    { matrix?: RoleEntityMatrix; misc: string[] } | null
  >()
  for (const key of envKeys) {
    const model = models[key]
    if (!model) {
      perEnv.set(key, null)
      continue
    }
    const role = model.roles.find((r) => roleMatchKey(r.name) === matchKey)
    if (!role) {
      perEnv.set(key, null)
      continue
    }
    perEnv.set(key, {
      matrix: model.matrices.get(role.rootRoleId),
      misc: model.miscPrivileges.get(role.rootRoleId) ?? [],
    })
  }

  const pairs = new Set<string>()
  const miscNames = new Set<string>()
  for (const entry of perEnv.values()) {
    if (!entry) continue
    if (entry.matrix) {
      for (const [entity, actions] of entry.matrix) {
        for (const [action, depth] of actions) {
          if (depth) pairs.add(`${entity} ${action}`)
        }
      }
    }
    for (const name of entry.misc) miscNames.add(name)
  }

  const privileges: RolePrivilegeDiffRow[] = []
  for (const pair of pairs) {
    const [entity, action] = pair.split(' ') as [string, PrivilegeAction]
    const byEnv: Record<string, PrivilegeDepthMask | null> = {}
    const seen: PrivilegeDepthMask[] = []
    for (const key of envKeys) {
      const entry = perEnv.get(key)
      if (!entry) {
        byEnv[key] = null
        continue
      }
      const depth = (entry.matrix?.get(entity)?.get(action) ?? 0) as PrivilegeDepthMask
      byEnv[key] = depth
      seen.push(depth)
    }
    privileges.push({
      entity,
      action,
      byEnv,
      drift: new Set(seen).size > 1,
    })
  }
  privileges.sort(
    (a, b) =>
      a.entity.localeCompare(b.entity) ||
      PRIVILEGE_ACTIONS.indexOf(a.action) - PRIVILEGE_ACTIONS.indexOf(b.action),
  )

  const misc: RoleMiscDiffRow[] = []
  for (const name of [...miscNames].sort()) {
    const byEnv: Record<string, boolean | null> = {}
    const seen: boolean[] = []
    for (const key of envKeys) {
      const entry = perEnv.get(key)
      if (!entry) {
        byEnv[key] = null
        continue
      }
      const has = entry.misc.includes(name)
      byEnv[key] = has
      seen.push(has)
    }
    misc.push({ name, byEnv, drift: new Set(seen).size > 1 })
  }

  return { privileges, misc }
}

/**
 * Whether a row is a CUSTOM role — unmanaged in at least one environment.
 *
 * "At least one" rather than "in the host" on purpose: a role that is managed
 * in the host but unmanaged in PROD is precisely the kind of finding worth
 * keeping, and a role that only exists in a target would otherwise be dropped
 * before it could be judged.
 */
export function isCustomRow(row: RoleComparerRow): boolean {
  return Object.values(row.byEnv).some(
    (cell) => cell?.present && !cell.isManaged,
  )
}

/** What the scope selector restricts the comparison to. */
export interface RoleScope {
  /** Hide roles that are managed everywhere (the ~250 out-of-the-box ones). */
  customOnly: boolean
  /**
   * Match keys of the roles contained in the selected solution, or null when
   * no solution is selected. Solution membership is a HOST concept — a role
   * that exists only in a target cannot be a member and is filtered out.
   */
  solutionRoleKeys: Set<string> | null
}

/** Narrow the rows to the selected scope, before the filter chips apply. */
export function applyRoleScope(
  rows: RoleComparerRow[],
  scope: RoleScope,
): RoleComparerRow[] {
  return rows.filter((row) => {
    if (scope.solutionRoleKeys && !scope.solutionRoleKeys.has(row.key))
      return false
    // A role that vanished since the baseline exists in no environment, so
    // there is no managed flag left to judge it by. It was in the frozen
    // scope by construction — keep it, or "deleted since the freeze" could
    // never be reported.
    if (row.baseline?.isGone) return true
    if (scope.customOnly && !isCustomRow(row)) return false
    return true
  })
}

/**
 * Resolve solution component object ids (component type 20 rows) to role match
 * keys, using the host environment's model. Ids that no role in the model
 * carries are reported separately rather than silently dropped: they usually
 * mean the component points at a business-unit COPY of the role instead of its
 * root, and swallowing them would quietly shrink the scope.
 */
export function solutionRoleKeysFrom(
  objectIds: string[],
  hostModel: SecurityModel | null,
): { keys: Set<string>; unresolved: number } {
  const keys = new Set<string>()
  if (!hostModel) return { keys, unresolved: objectIds.length }
  const byRootId = new Map(
    hostModel.roles.map((role) => [role.rootRoleId.toLowerCase(), role.name]),
  )
  let unresolved = 0
  for (const id of objectIds) {
    const name = byRootId.get(id.toLowerCase())
    if (name) keys.add(roleMatchKey(name))
    else unresolved++
  }
  return { keys, unresolved }
}

/** Apply the workspace's filter chips and search box. */
export function filterRoleRows(
  rows: RoleComparerRow[],
  filter: RoleComparerFilter,
  search: string,
): RoleComparerRow[] {
  const needle = search.trim().toLowerCase()
  return rows.filter((row) => {
    if (needle && !row.name.toLowerCase().includes(needle)) return false
    switch (filter) {
      case 'drift':
        return row.drift
      case 'missing':
        return row.missingSomewhere || row.extraSomewhere
      case 'identity':
        return row.identityDrift
      case 'managed':
        return row.managedDrift
      // Baseline mode.
      case 'changed':
        return !!row.baseline?.changed
      case 'new':
        return !!row.baseline?.isNew
      case 'gone':
        return !!row.baseline?.isGone
      default:
        return true
    }
  })
}

/** Counters for the filter chips. */
export function roleComparerCounts(rows: RoleComparerRow[]): {
  all: number
  drift: number
  missing: number
  identity: number
  managed: number
} {
  return {
    all: rows.length,
    drift: rows.filter((r) => r.drift).length,
    missing: rows.filter((r) => r.missingSomewhere || r.extraSomewhere).length,
    identity: rows.filter((r) => r.identityDrift).length,
    managed: rows.filter((r) => r.managedDrift).length,
  }
}
