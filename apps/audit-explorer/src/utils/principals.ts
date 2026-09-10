/**
 * Owner references in the audit payload.
 *
 * `changedata` writes lookups as `entityname,guid` and only sometimes carries a
 * resolved label alongside. For ownership that "sometimes" is usually "not", so
 * the raw reference has to be kept around and looked up separately — hence the
 * parser here rather than formatting the value away on sight.
 */

export interface PrincipalRef {
  /** `systemuser` or `team` — the two things that can own a record. */
  entity: 'systemuser' | 'team'
  id: string
}

const PRINCIPAL_RE =
  /^(systemuser|team),([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Returns the reference when a value names a user or team, else null. */
export function parsePrincipalRef(value: string | undefined): PrincipalRef | null {
  if (!value) return null
  const match = value.trim().match(PRINCIPAL_RE)
  if (!match) return null
  return {
    entity: match[1].toLowerCase() as PrincipalRef['entity'],
    id: match[2].toLowerCase(),
  }
}

/** Canonical cache/lookup key for a reference. */
export function principalKey(ref: PrincipalRef): string {
  return `${ref.entity},${ref.id}`
}

/** Every principal reference found in a set of raw values. */
export function collectPrincipalRefs(values: (string | undefined)[]): string[] {
  const keys = new Set<string>()
  for (const value of values) {
    const ref = parsePrincipalRef(value)
    if (ref) keys.add(principalKey(ref))
  }
  return [...keys]
}
