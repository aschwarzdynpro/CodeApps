/**
 * Frozen security baselines — encoding, decoding and the "what changed since
 * we froze it?" verdict. Pure functions only, so all of it is Vitest-covered.
 *
 * WHAT A BASELINE ANSWERS. It captures the compared environments AS THEY WERE
 * at one point in time, and every environment is later compared against its
 * OWN frozen self: "has PROD changed since the audit?". That is deliberately
 * not the Flow Comparer's definition mode, where one desired state applies to
 * every environment — for roles the useful governance question is drift over
 * TIME, and it is also the diff a security-concept document needs.
 *
 * STORAGE. One `pro_securitysnapshot` row holds the whole thing as compact
 * JSON in a single multiline column (the same one-column-instead-of-a-child-
 * table choice as `pro_mergerun.pro_addedcomponents_txt`). Grants are stored
 * as `[entityIndex, actionIndex, depth]` triples against a shared entity
 * dictionary, which is what keeps a few dozen roles × three environments well
 * inside the column limit. {@link baselineSizeVerdict} guards the limit at
 * save time — a baseline that does not fit is REFUSED, never truncated: a
 * silently shortened baseline would report every dropped role as unchanged.
 */

import {
  PRIVILEGE_ACTIONS,
  type PrivilegeAction,
  type PrivilegeDepthMask,
  type RoleEntityMatrix,
  type SecurityModel,
} from '../types/roles'
import type {
  RoleBaselineVerdict,
  RoleComparerResult,
  RoleComparerRow,
} from '../types/roleComparer'
import { countPrivilegeDifferences, roleMatchKey } from './roleCompare'

/**
 * Payload version. v2 added the org / field-security / audit sections. They
 * are OPTIONAL and read defensively, so a v1 baseline still decodes — the
 * document then reports those chapters as "not captured", which is not the
 * same as "nothing to report".
 */
export const BASELINE_VERSION = 2

/**
 * Dataverse multiline columns hold 1,048,576 characters; we refuse a little
 * below that so an encoding tweak cannot silently push a working baseline over
 * the edge.
 */
export const BASELINE_MAX_CHARS = 900_000

/** One role as stored in a baseline. Keys are short — this gets repeated a lot. */
export interface BaselineRole {
  /** Role name; the match key is derived from it. */
  n: string
  /** Root role id at freeze time. */
  i: string
  /** Managed flag. */
  m: 0 | 1
  /** Grants as [entityIndex, actionIndex, depth]. */
  g: [number, number, number][]
  /** Misc (non-table) privilege names. */
  x: string[]
}

/** One business unit in the frozen org tree. Parents are stored by NAME —
 *  ids mean nothing in a document and nothing across environments. */
export interface BaselineBu {
  n: string
  /** Parent BU name; '' for the root. */
  p: string
  /** Users whose owning BU this is. */
  u: number
}

export interface BaselineTeam {
  n: string
  /** Owning business-unit name. */
  bu: string
  /** team.teamtype. */
  t: number
  /** Names of the security roles the team grants. */
  r: string[]
  /** Member count (names are not frozen — a review looks at roles). */
  m: number
}

export interface BaselineOrg {
  bus: BaselineBu[]
  teams: BaselineTeam[]
}

/** One field-security profile: which columns it secures and who holds it. */
export interface BaselineFlsProfile {
  n: string
  m: 0 | 1
  /** Secured columns: entity, attribute, read/create/update/unmasked. */
  c: { e: string; a: string; r: 0 | 1; w: 0 | 1; u: 0 | 1; x: 0 | 1 }[]
  /** Assigned user / team counts. */
  au: number
  at: number
}

export interface BaselineAudit {
  /** Org-wide master switch. */
  on: 0 | 1
  /** Retention in days; -1 = forever. */
  ret: number
  /** Logical names of the tables with auditing enabled. */
  tables: string[]
  /** Tables inspected in total, so "12 of 480" is expressible. */
  total: number
}

export interface BaselinePayload {
  v: number
  /** Entity dictionary — grants reference entities by index. */
  e: string[]
  /** Roles per environment key. */
  envs: Record<string, BaselineRole[]>
  /** Business units + teams per environment (v2). */
  org?: Record<string, BaselineOrg>
  /** Field-security profiles per environment (v2). */
  fls?: Record<string, BaselineFlsProfile[]>
  /** Audit configuration per environment (v2). */
  audit?: Record<string, BaselineAudit>
}

/**
 * The non-role material captured alongside the roles. Sections are optional
 * per environment: a read that failed is left OUT rather than stored empty,
 * because an empty section reads as "there is none".
 */
export interface BaselineExtras {
  org?: BaselineOrg
  fls?: BaselineFlsProfile[]
  audit?: BaselineAudit
}

/** A role's rights in one environment, in the shape the comparer counts on. */
export interface BaselineGrants {
  matrix?: RoleEntityMatrix
  misc: string[]
  rootRoleId: string
  isManaged: boolean
}

