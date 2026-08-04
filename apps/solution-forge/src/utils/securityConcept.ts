/**
 * Security concept document + snapshot diff — the twin of
 * {@link file://../services/releaseNotes} for the security side.
 *
 * Takes a frozen baseline (see `securityBaseline.ts`) and renders it as a
 * readable document, optionally with a "what changed since the previous
 * baseline" chapter. Pure and deterministic (pass `generatedAt`), so the
 * published text is reproducible and the whole thing is Vitest-covered.
 *
 * SCOPE OF v1: a baseline captures roles and their privileges, so that is what
 * the document describes. Business-unit hierarchy, team assignments, field
 * security and audit configuration are NOT in the payload yet and are
 * therefore absent here — see the roadmap. Saying so in the document itself
 * matters: a reader must not mistake "not covered" for "nothing to report".
 */

import { PRIVILEGE_ACTIONS, type PrivilegeAction } from '../types/roles'
import { depthLabel, depthShort } from './privileges'
import {
  decodeBaseline,
  type BaselineGrants,
  type BaselinePayload,
} from './securityBaseline'

export interface SecurityConceptContent {
  markdown: string
  text: string
  /** "3 environments · 34 roles · 12 changed" — also stored with a snapshot. */
  summary: string
}

export interface SecurityConceptMeta {
  /** Baseline name. */
  name: string
  scope: string
  /**
   * Environments to document, reference environment first. May be a subset of
   * what the baseline captured — see {@link allEnvKeys}.
   */
  envKeys: string[]
  /**
   * Everything the baseline captured. When it is wider than {@link envKeys},
   * the document names the omitted environments: a reader must be able to see
   * that PROD was left out rather than assume it had nothing to report.
   */
  allEnvKeys?: string[]
  envLabel: (envKey: string) => string
  frozenOn?: string
  frozenBy?: string
  generatedAt: Date
}

/** One role's change between two baselines, per environment. */
export interface RoleDelta {
  name: string
  kind: 'added' | 'removed' | 'changed'
  /** Human-readable grant changes per environment (only envs that changed). */
  byEnv: { envKey: string; lines: string[] }[]
}

