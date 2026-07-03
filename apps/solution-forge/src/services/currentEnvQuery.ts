import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'
import { ENVIRONMENTS } from '../config'

/**
 * Shared FetchXML passthrough against the CURRENT environment via the
 * Dataverse connector (`ListRecordsWithOrganization`) — the same proven code
 * path the Compare / Sharing / Layer features use. Used by the Operate
 * features (Trace Explorer, Job Monitor, Role Analyzer) so none of them
 * needs a new `pac code add-data-source` run for reads.
 *
 * Identity note: connector queries run as the connection (SP), not as the
 * signed-in user — the SP needs read privileges on the queried tables
 * (plugintracelog, asyncoperation, role/privilege intersects, …).
 */

export type Row = Record<string, unknown>

/** OData annotation suffix carrying option-set / lookup display labels. */
export const FV = '@OData.Community.Display.V1.FormattedValue'

/** Read the formatted-value annotation for a column, if present. */
export function formattedValue(row: Row, column: string): string | undefined {
  const value = row[`${column}${FV}`]
  return typeof value === 'string' && value !== '' ? value : undefined
}

export const rowStr = (v: unknown): string => (typeof v === 'string' ? v : '')
export const rowNum = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : 0

/** Current-environment org URL (no trailing slash) for connector calls. */
export function currentOrgUrl(): string {
  const url =
    ENVIRONMENTS.find((e) => e.isCurrent)?.url ?? ENVIRONMENTS[0]?.url ?? ''
  return url.replace(/\/+$/, '')
}

/** Escape a literal for use inside a FetchXML attribute value. */
export function fetchXmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Run one FetchXML query against the current environment and return the raw
 * rows. `entitySet` is the OData entity-set name the connector addresses
 * (e.g. `plugintracelogs`), the fetch entity name lives inside the XML.
 */
export async function fetchXmlQuery(
  entitySet: string,
  fetchXml: string,
): Promise<Row[]> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    currentOrgUrl(),
    entitySet,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    fetchXml,
  )
  if (!result.success) {
    const detail = (result as { error?: { message?: string } }).error?.message
    throw new Error(
      `${entitySet} query failed${detail ? ` — ${detail}` : ''}`,
    )
  }
  return (result.data as { value?: Row[] } | undefined)?.value ?? []
}

/**
 * Paged FetchXML: re-runs the query with an increasing `page` attribute until
 * a page comes back short. Use for intersect-table sweeps (roleprivileges,
 * systemuserroles) that can exceed the 5000-row page. `pageSize` must match
 * the `count` attribute NOT being set in the passed XML — this helper injects
 * both `count` and `page` into the `<fetch>` tag.
 */
export async function fetchXmlAllPages(
  entitySet: string,
  fetchXmlWithoutPaging: string,
  pageSize = 5000,
  maxPages = 20,
): Promise<Row[]> {
  const all: Row[] = []
  for (let page = 1; page <= maxPages; page++) {
    const paged = fetchXmlWithoutPaging.replace(
      /<fetch(\s|>)/,
      `<fetch count="${pageSize}" page="${page}"$1`,
    )
    const rows = await fetchXmlQuery(entitySet, paged)
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return all
}
