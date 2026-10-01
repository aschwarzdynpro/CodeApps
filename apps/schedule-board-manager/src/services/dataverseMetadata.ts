import { MicrosoftDataverseService as Dv } from '../generated/services/MicrosoftDataverseService'
import { ORG_URL } from '../config'
import type { ColumnMeta, TableInfo, TableRef } from '../types/board'
import type { ResolvedRecord } from './boardService'

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

interface EntityKeys {
  set: string
  pk: string
  name: string
}

const keysCache = new Map<string, Promise<EntityKeys | null>>()

/** Entity set and key/name columns — what a row query through the connector needs. */
function entityKeys(logicalName: string): Promise<EntityKeys | null> {
  const key = logicalName.toLowerCase()
  let p = keysCache.get(key)
  if (!p) {
    p = query('LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute', `LogicalName eq '${key.replace(/'/g, "''")}'`).then((rows) => {
      const r = rows[0]
      return r && str(r.EntitySetName) && str(r.PrimaryIdAttribute)
        ? { set: str(r.EntitySetName), pk: str(r.PrimaryIdAttribute), name: str(r.PrimaryNameAttribute) }
        : null
    })
    p.catch(() => keysCache.delete(key))
    keysCache.set(key, p)
  }
  return p
}

async function rows(keys: EntityKeys, filter: string): Promise<Row[]> {
  const select = keys.name ? `${keys.pk},${keys.name}` : keys.pk
  const res = await Dv.ListRecordsWithOrganization(ORG_URL, keys.set, undefined, undefined, undefined, undefined, select, filter)
  if (!res.success) throw new Error(res.error?.message ?? 'unbekannter Fehler')
  return (res.data as { value?: Row[] } | undefined)?.value ?? []
}

export async function resolveRecords(
  entity: string,
  refs: { id: string; name: string | null }[],
): Promise<Map<string, ResolvedRecord> | null> {
  const out = new Map<string, ResolvedRecord>()
  if (!ORG_URL || refs.length === 0) return ORG_URL ? out : null
  try {
    const keys = await entityKeys(entity)
    // Table doesn't exist here: checked, nothing found.
    if (!keys) return out
    for (const r of await rows(keys, refs.map((x) => `${keys.pk} eq ${x.id}`).join(' or '))) {
      const id = str(r[keys.pk])
      out.set(id.toLowerCase(), { id, name: str(r[keys.name]) || id, matchedBy: 'id' })
    }
    const byName = refs.filter((x) => !out.has(x.id.toLowerCase()) && x.name)
    if (byName.length > 0 && keys.name) {
      const found = await rows(keys, byName.map((x) => `${keys.name} eq '${x.name!.replace(/'/g, "''")}'`).join(' or '))
      for (const x of byName) {
        const hits = found.filter((r) => str(r[keys.name]).toLowerCase() === x.name!.toLowerCase())
        if (hits.length === 1) {
          const id = str(hits[0][keys.pk])
          out.set(x.id.toLowerCase(), { id, name: str(hits[0][keys.name]), matchedBy: 'name' })
        }
      }
    }
    return out
  } catch (err) {
    console.warn(`[transfer] records of ${entity} not checkable`, err)
    return null
  }
}
