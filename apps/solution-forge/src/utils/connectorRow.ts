/**
 * How a connector row spells a column — the one place that knows.
 *
 * Two facts about Dataverse rows drive everything here:
 *
 *  - A **lookup** never comes back under the name a query asked for. A
 *    `<attribute name="inv_subject"/>` arrives as `_inv_subject_value`.
 *  - Display text lives in a **separate annotation key**, and only when the
 *    request asked for annotations (`prefer: odata.include-annotations="*"`,
 *    see `currentEnvQuery.fetchXmlQuery`). Without it a lookup is a bare GUID
 *    and a choice is a bare number.
 *
 * Pure, free of service imports, unit-tested.
 */

/** OData annotation carrying a column's display text. */
export const FORMATTED_SUFFIX = '@OData.Community.Display.V1.FormattedValue'

/** `_primarycontactid_value` → `primarycontactid`; anything else unchanged. */
export function lookupBaseName(key: string): string {
  const m = /^_(.+)_value$/.exec(key)
  return m ? m[1] : key
}

/**
 * Displayable value of one column, whatever spelling the row uses.
 *
 * Resolution order is the decision worth stating: display text first (so a
 * lookup reads as a record name and a choice as its label), then the raw
 * value, under the plain name and the `_x_value` form alike. Reading only the
 * plain name — the earlier behaviour of the transfer-hub preview — renders
 * every lookup column blank while its header keeps promising data.
 *
 * `0` and `false` are values, not absence: they must render, which a plain
 * `??`/`||` chain gets wrong.
 */
export function connectorCellValue(
  row: Record<string, unknown>,
  column: string,
): string {
  const keys = [column, `_${column}_value`]
  for (const key of keys) {
    const formatted = row[`${key}${FORMATTED_SUFFIX}`]
    if (typeof formatted === 'string' && formatted !== '') return formatted
  }
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return ''
}

/**
 * Column names of a row, for queries that name no attributes
 * (`<all-attributes/>`). Annotations are dropped and lookups folded back to
 * their bare name, so a header reads `inv_subject` rather than
 * `_inv_subject_value` — and matches what {@link connectorCellValue} resolves.
 * Filtering `_`-prefixed keys out instead removes the lookups altogether.
 */
export function connectorColumns(row: Record<string, unknown>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const key of Object.keys(row)) {
    if (key.includes('@')) continue
    const name = lookupBaseName(key)
    if (seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}
