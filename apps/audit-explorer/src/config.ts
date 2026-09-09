/**
 * Deep links back into the model-driven app.
 *
 * The org URL cannot be discovered at runtime: the SDK's `getContext()` returns
 * only `environmentId`, and `RetrieveCurrentOrganization` cannot be generated as
 * a data source (its `EndpointAccessType` enum parameter makes the generator
 * look for a table of that name and 404). So it is a build-time setting, and an
 * unset value hides the links rather than pointing them at a foreign tenant.
 */
const ORG_URL = (import.meta.env.VITE_ORG_URL ?? '').trim().replace(/\/+$/, '')

/** True when this build knows which environment it belongs to. */
export const canDeepLink = ORG_URL !== ''

/**
 * URL of a record's form. Returns null when the target is unknown — callers
 * render nothing rather than a dead link.
 */
export function recordUrl(
  table: string | undefined,
  recordId: string | undefined,
): string | null {
  if (!ORG_URL || !table || !recordId) return null
  return `${ORG_URL}/main.aspx?pagetype=entityrecord&etn=${encodeURIComponent(
    table,
  )}&id=${encodeURIComponent(recordId)}`
}