/**
 * Encode the given environments' models into a baseline payload. `includeKeys`
 * restricts the capture to the roles currently in scope (null = everything) —
 * freezing exactly what the user was looking at is both smaller and easier to
 * reason about than freezing all ~286 roles.
 */
export function encodeBaseline(
  models: Record<string, SecurityModel | null>,
  envKeys: string[],
  includeKeys: Set<string> | null,
  /** Org / field-security / audit material per environment, when captured. */
  extras?: Record<string, BaselineExtras>,
): BaselinePayload {
  const entityIndex = new Map<string, number>()
  const entities: string[] = []
  const indexOfEntity = (name: string): number => {
    const known = entityIndex.get(name)
    if (known !== undefined) return known
    const next = entities.length
    entities.push(name)
    entityIndex.set(name, next)
    return next
  }

  const envs: Record<string, BaselineRole[]> = {}
  for (const envKey of envKeys) {
    const model = models[envKey]
    // An environment that could not be read is simply not captured. It must
    // not appear as an empty environment, which would later read as "every
    // role was deleted there".
    if (!model) continue
    const roles: BaselineRole[] = []
    for (const role of model.roles) {
      const key = roleMatchKey(role.name)
      if (includeKeys && !includeKeys.has(key)) continue
      const matrix = model.matrices.get(role.rootRoleId)
      const grants: [number, number, number][] = []
      if (matrix) {
        for (const [entity, actions] of matrix) {
          for (const [action, depth] of actions) {
            if (!depth) continue
            grants.push([
              indexOfEntity(entity),
              PRIVILEGE_ACTIONS.indexOf(action),
              depth,
            ])
          }
        }
      }
      roles.push({
        n: role.name,
        i: role.rootRoleId,
        m: role.isManaged ? 1 : 0,
        g: grants,
        x: [...(model.miscPrivileges.get(role.rootRoleId) ?? [])],
      })
    }
    envs[envKey] = roles
  }

  const payload: BaselinePayload = { v: BASELINE_VERSION, e: entities, envs }

  // Sections are only written when they were actually captured — see
  // BaselineExtras on why an absent section beats an empty one.
  const org: Record<string, BaselineOrg> = {}
  const fls: Record<string, BaselineFlsProfile[]> = {}
  const audit: Record<string, BaselineAudit> = {}
  for (const envKey of envKeys) {
    const extra = extras?.[envKey]
    if (!extra) continue
    if (extra.org) org[envKey] = extra.org
    if (extra.fls) fls[envKey] = extra.fls
    if (extra.audit) audit[envKey] = extra.audit
  }
  if (Object.keys(org).length) payload.org = org
  if (Object.keys(fls).length) payload.fls = fls
  if (Object.keys(audit).length) payload.audit = audit
  return payload
}

export function serializeBaseline(payload: BaselinePayload): string {
  return JSON.stringify(payload)
}

/**
 * Whether a serialized baseline fits the storage column. Returns the reason
 * when it does not, so the caller can tell the user how to make it smaller.
 */
export function baselineSizeVerdict(serialized: string): {
  ok: boolean
  chars: number
  message?: string
} {
  if (serialized.length <= BASELINE_MAX_CHARS)
    return { ok: true, chars: serialized.length }
  return {
    ok: false,
    chars: serialized.length,
    message:
      `The baseline is ${serialized.length.toLocaleString()} characters and does not fit ` +
      `the storage column (limit ${BASELINE_MAX_CHARS.toLocaleString()}). Narrow the scope — ` +
      `pick a release solution, or leave system roles out — and freeze again. ` +
      `It is not saved truncated, because the roles that fell off would later ` +
      `look unchanged.`,
  }
}

/** Parse a stored payload. Never throws — a corrupt row yields null. */
export function parseBaseline(json: string | undefined | null): BaselinePayload | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Partial<BaselinePayload>
    if (!Array.isArray(candidate.e) || !candidate.envs) return null
    if (typeof candidate.envs !== 'object') return null
    const section = <T,>(value: unknown): Record<string, T> | undefined =>
      value && typeof value === 'object' ? (value as Record<string, T>) : undefined
    return {
      v: typeof candidate.v === 'number' ? candidate.v : 0,
      e: candidate.e.filter((x): x is string => typeof x === 'string'),
      envs: candidate.envs as Record<string, BaselineRole[]>,
      // Absent on v1 payloads — the document reports those chapters as
      // "not captured" rather than pretending they were empty.
      org: section<BaselineOrg>(candidate.org),
      fls: section<BaselineFlsProfile[]>(candidate.fls),
      audit: section<BaselineAudit>(candidate.audit),
    }
  } catch {
    return null
  }
}

