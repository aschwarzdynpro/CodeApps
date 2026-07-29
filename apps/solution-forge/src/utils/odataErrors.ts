/**
 * OData Browser — turning a Dataverse fault into something actionable.
 *
 * The connector wraps failures as `result.error.message`, and that message
 * often still contains the whole OData error JSON. We unwrap it (same idea as
 * `describeError` in App.tsx) and attach a hint for the fault classes this
 * feature provokes constantly: wrong entity-set name, a lookup selected by its
 * navigation name instead of `_x_value`, and — the most likely one in
 * cross-env use — the connector service principal missing a read privilege in
 * the target environment.
 */

/** An error with a human hint attached, thrown by the browser service. */
export class OdataQueryError extends Error {
  readonly hint: string | null

  constructor(message: string, hint: string | null = null) {
    super(message)
    this.name = 'OdataQueryError'
    this.hint = hint
  }
}

export interface OdataFault {
  message: string
  hint: string | null
}

/** Unwrap the innermost `"message"` out of a nested OData / batch payload. */
export function unwrapMessage(err: unknown): string {
  const odata = (err as { error?: { message?: string } } | undefined)?.error
    ?.message
  if (typeof odata === 'string' && odata !== '') return odata
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (!raw) return String(err ?? '')
  const match = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (!match) return raw
  try {
    return JSON.parse(`"${match[1]}"`) as string
  } catch {
    return match[1]
  }
}

export interface FaultContext {
  entitySet?: string
  envLabel?: string
  /** Entity-set names of the environment — used to suggest a near match. */
  knownEntitySets?: string[]
}

/** Levenshtein distance, capped — only used to suggest a close entity set. */
function distance(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 4) return 99
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = row
  }
  return prev[b.length]
}

/** The closest known entity set to a typo, if there is a plausible one. */
export function nearestEntitySet(
  needle: string,
  known: string[],
): string | null {
  const target = needle.toLowerCase()
  let best: string | null = null
  let bestScore = 4
  for (const candidate of known) {
    const score = distance(target, candidate.toLowerCase())
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

/** Classify a fault and attach a hint where we recognise it. */
export function describeOdataFault(
  err: unknown,
  ctx: FaultContext = {},
): OdataFault {
  const message = unwrapMessage(err)
  const lower = message.toLowerCase()

  const missingProperty = message.match(
    /could not find a property named '([^']+)'/i,
  )
  if (missingProperty) {
    const name = missingProperty[1]
    return {
      message,
      hint: `The column “${name}” does not exist on this table. Lookups must be selected as \`_${name}_value\` — the plain name is the navigation property and only works in $expand.`,
    }
  }

  if (
    // Dataverse phrases this as "No HTTP resource was found that matches …";
    // the connector sometimes shortens it. Match the stable part.
    lower.includes('no http resource') ||
    lower.includes('0x8006088a') ||
    lower.includes('resource not found for the segment')
  ) {
    const near = ctx.entitySet
      ? nearestEntitySet(ctx.entitySet, ctx.knownEntitySets ?? [])
      : null
    return {
      message,
      hint:
        `The entity-set name is wrong. It is not simply the logical name plus “s” — e.g. \`webresourceset\`, \`usersettingscollection\`.` +
        (near && near !== ctx.entitySet ? ` Did you mean \`${near}\`?` : ''),
    }
  }

  if (
    lower.includes('prvread') ||
    lower.includes('0x80040220') ||
    lower.includes('does not have read privilege') ||
    lower.includes('principal user') ||
    lower.includes('insufficient privileges')
  ) {
    return {
      message,
      hint:
        `The connector service principal lacks read permission` +
        (ctx.entitySet ? ` on \`${ctx.entitySet}\`` : '') +
        (ctx.envLabel ? ` in ${ctx.envLabel}` : '') +
        `. Queries run as the connection identity, not as you — grant the SP a role with read access there.`,
    }
  }

  if (lower.includes('0x80040203') || lower.includes('formatexception')) {
    return {
      message,
      hint: 'A literal has the wrong type for the column — e.g. a name where a numeric code is expected, an unquoted string, or a malformed GUID/date.',
    }
  }

  if (
    lower.includes('invalid property') ||
    lower.includes('is not valid for read')
  ) {
    return {
      message,
      hint: 'One of the selected columns cannot be read directly (a derived, virtual, file or image column). Remove it from $select.',
    }
  }

  if (lower.includes('syntax error') || lower.includes('is not supported')) {
    return {
      message,
      hint: 'The expression could not be parsed. Check quoting (strings use single quotes, doubled to escape), parentheses and the `and`/`or` keywords.',
    }
  }

  return { message, hint: null }
}
