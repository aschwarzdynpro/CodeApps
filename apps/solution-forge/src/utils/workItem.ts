import type { WorkItemInfo } from '../types/solution'

type Row = Record<string, unknown>

/**
 * Read a work-item field by trying several key spellings. The Azure DevOps
 * connector's ListWorkItems has, across versions, returned the System fields
 * flat with an underscore (`System_Title`), flat with a dot (`System.Title`),
 * nested under a `fields` object, or under friendly names (`title`) — so we
 * probe all of them, digging into a `fields` object when present.
 */
function fieldValue(row: Row, base: string): unknown {
  const camel = base.charAt(0).toLowerCase() + base.slice(1)
  const keys = [`System.${base}`, `System_${base}`, base, camel]
  const fields =
    row.fields && typeof row.fields === 'object' ? (row.fields as Row) : undefined
  for (const k of keys) {
    if (row[k] != null) return row[k]
    if (fields && fields[k] != null) return fields[k]
  }
  return undefined
}

/**
 * Coerce a field value to trimmed text. Handles plain strings/numbers and Azure
 * DevOps identity objects (assignee), which arrive as `{ displayName, … }`.
 */
export function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    const o = v as Row
    const name = o.displayName ?? o.DisplayName ?? o.name ?? o.uniqueName
    if (typeof name === 'string') return name.trim()
  }
  return ''
}

/**
 * Map one Azure DevOps work-item row onto a {@link WorkItemInfo}. Returns null
 * when the row is missing (work item not found). Field spellings are resolved
 * defensively ({@link fieldValue}); blank fields fall back to readable
 * placeholders; a blank assignee becomes null (rendered "Unassigned"); the
 * description keeps its raw Azure DevOps rich text (HTML) — sanitize at render.
 * The browser link is passed in (built by config.devOpsWorkItemUrl) so this
 * stays independent of config.
 */
export function workItemInfoFrom(
  devOpsId: string,
  row: Row | null | undefined,
  url: string | null,
): WorkItemInfo | null {
  if (!row) return null
  return {
    id: devOpsId,
    type: asText(fieldValue(row, 'WorkItemType')) || 'Work item',
    title: asText(fieldValue(row, 'Title')) || `#${devOpsId}`,
    state: asText(fieldValue(row, 'State')) || 'Unknown',
    assignedTo: asText(fieldValue(row, 'AssignedTo')) || null,
    // Raw Azure DevOps rich text (HTML); sanitized at render (utils/richText).
    description: asText(fieldValue(row, 'Description')),
    url,
  }
}

/**
 * Like {@link workItemInfoFrom} but reads the id from the row itself — for batch
 * reads (ListWorkItems over many ids) where each row carries its own id. The url
 * is left null; the caller fills it via config.devOpsWorkItemUrl.
 */
export function workItemInfoFromRow(
  row: Row | null | undefined,
): WorkItemInfo | null {
  if (!row) return null
  const id = asText(fieldValue(row, 'Id'))
  if (!id) return null
  return workItemInfoFrom(id, row, null)
}

/** One search suggestion for the New-Working-Solution DevOps-id picker. */
export interface WorkItemPick {
  id: string
  title: string
  type: string
  state: string
  /** Assignee display name, or '' when unassigned. */
  assignedTo: string
}

/**
 * Map a work-item row (from ListWorkItems, used to hydrate WIQL search hits) to a
 * {@link WorkItemPick}. Reads the id from the row itself; returns null when there
 * is no id. Field spellings are resolved defensively ({@link fieldValue}).
 */
export function workItemPickFrom(
  row: Row | null | undefined,
): WorkItemPick | null {
  if (!row) return null
  const id = asText(fieldValue(row, 'Id'))
  if (!id) return null
  return {
    id,
    title: asText(fieldValue(row, 'Title')) || `#${id}`,
    type: asText(fieldValue(row, 'WorkItemType')) || 'Work item',
    state: asText(fieldValue(row, 'State')) || 'Unknown',
    assignedTo: asText(fieldValue(row, 'AssignedTo')),
  }
}