/** Decode a payload into per-environment, per-role grants. */
export function decodeBaseline(
  payload: BaselinePayload,
): Map<string, Map<string, BaselineGrants>> {
  const byEnv = new Map<string, Map<string, BaselineGrants>>()
  for (const [envKey, roles] of Object.entries(payload.envs ?? {})) {
    const byRole = new Map<string, BaselineGrants>()
    for (const role of roles ?? []) {
      const matrix: RoleEntityMatrix = new Map()
      for (const [entityIdx, actionIdx, depth] of role.g ?? []) {
        const entity = payload.e[entityIdx]
        const action = PRIVILEGE_ACTIONS[actionIdx] as PrivilegeAction | undefined
        if (!entity || !action || !depth) continue
        const actions =
          matrix.get(entity) ?? new Map<PrivilegeAction, PrivilegeDepthMask>()
        actions.set(action, depth as PrivilegeDepthMask)
        matrix.set(entity, actions)
      }
      byRole.set(roleMatchKey(role.n), {
        matrix,
        misc: [...(role.x ?? [])],
        rootRoleId: role.i ?? '',
        isManaged: role.m === 1,
      })
    }
    byEnv.set(envKey, byRole)
  }
  return byEnv
}

/** The role's current grants in one environment, or null when it is absent. */
function currentGrants(
  model: SecurityModel | null,
  matchKey: string,
): { matrix?: RoleEntityMatrix; misc: string[] } | null {
  if (!model) return null
  const role = model.roles.find((r) => roleMatchKey(r.name) === matchKey)
  if (!role) return null
  return {
    matrix: model.matrices.get(role.rootRoleId),
    misc: model.miscPrivileges.get(role.rootRoleId) ?? [],
  }
}

/**
 * Attach the baseline verdict to every row, and append rows for roles the
 * baseline knew that no environment has any more.
 *
 * Environments the baseline did not capture yield `null` rather than 0 — an
 * uncaptured environment is unknown, not unchanged.
 */
export function applyBaselineVerdict(
  result: RoleComparerResult,
  models: Record<string, SecurityModel | null>,
  payload: BaselinePayload,
): RoleComparerResult {
  const baseline = decodeBaseline(payload)
  const seen = new Set<string>()

  const rows: RoleComparerRow[] = result.rows.map((row) => {
    seen.add(row.key)
    const changedByEnv: Record<string, number | null> = {}
    let changed = false
    let inBaseline = false

    for (const envKey of result.envKeys) {
      const frozen = baseline.get(envKey)?.get(row.key)
      const now = currentGrants(models[envKey] ?? null, row.key)
      if (frozen) inBaseline = true
      if (!frozen || !now) {
        // Either the baseline never captured this (env, role), or the role is
        // not there now. Both are "nothing to compare", reported as unknown;
        // presence changes are carried by isNew / isGone and the row's own
        // missing/target-only flags.
        changedByEnv[envKey] = null
        continue
      }
      const differences = countPrivilegeDifferences(now, frozen)
      changedByEnv[envKey] = differences
      if (differences > 0) changed = true
    }

    const verdict: RoleBaselineVerdict = {
      changedByEnv,
      changed,
      isNew: !inBaseline,
      isGone: false,
    }
    return { ...row, baseline: verdict }
  })

  // Roles the baseline captured that no environment reports any more.
  const goneKeys = new Set<string>()
  for (const byRole of baseline.values()) {
    for (const key of byRole.keys()) if (!seen.has(key)) goneKeys.add(key)
  }
  for (const key of goneKeys) {
    let name = key
    for (const byRole of baseline.values()) {
      const frozen = byRole.get(key)
      if (frozen) {
        // The payload keeps the original spelling; recover it for display.
        const fromPayload = Object.values(payload.envs)
          .flat()
          .find((role) => roleMatchKey(role.n) === key)
        if (fromPayload) name = fromPayload.n
        break
      }
    }
    const byEnv: RoleComparerRow['byEnv'] = {}
    const changedByEnv: Record<string, number | null> = {}
    for (const envKey of result.envKeys) {
      byEnv[envKey] = {
        present: false,
        rootRoleId: '',
        isManaged: false,
        copyCount: 0,
        privilegeCount: 0,
        miscCount: 0,
        driftCount: null,
      }
      changedByEnv[envKey] = null
    }
    rows.push({
      key,
      name,
      byEnv,
      drift: false,
      missingSomewhere: false,
      extraSomewhere: false,
      identityDrift: false,
      managedDrift: false,
      baseline: { changedByEnv, changed: false, isNew: false, isGone: true },
    })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name))
  return { ...result, rows }
}

/** Counters for the baseline-mode filter chips. */
export function baselineCounts(rows: RoleComparerRow[]): {
  changed: number
  added: number
  gone: number
} {
  return {
    changed: rows.filter((r) => r.baseline?.changed).length,
    added: rows.filter((r) => r.baseline?.isNew).length,
    gone: rows.filter((r) => r.baseline?.isGone).length,
  }
}
