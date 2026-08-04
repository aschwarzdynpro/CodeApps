/**
 * Security concept document + snapshot diff — the twin of
 * {@link file://../services/releaseNotes} for the security side.
 *
 * Takes a frozen baseline (see `securityBaseline.ts`) and produces a
 * STRUCTURED model first; Markdown and plain text are rendered from that same
 * model, and the panel renders it as real HTML. That indirection is the point:
 * the on-screen document is a document, not a wall of Markdown source, and the
 * three representations cannot drift apart because there is one builder.
 *
 * Pure and deterministic (pass `generatedAt`), so the output is reproducible
 * and the whole thing is Vitest-covered.
 *
 * SCOPE OF v1: a baseline captures roles and their privileges, so that is what
 * the document describes. Business-unit hierarchy, team assignments, field
 * security and audit configuration are NOT in the payload yet and are
 * therefore absent here — see the roadmap. The document says so itself: a
 * reader must not mistake "not covered" for "nothing to report".
 */

import { PRIVILEGE_ACTIONS, type PrivilegeAction } from '../types/roles'
import { depthLabel, depthShort } from './privileges'
import {
  decodeBaseline,
  type BaselineGrants,
  type BaselinePayload,
} from './securityBaseline'

export interface SecurityConceptContent {
  /** Structured document — what the UI renders. */
  model: ConceptDoc
  markdown: string
  text: string
  /** "3 environments · 34 roles · 12 changed" — also shown next to the picker. */
  summary: string
}

export interface ConceptEnvRow {
  label: string
  isReference: boolean
  roles: number
  custom: number
  managed: number
}

export interface ConceptRoleSection {
  name: string
  managed: boolean
  /** Environment labels the role exists in. */
  presentIn: string[]
  /** One row per table; `depths` aligns with PRIVILEGE_ACTIONS, '' = none. */
  grants: { entity: string; depths: string[] }[]
  misc: string[]
  /** Environments whose grants differ from the reference, with the count. */
  deviations: { label: string; count: number }[]
}

export interface ConceptChanges {
  previousName: string
  previousOn?: string
  added: string[]
  removed: string[]
  changed: { name: string; byEnv: { label: string; lines: string[] }[] }[]
}

export interface ConceptDoc {
  title: string
  scope: string
  frozenOn?: string
  frozenBy?: string
  generatedAt: Date
  /** Statements about what this document does NOT cover. */
  disclaimers: string[]
  environments: ConceptEnvRow[]
  changes: ConceptChanges | null
  roles: ConceptRoleSection[]
  /** Legend for the depth codes. */
  legend: string
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

const roleKeyOf = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, ' ')

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
        const key = roleKeyOf(role.n)
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

