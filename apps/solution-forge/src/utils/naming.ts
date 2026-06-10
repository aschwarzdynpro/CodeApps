import type { SolutionKind } from '../types/solution'

/**
 * Unique-name convention shared by the whole app:
 *   feature_<id> / bug_<id> / deploy_<id>
 *
 * Dataverse unique names must start with a letter and may only contain
 * letters, digits and underscores — the kind prefix guarantees the leading
 * letter even though Azure DevOps ids are numeric.
 */

const KIND_PREFIX: Record<Exclude<SolutionKind, 'other'>, string> = {
  feature: 'feature',
  bug: 'bug',
  deployment: 'deploy',
}

const UNIQUE_NAME_RE = /^(feature|bug|deploy)_([A-Za-z0-9_]+)$/

export function buildUniqueName(
  kind: Exclude<SolutionKind, 'other'>,
  devOpsId: string,
): string {
  return `${KIND_PREFIX[kind]}_${sanitizeIdPart(devOpsId)}`
}

/** Strip everything Dataverse would reject from the id part. */
export function sanitizeIdPart(raw: string): string {
  return raw.trim().replace(/[^A-Za-z0-9_]/g, '')
}

export function classifyUniqueName(uniqueName: string): {
  kind: SolutionKind
  devOpsId: string | null
} {
  const match = UNIQUE_NAME_RE.exec(uniqueName)
  if (!match) return { kind: 'other', devOpsId: null }
  if (match[1] === 'deploy') return { kind: 'deployment', devOpsId: null }
  return { kind: match[1] as SolutionKind, devOpsId: match[2] }
}

/**
 * Best-effort work item id for solutions outside the feature_/bug_
 * convention. Pre-existing solutions often carry the number elsewhere —
 * "Assembly App V2 | 11941" in the title, or a purely numeric unique name.
 */
export function extractDevOpsId(
  uniqueName: string,
  title: string,
): string | null {
  const fromConvention = classifyUniqueName(uniqueName).devOpsId
  if (fromConvention && /^\d+$/.test(fromConvention)) return fromConvention
  if (/^\d{3,}$/.test(uniqueName)) return uniqueName
  const fromTitle = /[|#]\s*(\d{3,})\s*$/.exec(title.trim())
  return fromTitle ? fromTitle[1] : null
}
