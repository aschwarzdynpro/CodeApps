import { ENVIRONMENTS } from '../config'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'

/**
 * "Solution Component Framework" component-type codes — connection references,
 * app settings, desktop-flow binaries, custom APIs, … (everything the platform
 * registers in `solutioncomponentdefinition`) — are the per-ENVIRONMENT
 * entity-type codes of the underlying table, NOT platform constants. The same
 * logical component carries different numbers in different orgs: at one customer
 * `connectionreference` is **10064**, at another it is **10093** (where 10064 is
 * `appsetting`). Verified live at Waldmann DEV vs Schulz INT-11.
 *
 * Anything that keys off these codes — dependency-type labels, DEPENDENCY_SPECS,
 * the Env Config solution-membership filter, the Layer Inspector ignore-list —
 * must resolve them live per environment instead of hardcoding a number, or it
 * silently mislabels/misses components in any org whose codes differ from the one
 * it was written against (see gotcha #13 in CLAUDE.md).
 *
 * This resolves `primaryentityname → solutioncomponenttype` from
 * `solutioncomponentdefinition` for one environment (defaults to the current
 * host env), cached per org URL for the session. Runs through the connector
 * (SP identity), the same path the Layer Inspector already uses. Best-effort:
 * on any failure the map is empty and callers fall back to their classic
 * constants.
 */

const cache = new Map<string, Promise<Map<string, number>>>()

function hostUrl(): string {
  const url =
    ENVIRONMENTS.find((e) => e.isCurrent)?.url ?? ENVIRONMENTS[0]?.url ?? ''
  return url.replace(/\/+$/, '')
}

/** `primaryentityname` (lower-case) → `solutioncomponenttype`, per environment. */
export function componentTypeCodesByEntity(
  orgUrl?: string,
): Promise<Map<string, number>> {
  const url = (orgUrl ?? hostUrl()).replace(/\/+$/, '')
  let entry = cache.get(url)
  if (!entry) {
    entry = (async () => {
      const map = new Map<string, number>()
      try {
        const result =
          await MicrosoftDataverseService.ListRecordsWithOrganization(
            url,
            'solutioncomponentdefinitions',
            undefined,
            undefined,
            undefined,
            undefined,
            'solutioncomponenttype,primaryentityname',
          )
        const rows =
          (result.data as { value?: Record<string, unknown>[] } | undefined)
            ?.value ?? []
        for (const row of rows) {
          const code = Number(row.solutioncomponenttype ?? 0)
          const name =
            typeof row.primaryentityname === 'string'
              ? row.primaryentityname.toLowerCase()
              : ''
          if (code && name && !map.has(name)) map.set(name, code)
        }
      } catch (err) {
        console.warn(
          '[componenttypes] solutioncomponentdefinition lookup failed:',
          err,
        )
      }
      return map
    })()
    cache.set(url, entry)
  }
  return entry
}

/**
 * The `connectionreference` solution-component-type code for one environment
 * (10064 / 10093 / …), or `undefined` when the definition table can't be read.
 * Callers apply their own fallback: the classic 10064 stays correct wherever it
 * genuinely is the connection-reference code, and staying `undefined` keeps a
 * conservative "unknown" verdict rather than risking a false one.
 */
export async function connectionReferenceTypeCode(
  orgUrl?: string,
): Promise<number | undefined> {
  return (await componentTypeCodesByEntity(orgUrl)).get('connectionreference')
}