/** Build the structured document. Markdown and text are rendered from this. */
export function buildConceptDoc(
  payload: BaselinePayload,
  meta: SecurityConceptMeta,
  previous?: { payload: BaselinePayload; name: string; frozenOn?: string } | null,
): ConceptDoc {
  const decoded = decodeBaseline(payload)
  const envKeys = meta.envKeys.filter((key) => decoded.has(key))
  // The reference environment carries the matrices; the others are reported as
  // deviations so the document does not multiply by the number of environments.
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
      const key = roleKeyOf(role.n)
      if (!roleNames.has(key)) roleNames.set(key, role.n)
    }
  }
  const sortedRoles = [...roleKeys].sort((x, y) =>
    (roleNames.get(x) ?? x).localeCompare(roleNames.get(y) ?? y),
  )

  const disclaimers = [
    'Covers security roles and their privileges. Business units, team assignments, field-level security and audit settings are not part of this baseline — their absence here is not a statement about them.',
  ]
  const omitted = (meta.allEnvKeys ?? []).filter((key) => !envKeys.includes(key))
  if (omitted.length)
    disclaimers.push(
      `The baseline also covers ${omitted.map(meta.envLabel).join(', ')} — deliberately left out of this document.`,
    )

  const environments: ConceptEnvRow[] = envKeys.map((envKey) => {
    const roles = [...(decoded.get(envKey)?.values() ?? [])]
    const managed = roles.filter((r) => r.isManaged).length
    return {
      label: meta.envLabel(envKey),
      isReference: envKey === referenceKey,
      roles: roles.length,
      custom: roles.length - managed,
      managed,
    }
  })

  const diff = previous ? diffBaselines(previous.payload, payload, envKeys) : null
  const changes: ConceptChanges | null =
    diff && previous
      ? {
          previousName: previous.name,
          previousOn: previous.frozenOn,
          added: diff.added.map((r) => r.name),
          removed: diff.removed.map((r) => r.name),
          changed: diff.changed.map((role) => ({
            name: role.name,
            byEnv: role.byEnv.map((env) => ({
              label: meta.envLabel(env.envKey),
              lines: env.lines,
            })),
          })),
        }
      : null

  const roles: ConceptRoleSection[] = sortedRoles.map((key) => {
    const here = reference.get(key)
    return {
      name: roleNames.get(key) ?? key,
      managed: !!here?.isManaged,
      presentIn: envKeys
        .filter((envKey) => decoded.get(envKey)?.has(key))
        .map(meta.envLabel),
      grants: entitiesOf(here).map((entity) => ({
        entity,
        depths: PRIVILEGE_ACTIONS.map((action) => {
          const depth = here?.matrix?.get(entity)?.get(action) ?? 0
          return depth ? depthShort(depth) : ''
        }),
      })),
      misc: [...(here?.misc ?? [])],
      deviations: envKeys
        .filter((envKey) => envKey !== referenceKey && decoded.get(envKey)?.has(key))
        .map((envKey) => ({
          label: meta.envLabel(envKey),
          count: diffRoleGrants(here, decoded.get(envKey)?.get(key)).length,
        }))
        .filter((d) => d.count > 0),
    }
  })

  return {
    title: `Security concept — ${meta.name}`,
    scope: meta.scope,
    frozenOn: meta.frozenOn,
    frozenBy: meta.frozenBy,
    generatedAt: meta.generatedAt,
    disclaimers,
    environments,
    changes,
    roles,
    legend:
      'U = User, BU = Business Unit, P = Parent-Child BUs, O = Organization, · = not granted.',
  }
}

function subtitle(doc: ConceptDoc): string {
  return `Frozen ${formatDate(doc.frozenOn)}${doc.frozenBy ? ` by ${doc.frozenBy}` : ''} · Scope: ${doc.scope} · Generated ${doc.generatedAt.toLocaleString()}`
}

