import { MicrosoftDataverseService as Dv } from '../generated/services/MicrosoftDataverseService'
import { ORG_URL } from '../config'
import type { ColumnMeta, TableInfo, TableRef } from '../types/board'

/**
 * Table/column metadata via the Dataverse connector (`EntityDefinitions`) —
 * the native Code App data sources expose rows, not metadata. Lookup targets
 * come from `ManyToOneRelationships`, because `Targets` only exists on the
 * derived LookupAttributeMetadata and can't be selected in an expand.
 */

type Row = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function label(v: unknown): string {
  return (v as { UserLocalizedLabel?: { Label?: string } } | undefined)?.UserLocalizedLabel?.Label ?? ''
}

async function query(select: string, filter?: string, expand?: string): Promise<Row[]> {
  if (!ORG_URL) throw new Error('Metadaten brauchen VITE_ORG_URL.')
  const res = await Dv.ListRecordsWithOrganization(ORG_URL, 'EntityDefinitions', undefined, undefined, undefined, undefined, select, filter, undefined, expand)
  if (!res.success) throw new Error(`Metadaten lesen: ${res.error?.message ?? 'unbekannter Fehler'}`)
  return (res.data as { value?: Row[] } | undefined)?.value ?? []
}

let tablesCache: Promise<TableRef[]> | null = null
const infoCache = new Map<string, Promise<TableInfo | null>>()

export function listTables(): Promise<TableRef[]> {
  tablesCache ??= query('LogicalName,DisplayName', 'IsValidForAdvancedFind eq true')
    .then((rows) =>
      rows
        .map((r) => ({ logicalName: str(r.LogicalName), displayName: label(r.DisplayName) || str(r.LogicalName) }))
        .filter((t) => t.logicalName)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    )
    .catch((err) => {
      tablesCache = null
      throw err
    })
  return tablesCache
}

const PICKLIST_TYPES = new Set(['Picklist', 'State', 'Status'])
const LOOKUP_TYPES = new Set(['Lookup', 'Customer', 'Owner'])

export function getTableInfo(logicalName: string): Promise<TableInfo | null> {
  const key = logicalName.toLowerCase()
  let p = infoCache.get(key)
  if (!p) {
    p = query(
      'LogicalName,DisplayName',
      `LogicalName eq '${key.replace(/'/g, "''")}'`,
      'Attributes($select=LogicalName,DisplayName,AttributeType,AttributeTypeName,AttributeOf),ManyToOneRelationships($select=ReferencingAttribute,ReferencedEntity)',
    ).then((rows) => {
      const r = rows[0]
      if (!r) return null
      const targets = new Map<string, string>()
      for (const rel of (r.ManyToOneRelationships as Row[] | undefined) ?? []) {
        const attr = str(rel.ReferencingAttribute)
        if (attr && !targets.has(attr)) targets.set(attr, str(rel.ReferencedEntity))
      }
      const columns: ColumnMeta[] = ((r.Attributes as Row[] | undefined) ?? [])
        // Shadow columns (…name, …yominame) carry AttributeOf — not selectable on their own.
        .filter((a) => str(a.LogicalName) && !str(a.AttributeOf))
        .map((a) => {
          const type = str(a.AttributeType)
          const typeName = str((a.AttributeTypeName as { Value?: string } | undefined)?.Value)
          const col = str(a.LogicalName)
          const kind: ColumnMeta['kind'] =
            PICKLIST_TYPES.has(type) || typeName === 'MultiSelectPicklistType' ? 'picklist' : LOOKUP_TYPES.has(type) ? 'lookup' : 'other'
          return { logicalName: col, displayName: label(a.DisplayName) || col, kind, target: kind === 'lookup' ? targets.get(col) : undefined }
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
      return { logicalName: str(r.LogicalName), displayName: label(r.DisplayName) || str(r.LogicalName), columns }
    })
    p.catch(() => infoCache.delete(key))
    infoCache.set(key, p)
  }
  return p
}
