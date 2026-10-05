/**
 * Which Power Platform environment the console is running in — resolved at
 * RUNTIME, never from the build.
 *
 * Why this exists: links persisted on `pro_workingsolution.pro_solutionlink`
 * used to fall back to the build-time `VITE_ENVIRONMENT_ID`. A managed release
 * is built once (in the authoring environment) and installed everywhere, so
 * every installation wrote links pointing at the environment the release was
 * built in. The id now comes from the host context first and from the
 * `pro_environmentconfig` row flagged current second; when neither knows it,
 * the answer is "unknown" — and an unknown link is better than a wrong one.
 */

import type { EnvironmentDef } from '../types/comparison'

/**
 * A plain GUID or the default-environment form `Default-<tenant guid>` —
 * both are valid environment segments in maker / Power Automate URLs.
 */
const ENV_ID_RE =
  /^(default-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The offline placeholders in config.ts are all-zero GUIDs (…000, …001, …). */
const PLACEHOLDER_PREFIX = '00000000-0000-0000-0000-'

/** Whether an id names a real environment (not empty, not a placeholder). */
export function isRealEnvironmentId(
  id: string | null | undefined,
): id is string {
  if (!id) return false
  const trimmed = id.trim()
  return ENV_ID_RE.test(trimmed) && !trimmed.startsWith(PLACEHOLDER_PREFIX)
}

/**
 * The host environment id, or null when nobody knows it.
 *
 * 1. `hostId` — what the Power Apps host context reported (authoritative).
 * 2. The environment flagged `isCurrent`, but ONLY when the list was hydrated
 *    from `pro_environmentconfig` (`fromRuntimeConfig`). The build-time list
 *    is exactly the value that went wrong: it describes the build machine's
 *    environment, not the installation's.
 */
export function resolveHostEnvironmentId(
  hostId: string | null | undefined,
  environments: readonly EnvironmentDef[],
  fromRuntimeConfig: boolean,
): string | null {
  if (isRealEnvironmentId(hostId)) return hostId.trim()
  if (!fromRuntimeConfig) return null
  const current = environments.find((e) => e.isCurrent)?.environmentId
  return isRealEnvironmentId(current) ? current.trim() : null
}
