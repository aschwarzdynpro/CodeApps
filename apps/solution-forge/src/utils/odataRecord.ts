import type { ColumnMeta, EntityRef, OdataRow } from '../types/odataBrowser'
import { isAnnotationKey } from './odataFormat'

/**
 * OData Browser — arranging a single record for reading.
 *
 * A Dataverse row comes back as a flat bag of 30–200 keys in arbitrary order,
 * half of them plumbing. The record panel groups them so the interesting part
 * is on top: what the record *is*, then its data, then its references, then
 * the system bookkeeping nobody scrolls for.
 */

export type FieldGroup = 'identity' | 'data' | 'lookups' | 'system'

export const FIELD_GROUP_LABELS: Record<FieldGroup, string> = {
  identity: 'Identity',
  data: 'Data',
  lookups: 'References',
  system: 'System',
}

export const FIELD_GROUP_ORDER: FieldGroup[] = [
  'identity',
  'data',
  'lookups',
  'system',
]

/**
 * Columns that are bookkeeping on every table. Ownership lives here too: it
 * is a lookup, but nobody opens a record to look at `owninguser` first.
 */
const SYSTEM_COLUMNS = new Set([
  'createdon',
  'createdby',
  'createdonbehalfby',
  'modifiedon',
  'modifiedby',
  'modifiedonbehalfby',
  'overriddencreatedon',
  'importsequencenumber',
  'timezoneruleversionnumber',
  'utcconversiontimezonecode',
  'versionnumber',
  'ownerid',
  'owningbusinessunit',
  'owninguser',
  'owningteam',
  'organizationid',
  'transactioncurrencyid',
  'exchangerate',
  'statecode',
  'statuscode',
])

export interface RecordField {
  /** Key as it appears in the row (`_x_value` for lookups). */
  key: string
  label: string
  logicalName: string
  group: FieldGroup
  column: ColumnMeta | null
  /** True when the row carries no value for it. */
  empty: boolean
}

/** `_primarycontactid_value` → `primarycontactid`. */
function baseName(key: string): string {
  const match = key.match(/^_(.+)_value$/)
  return match ? match[1] : key
}

/**
 * Every data key of the row, grouped and labelled.
 *
 * Driven by the **row**, not by the metadata: a record panel that only showed
 * columns the metadata knows about would silently hide anything the schema
 * cache has not caught up with. Unknown keys still appear, just without a
 * display name.
 */
export function groupRecordFields(
  row: OdataRow,
  columns: ColumnMeta[],
  ref: EntityRef | null,
): RecordField[] {
  const byKey = new Map<string, ColumnMeta>()
  for (const column of columns) {
    if (column.selectName) byKey.set(column.selectName, column)
    byKey.set(column.logicalName, column)
  }

  const fields: RecordField[] = []
  for (const key of Object.keys(row)) {
    if (isAnnotationKey(key)) continue
    const logicalName = baseName(key)
    const column = byKey.get(key) ?? byKey.get(logicalName) ?? null
    const value = row[key]
    fields.push({
      key,
      label: column?.displayName || logicalName,
      logicalName,
      column,
      empty: value === null || value === undefined || value === '',
      group: groupOf(key, logicalName, column, ref),
    })
  }

  return fields.sort(
    (a, b) =>
      FIELD_GROUP_ORDER.indexOf(a.group) - FIELD_GROUP_ORDER.indexOf(b.group) ||
      a.label.localeCompare(b.label),
  )
}

function groupOf(
  key: string,
  logicalName: string,
  column: ColumnMeta | null,
  ref: EntityRef | null,
): FieldGroup {
  if (
    ref &&
    (logicalName === ref.primaryIdAttribute ||
      logicalName === ref.primaryNameAttribute)
  )
    return 'identity'
  if (SYSTEM_COLUMNS.has(logicalName)) return 'system'
  // A `_x_value` key is a lookup even when the metadata is not loaded.
  if (column?.kind === 'lookup' || /^_.+_value$/.test(key)) return 'lookups'
  return 'data'
}

/** The fields of one group, in display order. */
export function fieldsOfGroup(
  fields: RecordField[],
  group: FieldGroup,
): RecordField[] {
  return fields.filter((f) => f.group === group)
}

/**
 * A short human label for a record — the primary name value, falling back to
 * the id. Used for the panel title and the back-navigation trail.
 */
export function recordLabel(row: OdataRow, ref: EntityRef | null): string {
  if (ref) {
    const name = row[ref.primaryNameAttribute]
    if (typeof name === 'string' && name !== '') return name
    const id = row[ref.primaryIdAttribute]
    if (typeof id === 'string' && id !== '') return id
  }
  return '(record)'
}

/** The record's own id, needed to browse its children. */
export function recordId(row: OdataRow, ref: EntityRef | null): string | null {
  if (!ref) return null
  const id = row[ref.primaryIdAttribute]
  return typeof id === 'string' && id !== '' ? id : null
}