/** Markdown rendering of the structured document. */
export function renderConceptMarkdown(doc: ConceptDoc): string {
  const out: string[] = []
  out.push(`# ${doc.title}`, '', `_${subtitle(doc)}_`, '')
  for (const line of doc.disclaimers) out.push(`> ${line}`, '')

  out.push('## Environments', '')
  out.push('| Environment | Roles | Custom | Managed |')
  out.push('| --- | ---: | ---: | ---: |')
  for (const env of doc.environments)
    out.push(
      `| ${env.label}${env.isReference ? ' *(reference)*' : ''} | ${env.roles} | ${env.custom} | ${env.managed} |`,
    )
  out.push('')

  if (doc.changes) {
    out.push(
      `## Changes since “${doc.changes.previousName}” (${formatDate(doc.changes.previousOn)})`,
      '',
    )
    const { added, removed, changed } = doc.changes
    if (!added.length && !removed.length && !changed.length)
      out.push('No role or privilege changed.', '')
    if (added.length) {
      out.push('### Roles added')
      for (const name of added) out.push(`- **${name}**`)
      out.push('')
    }
    if (removed.length) {
      out.push('### Roles removed')
      for (const name of removed) out.push(`- **${name}**`)
      out.push('')
    }
    if (changed.length) {
      out.push('### Privileges changed')
      for (const role of changed) {
        out.push(`- **${role.name}**`)
        for (const env of role.byEnv) {
          out.push(`  - ${env.label}:`)
          for (const line of env.lines) out.push(`    - \`${line}\``)
        }
      }
      out.push('')
    }
  }

  out.push('## Roles', '')
  for (const role of doc.roles) {
    out.push(`### ${role.name}`)
    out.push(
      `${role.managed ? 'Managed' : 'Custom (unmanaged)'} · present in ${role.presentIn.join(', ') || '—'}`,
      '',
    )
    if (!role.grants.length) {
      out.push('_No table privileges in the reference environment._', '')
    } else {
      out.push(`| Table | ${PRIVILEGE_ACTIONS.join(' | ')} |`)
      out.push(`| --- | ${PRIVILEGE_ACTIONS.map(() => ':-:').join(' | ')} |`)
      for (const row of role.grants)
        out.push(
          `| \`${row.entity}\` | ${row.depths.map((d) => d || '·').join(' | ')} |`,
        )
      out.push('')
    }
    if (role.misc.length)
      out.push(
        `Other privileges: ${role.misc.map((m) => `\`${m}\``).join(', ')}`,
        '',
      )
    if (role.deviations.length)
      out.push(
        `⚠ Differs from the reference: ${role.deviations.map((d) => `${d.label} (${plural(d.count, 'privilege')})`).join(', ')}`,
        '',
      )
  }
  out.push(`_Depth: ${doc.legend}_`)
  return out.join('\n')
}

/** Plain-text rendering, for pasting where Markdown is not understood. */
export function renderConceptText(doc: ConceptDoc): string {
  const out: string[] = []
  out.push(doc.title.toUpperCase(), '', subtitle(doc), '')
  for (const line of doc.disclaimers) out.push(`NOTE: ${line}`, '')

  out.push('ENVIRONMENTS', '')
  for (const env of doc.environments)
    out.push(
      `  ${env.label}${env.isReference ? ' (reference)' : ''}: ${env.roles} roles, ${env.custom} custom, ${env.managed} managed`,
    )
  out.push('')

  if (doc.changes) {
    out.push(
      `CHANGES SINCE "${doc.changes.previousName}" (${formatDate(doc.changes.previousOn)})`,
      '',
    )
    const { added, removed, changed } = doc.changes
    if (!added.length && !removed.length && !changed.length)
      out.push('  No role or privilege changed.', '')
    if (added.length) {
      out.push('Roles added:')
      for (const name of added) out.push(`  + ${name}`)
      out.push('')
    }
    if (removed.length) {
      out.push('Roles removed:')
      for (const name of removed) out.push(`  - ${name}`)
      out.push('')
    }
    if (changed.length) {
      out.push('Privileges changed:')
      for (const role of changed) {
        out.push(`  ${role.name}`)
        for (const env of role.byEnv) {
          out.push(`    ${env.label}:`)
          for (const line of env.lines) out.push(`      ${line}`)
        }
      }
      out.push('')
    }
  }

  out.push('ROLES', '')
  for (const role of doc.roles) {
    out.push(`  ${role.name}`)
    out.push(
      `    ${role.managed ? 'Managed' : 'Custom (unmanaged)'} | present in ${role.presentIn.join(', ') || '—'}`,
      '',
    )
    if (!role.grants.length) {
      out.push('    (no table privileges in the reference environment)', '')
    } else {
      for (const row of role.grants)
        out.push(
          `      ${row.entity}: ${row.depths.map((d) => d || '·').join(' ')}`,
        )
      out.push('')
    }
    if (role.misc.length)
      out.push(`    Other privileges: ${role.misc.join(', ')}`, '')
    if (role.deviations.length)
      out.push(
        `    ! Differs from the reference: ${role.deviations.map((d) => `${d.label} (${plural(d.count, 'privilege')})`).join(', ')}`,
        '',
      )
  }
  out.push(`  Depth: ${doc.legend}`)
  return out.join('\n')
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
  const model = buildConceptDoc(payload, meta, previous)
  const changedCount = model.changes
    ? model.changes.added.length +
      model.changes.removed.length +
      model.changes.changed.length
    : 0
  const summary = [
    plural(model.environments.length, 'environment'),
    plural(model.roles.length, 'role'),
    model.changes ? `${changedCount} changed` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    model,
    markdown: renderConceptMarkdown(model),
    text: renderConceptText(model),
    summary,
  }
}