export interface BaselineDiff {
  added: RoleDelta[]
  removed: RoleDelta[]
  changed: RoleDelta[]
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function formatDate(iso?: string): string {
  if (!iso) return 'unknown'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * Human-readable differences between one role's grants at two points in time.
 * `+` gained, `−` lost, `~` depth moved. Misc privileges come last.
 */
export function diffRoleGrants(
  before: BaselineGrants | undefined,
  after: BaselineGrants | undefined,
): string[] {
  const lines: string[] = []
  const pairs = new Set<string>()
  for (const grants of [before, after]) {
    if (!grants?.matrix) continue
    for (const [entity, actions] of grants.matrix) {
      for (const [action, depth] of actions) {
        if (depth) pairs.add(`${entity} ${action}`)
      }
    }
  }
  for (const pair of [...pairs].sort()) {
    const [entity, action] = pair.split(' ') as [string, PrivilegeAction]
    const b = before?.matrix?.get(entity)?.get(action) ?? 0
    const a = after?.matrix?.get(entity)?.get(action) ?? 0
    if (b === a) continue
    if (!b) lines.push(`+ ${entity} ${action} (${depthLabel(a)})`)
    else if (!a) lines.push(`− ${entity} ${action} (was ${depthLabel(b)})`)
    else lines.push(`~ ${entity} ${action}: ${depthLabel(b)} → ${depthLabel(a)}`)
  }
  const miscBefore = new Set(before?.misc ?? [])
  const miscAfter = new Set(after?.misc ?? [])
  for (const name of [...new Set([...miscBefore, ...miscAfter])].sort()) {
    if (miscBefore.has(name) === miscAfter.has(name)) continue
    lines.push(miscAfter.has(name) ? `+ ${name}` : `− ${name}`)
  }
  return lines
}

/**
 * Compare two baselines role by role, environment by environment.
 *
 * `onlyEnvKeys` restricts the comparison to the documented environments — a
 * document that leaves PROD out must not report PROD's changes, and a role
 * that exists only there must not show up as "added".
 */
export function diffBaselines(
  before: BaselinePayload,
  after: BaselinePayload,
  onlyEnvKeys?: string[],
): BaselineDiff {
  const b = decodeBaseline(before)
  const a = decodeBaseline(after)
  const wanted = onlyEnvKeys ? new Set(onlyEnvKeys) : null
  const envKeys = [...new Set([...b.keys(), ...a.keys()])].filter(
    (key) => !wanted || wanted.has(key),
  )

  const names = new Map<string, string>()
  const inBefore = new Set<string>()
  const inAfter = new Set<string>()
  for (const [payload, target] of [
    [before, inBefore],
    [after, inAfter],
  ] as const) {
    for (const [envKey, roles] of Object.entries(payload.envs ?? {})) {
      if (wanted && !wanted.has(envKey)) continue
      for (const role of roles ?? []) {
        const key = role.n.trim().toLowerCase().replace(/\s+/g, ' ')
        target.add(key)
        if (!names.has(key)) names.set(key, role.n)
      }
    }
  }

  const diff: BaselineDiff = { added: [], removed: [], changed: [] }
  for (const [key, name] of names) {
    const wasThere = inBefore.has(key)
    const isThere = inAfter.has(key)
    if (!wasThere && isThere) {
      diff.added.push({ name, kind: 'added', byEnv: [] })
      continue
    }
    if (wasThere && !isThere) {
      diff.removed.push({ name, kind: 'removed', byEnv: [] })
      continue
    }
    const byEnv: RoleDelta['byEnv'] = []
    for (const envKey of envKeys) {
      const lines = diffRoleGrants(b.get(envKey)?.get(key), a.get(envKey)?.get(key))
      if (lines.length) byEnv.push({ envKey, lines })
    }
    if (byEnv.length) diff.changed.push({ name, kind: 'changed', byEnv })
  }
  const byName = (x: RoleDelta, y: RoleDelta) => x.name.localeCompare(y.name)
  diff.added.sort(byName)
  diff.removed.sort(byName)
  diff.changed.sort(byName)
  return diff
}

/** Entities a role grants anything on, sorted. */
function entitiesOf(grants: BaselineGrants | undefined): string[] {
  if (!grants?.matrix) return []
  const names: string[] = []
  for (const [entity, actions] of grants.matrix) {
    for (const depth of actions.values()) {
      if (depth) {
        names.push(entity)
        break
      }
    }
  }
  return names.sort()
}

/**
 * Render a baseline as a document. When `previous` is given, a "changes since"
 * chapter is placed BEFORE the inventory — that is the part a reviewer reads.
 */
export function buildSecurityConcept(
  payload: BaselinePayload,
  meta: SecurityConceptMeta,
  previous?: { payload: BaselinePayload; name: string; frozenOn?: string } | null,
): SecurityConceptContent {
  const decoded = decodeBaseline(payload)
  const envKeys = meta.envKeys.filter((key) => decoded.has(key))
  // The reference environment carries the matrices in the inventory; the
  // others are reported as deviations so the document does not triple in size.
  const referenceKey = envKeys[0] ?? ''
  const reference = decoded.get(referenceKey) ?? new Map<string, BaselineGrants>()

  // Only roles that live in a DOCUMENTED environment — otherwise excluding an
  // environment would still list the roles that exist only there.
  const roleKeys = new Set<string>()
  for (const envKey of envKeys)
    for (const key of decoded.get(envKey)?.keys() ?? []) roleKeys.add(key)
  const roleNames = new Map<string, string>()
  for (const [envKey, roles] of Object.entries(payload.envs ?? {})) {
    if (!envKeys.includes(envKey)) continue
    for (const role of roles ?? []) {
      const key = role.n.trim().toLowerCase().replace(/\s+/g, ' ')
      if (!roleNames.has(key)) roleNames.set(key, role.n)
    }
  }
  const sortedRoles = [...roleKeys].sort((x, y) =>
    (roleNames.get(x) ?? x).localeCompare(roleNames.get(y) ?? y),
  )

  const diff = previous
    ? diffBaselines(previous.payload, payload, envKeys)
    : null
  const changedCount = diff
    ? diff.added.length + diff.removed.length + diff.changed.length
    : 0

  const md: string[] = []
  const tx: string[] = []
  const both = (markdown: string, text = markdown) => {
    md.push(markdown)
    tx.push(text)
  }

  both(`# Security concept — ${meta.name}`, `SECURITY CONCEPT — ${meta.name}`)
  both('')
  both(
    `_Frozen ${formatDate(meta.frozenOn)}${meta.frozenBy ? ` by ${meta.frozenBy}` : ''} · Scope: ${meta.scope} · Generated ${meta.generatedAt.toLocaleString()}_`,
    `Frozen ${formatDate(meta.frozenOn)}${meta.frozenBy ? ` by ${meta.frozenBy}` : ''} | Scope: ${meta.scope} | Generated ${meta.generatedAt.toLocaleString()}`,
  )
  both('')
  both(
    '> Covers security roles and their privileges. Business units, team assignments, field-level security and audit settings are **not** part of this baseline — their absence here is not a statement about them.',
    'NOTE: Covers security roles and their privileges. Business units, team assignments, field-level security and audit settings are NOT part of this baseline — their absence here is not a statement about them.',
  )
  const omitted = (meta.allEnvKeys ?? []).filter(
    (key) => !envKeys.includes(key),
  )
  if (omitted.length) {
    both('')
    both(
      `> ⚠ The baseline also covers ${omitted.map(meta.envLabel).join(', ')} — deliberately **left out** of this document.`,
      `NOTE: The baseline also covers ${omitted.map(meta.envLabel).join(', ')} — deliberately left out of this document.`,
    )
  }
  both('')

  // --- Overview -------------------------------------------------------------
  both('## Environments', 'ENVIRONMENTS')
  both('')
  md.push('| Environment | Roles | Custom | Managed |')
  md.push('| --- | ---: | ---: | ---: |')
  for (const envKey of envKeys) {
    const roles = [...(decoded.get(envKey)?.values() ?? [])]
    const managed = roles.filter((r) => r.isManaged).length
    md.push(
      `| ${meta.envLabel(envKey)}${envKey === referenceKey ? ' *(reference)*' : ''} | ${roles.length} | ${roles.length - managed} | ${managed} |`,
    )
    tx.push(
      `  ${meta.envLabel(envKey)}${envKey === referenceKey ? ' (reference)' : ''}: ${roles.length} roles, ${roles.length - managed} custom, ${managed} managed`,
    )
  }
  both('')

  // --- Changes --------------------------------------------------------------
  if (diff && previous) {
    both(
      `## Changes since “${previous.name}” (${formatDate(previous.frozenOn)})`,
      `CHANGES SINCE "${previous.name}" (${formatDate(previous.frozenOn)})`,
    )
    both('')
    if (!changedCount) {
      both('No role or privilege changed.', '  No role or privilege changed.')
      both('')
    }
    if (diff.added.length) {
      both('### Roles added', 'Roles added:')
      for (const role of diff.added) both(`- **${role.name}**`, `  + ${role.name}`)
      both('')
    }
    if (diff.removed.length) {
      both('### Roles removed', 'Roles removed:')
      for (const role of diff.removed) both(`- **${role.name}**`, `  - ${role.name}`)
      both('')
    }
    if (diff.changed.length) {
      both('### Privileges changed', 'Privileges changed:')
      for (const role of diff.changed) {
        both(`- **${role.name}**`, `  ${role.name}`)
        for (const env of role.byEnv) {
          both(`  - ${meta.envLabel(env.envKey)}:`, `    ${meta.envLabel(env.envKey)}:`)
          for (const line of env.lines)
            both(`    - \`${line}\``, `      ${line}`)
        }
      }
      both('')
    }
  }

  // --- Inventory ------------------------------------------------------------
  both('## Roles', 'ROLES')
  both('')
  for (const key of sortedRoles) {
    const name = roleNames.get(key) ?? key
    const here = reference.get(key)
    const presentIn = envKeys.filter((envKey) => decoded.get(envKey)?.has(key))
    const deviations = envKeys
      .filter((envKey) => envKey !== referenceKey && decoded.get(envKey)?.has(key))
      .map((envKey) => ({
        envKey,
        count: diffRoleGrants(here, decoded.get(envKey)?.get(key)).length,
      }))
      .filter((d) => d.count > 0)

    both(`### ${name}`, `  ${name}`)
    both(
      `${here?.isManaged ? 'Managed' : 'Custom (unmanaged)'} · present in ${presentIn.map(meta.envLabel).join(', ') || '—'}`,
      `    ${here?.isManaged ? 'Managed' : 'Custom (unmanaged)'} | present in ${presentIn.map(meta.envLabel).join(', ') || '—'}`,
    )
    both('')
    const entities = entitiesOf(here)
    if (!entities.length) {
      both(
        '_No table privileges in the reference environment._',
        '    (no table privileges in the reference environment)',
      )
      both('')
    } else {
      md.push(`| Table | ${PRIVILEGE_ACTIONS.join(' | ')} |`)
      md.push(`| --- | ${PRIVILEGE_ACTIONS.map(() => ':-:').join(' | ')} |`)
      for (const entity of entities) {
        const cells = PRIVILEGE_ACTIONS.map((action) => {
          const depth = here?.matrix?.get(entity)?.get(action) ?? 0
          return depth ? depthShort(depth) : '·'
        })
        md.push(`| \`${entity}\` | ${cells.join(' | ')} |`)
        tx.push(`      ${entity}: ${cells.join(' ')}`)
      }
      md.push('')
      tx.push('')
    }
    if (here?.misc.length) {
      both(
        `Other privileges: ${here.misc.map((m) => `\`${m}\``).join(', ')}`,
        `    Other privileges: ${here.misc.join(', ')}`,
      )
      both('')
    }
    if (deviations.length) {
      both(
        `⚠ Differs from the reference: ${deviations.map((d) => `${meta.envLabel(d.envKey)} (${plural(d.count, 'privilege')})`).join(', ')}`,
        `    ! Differs from the reference: ${deviations.map((d) => `${meta.envLabel(d.envKey)} (${plural(d.count, 'privilege')})`).join(', ')}`,
      )
      both('')
    }
  }

  md.push(
    `_Depth: ${PRIVILEGE_ACTIONS.length} actions per table; U = User, BU = Business Unit, P = Parent-Child BUs, O = Organization, · = not granted._`,
  )
  tx.push('  Depth: U = User, BU = Business Unit, P = Parent-Child BUs, O = Organization, · = not granted.')

  const summary = [
    plural(envKeys.length, 'environment'),
    plural(sortedRoles.length, 'role'),
    diff ? `${changedCount} changed` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return { markdown: md.join('\n'), text: tx.join('\n'), summary }
}
