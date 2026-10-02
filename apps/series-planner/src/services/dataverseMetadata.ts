import { MicrosoftDataverseService as Dv } from '../generated/services/MicrosoftDataverseService'
import { ORG_URL } from '../config'
import { str, type Row } from './dataverseCommon'

/**
 * N:1 relationships of a table via the Dataverse connector
 * (`EntityDefinitions`), cached per session. Writing a lookup needs the
 * navigation property (`<nav>@odata.bind`), whose casing differs between
 * tables and product versions — reading it beats guessing. It also finds
 * the project lookup on the work order that the Field Service ↔ Project
 * Operations integration adds.
 */

export interface Relation {
  attribute: string
  target: string
  nav: string
}

const cache = new Map<string, Promise<Relation[]>>()

export function relationsOf(entity: string): Promise<Relation[]> {
  let p = cache.get(entity)
  if (!p) {
    p = (async () => {
      if (!ORG_URL) throw new Error('Metadaten brauchen VITE_ORG_URL.')
      const res = await Dv.ListRecordsWithOrganization(
        ORG_URL,
        'EntityDefinitions',
        undefined,
        undefined,
        undefined,
        undefined,
        'LogicalName',
        `LogicalName eq '${entity}'`,
        undefined,
        'ManyToOneRelationships($select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName)',
      )
      if (!res.success) throw new Error(`Metadaten von ${entity}: ${res.error?.message ?? 'unbekannter Fehler'}`)
      const row = ((res.data as { value?: Row[] } | undefined)?.value ?? [])[0]
      return ((row?.ManyToOneRelationships as Row[] | undefined) ?? [])
        .map((r) => ({ attribute: str(r.ReferencingAttribute) ?? '', target: str(r.ReferencedEntity) ?? '', nav: str(r.ReferencingEntityNavigationPropertyName) ?? '' }))
        .filter((r) => r.attribute && r.nav)
    })()
    p.catch(() => cache.delete(entity))
    cache.set(entity, p)
  }
  return p
}

/** `<nav>@odata.bind` for a lookup column; `fallbackNav` when metadata can't be read. */
export async function bindKey(entity: string, attribute: string, fallbackNav: string): Promise<string> {
  try {
    const rel = (await relationsOf(entity)).find((r) => r.attribute === attribute)
    return `${rel?.nav ?? fallbackNav}@odata.bind`
  } catch {
    return `${fallbackNav}@odata.bind`
  }
}

/**
 * The lookup from `entity` to `target`. With several (product + custom),
 * Microsoft's own `msdyn_` column wins. Null when there is none.
 */
export async function lookupTo(entity: string, target: string): Promise<Relation | null> {
  const all = (await relationsOf(entity)).filter((r) => r.target === target)
  return all.find((r) => r.attribute.startsWith('msdyn_')) ?? all[0] ?? null
}
