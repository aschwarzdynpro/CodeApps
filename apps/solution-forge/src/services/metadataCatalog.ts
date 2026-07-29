import type {
  EntityMeta,
  EntityRef,
  OptionLabel,
  RawAttribute,
} from '../types/odataBrowser'
import { classifyColumn, sortColumns } from '../utils/odataQuery'
import {
  fetchXmlAllPages,
  fetchXmlEscape,
  fetchXmlQuery,
  odataQuery,
  rowNum,
  rowStr,
  type Row,
} from './currentEnvQuery'

/**
 * Per-environment Dataverse metadata cache — the fuel for the OData Browser's
 * pickers and (from P3) its IntelliSense.
 *
 * Read through the connector's `EntityDefinitions` metadata set, the proven
 * route in this app (Audit Config, Transfer Hub, dependency checks all use
 * it). Cached per **org URL** in module scope and mirrored into
 * `sessionStorage`, because the entity list is one ~1000-row response that
 * would otherwise be refetched on every tab switch. Schema changes are picked
 * up via the explicit refresh (`clearMetadataCache`), not by expiry — this is
 * a browsing tool, not a live schema monitor.
 */

/** Metadata `Label` → the localized display string. */
export function metadataLabel(value: unknown): string {
  const label = value as { UserLocalizedLabel?: { Label?: string } } | undefined
  return label?.UserLocalizedLabel?.Label ?? ''
}

/** `BooleanManagedProperty` (and plain booleans) → boolean. */
function managedBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return (value as { Value?: boolean } | undefined)?.Value === true
}

const ENTITY_SELECT = [
  'LogicalName',
  'SchemaName',
  'EntitySetName',
  'DisplayName',
  'DisplayCollectionName',
  'PrimaryIdAttribute',
  'PrimaryNameAttribute',
  'ObjectTypeCode',
  'IsPrivate',
  'IsActivity',
  'IsCustomEntity',
  'IsManaged',
].join(',')

const ATTRIBUTE_SELECT = [
  'LogicalName',
  'DisplayName',
  'AttributeType',
  'AttributeTypeName',
  'AttributeOf',
  'IsValidForRead',
  'IsValidForCreate',
  'IsValidForUpdate',
  'IsValidForAdvancedFind',
  'IsPrimaryId',
  'IsPrimaryName',
].join(',')

const CACHE_VERSION = 'v1'

const entitiesByOrg = new Map<string, EntityRef[]>()
const entityMetaByOrg = new Map<string, Map<string, EntityMeta>>()

function storageKey(orgUrl: string): string {
  return `sac.odb.${CACHE_VERSION}.entities.${orgUrl}`
}

function readSession(orgUrl: string): EntityRef[] | null {
  try {
    const raw = sessionStorage.getItem(storageKey(orgUrl))
    if (!raw) return null
    const parsed = JSON.parse(raw) as EntityRef[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

function writeSession(orgUrl: string, entities: EntityRef[]): void {
  try {
    sessionStorage.setItem(storageKey(orgUrl), JSON.stringify(entities))
  } catch {
    // Quota or a locked-down storage — the in-memory cache still works.
  }
}

function toEntityRef(row: Row): EntityRef {
  return {
    logicalName: rowStr(row.LogicalName),
    schemaName: rowStr(row.SchemaName),
    entitySet: rowStr(row.EntitySetName),
    displayName:
      metadataLabel(row.DisplayName) || rowStr(row.LogicalName),
    displayCollectionName:
      metadataLabel(row.DisplayCollectionName) ||
      metadataLabel(row.DisplayName) ||
      rowStr(row.LogicalName),
    primaryIdAttribute: rowStr(row.PrimaryIdAttribute),
    primaryNameAttribute: rowStr(row.PrimaryNameAttribute),
    objectTypeCode: rowNum(row.ObjectTypeCode),
    isPrivate: row.IsPrivate === true,
    isActivity: row.IsActivity === true,
    isCustomEntity: row.IsCustomEntity === true,
    isManaged: row.IsManaged === true,
  }
}

function toRawAttribute(row: Row): RawAttribute {
  return {
    logicalName: rowStr(row.LogicalName),
    displayName:
      metadataLabel(row.DisplayName) || rowStr(row.LogicalName),
    attributeType: rowStr(row.AttributeType),
    attributeTypeName:
      (row.AttributeTypeName as { Value?: string } | undefined)?.Value ?? '',
    attributeOf: row.AttributeOf ? rowStr(row.AttributeOf) : null,
    isValidForRead: managedBool(row.IsValidForRead),
    isValidForCreate: managedBool(row.IsValidForCreate),
    isValidForUpdate: managedBool(row.IsValidForUpdate),
    isValidForAdvancedFind: managedBool(row.IsValidForAdvancedFind),
    isPrimaryId: row.IsPrimaryId === true,
    isPrimaryName: row.IsPrimaryName === true,
  }
}

/** Every table of one environment. Cached; one query per org per session. */
export async function listEntities(orgUrl: string): Promise<EntityRef[]> {
  const cached = entitiesByOrg.get(orgUrl)
  if (cached) return cached
  const stored = readSession(orgUrl)
  if (stored) {
    entitiesByOrg.set(orgUrl, stored)
    return stored
  }
  const rows = await odataQuery('EntityDefinitions', ENTITY_SELECT, { orgUrl })
  const entities = rows
    .map(toEntityRef)
    // Without an entity-set name a table is not addressable over OData.
    .filter((e) => e.logicalName && e.entitySet)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  entitiesByOrg.set(orgUrl, entities)
  writeSession(orgUrl, entities)
  return entities
}

/**
 * One table with its columns, classified. Lazy per table (expanding
 * `Attributes` for every table at once is far too heavy) and cached in memory
 * only — attribute payloads are big and the entity list is the expensive part
 * to re-fetch, not this.
 */
export async function getEntityMeta(
  orgUrl: string,
  logicalName: string,
): Promise<EntityMeta> {
  const perOrg = entityMetaByOrg.get(orgUrl) ?? new Map<string, EntityMeta>()
  entityMetaByOrg.set(orgUrl, perOrg)
  const cached = perOrg.get(logicalName)
  if (cached) return cached

  const entities = await listEntities(orgUrl)
  const ref = entities.find((e) => e.logicalName === logicalName)
  if (!ref) throw new Error(`Table “${logicalName}” not found in this environment.`)

  const safe = logicalName.replace(/'/g, "''")
  const rows = await odataQuery('EntityDefinitions', 'LogicalName', {
    orgUrl,
    filter: `LogicalName eq '${safe}'`,
    expand: `Attributes($select=${ATTRIBUTE_SELECT})`,
  })
  const attributes =
    (rows[0]?.Attributes as Array<Row> | undefined) ?? []
  const columns = sortColumns(
    attributes
      .map(toRawAttribute)
      .filter((a) => a.logicalName)
      .map(classifyColumn),
  )
  const meta: EntityMeta = { ref, columns }
  perOrg.set(logicalName, meta)
  return meta
}

const optionsByKey = new Map<string, OptionLabel[]>()
const baseLanguageByOrg = new Map<string, number>()

/** The environment's base language — the labels the maker shows. */
async function baseLanguage(orgUrl: string): Promise<number> {
  const cached = baseLanguageByOrg.get(orgUrl)
  if (cached !== undefined) return cached
  let code = 1033
  try {
    const rows = await fetchXmlQuery(
      'organizations',
      '<fetch top="1"><entity name="organization"><attribute name="languagecode" /></entity></fetch>',
      orgUrl,
    )
    const value = rowNum(rows[0]?.languagecode)
    if (value) code = value
  } catch {
    // Keep the 1033 default — labels are a nicety, not a blocker.
  }
  baseLanguageByOrg.set(orgUrl, code)
  return code
}

/**
 * Choice labels for one column, via **`stringmap`** — the same proven route
 * the Flow Comparer uses for its area column. The connector does not return
 * formatted values for a bare metadata read, so the option values would
 * otherwise show up as naked numbers in the filter editor.
 *
 * Filtering on `attributename` alone is NOT enough here: `statecode`,
 * `statuscode` and friends exist on every table, so the entity's
 * `objecttypecode` must be in the condition too. Labels are picked in the base
 * language first, then English, then anything. Best-effort — an empty list
 * just means the filter editor falls back to a plain input.
 */
export async function getOptionLabels(
  orgUrl: string,
  objectTypeCode: number,
  attributeLogicalName: string,
): Promise<OptionLabel[]> {
  const key = `${orgUrl}|${objectTypeCode}|${attributeLogicalName}`
  const cached = optionsByKey.get(key)
  if (cached) return cached

  const out: OptionLabel[] = []
  try {
    const base = await baseLanguage(orgUrl)
    const rank = (lang: number): number =>
      lang === base ? 0 : lang === 1033 ? 1 : 2
    const bestRank = new Map<number, number>()
    const byValue = new Map<number, string>()
    const fetch =
      '<fetch><entity name="stringmap">' +
      '<attribute name="attributevalue" /><attribute name="value" />' +
      '<attribute name="langid" /><filter>' +
      `<condition attribute="attributename" operator="eq" value="${fetchXmlEscape(attributeLogicalName)}" />` +
      `<condition attribute="objecttypecode" operator="eq" value="${objectTypeCode}" />` +
      '</filter></entity></fetch>'
    for (const row of await fetchXmlAllPages('stringmaps', fetch, orgUrl)) {
      const label = rowStr(row.value)
      if (!label) continue
      const value = rowNum(row.attributevalue)
      const r = rank(rowNum(row.langid))
      const current = bestRank.get(value)
      if (current === undefined || r < current) {
        bestRank.set(value, r)
        byValue.set(value, label)
      }
    }
    for (const [value, label] of byValue) out.push({ value, label })
    out.sort((a, b) => a.label.localeCompare(b.label))
  } catch (err) {
    console.warn('[odata] stringmap option labels failed:', attributeLogicalName, err)
  }
  optionsByKey.set(key, out)
  return out
}

/**
 * Entity-set names already in the cache, synchronously. Used by the error
 * mapper to suggest "did you mean `webresourceset`?" without turning fault
 * handling into an async path.
 */
export function cachedEntitySets(orgUrl: string): string[] {
  return (entitiesByOrg.get(orgUrl) ?? []).map((e) => e.entitySet)
}

/** Drop cached metadata — for one environment or all of them. */
export function clearMetadataCache(orgUrl?: string): void {
  if (orgUrl) {
    entitiesByOrg.delete(orgUrl)
    entityMetaByOrg.delete(orgUrl)
    baseLanguageByOrg.delete(orgUrl)
    for (const key of [...optionsByKey.keys()])
      if (key.startsWith(`${orgUrl}|`)) optionsByKey.delete(key)
    try {
      sessionStorage.removeItem(storageKey(orgUrl))
    } catch {
      // ignore
    }
    return
  }
  for (const key of entitiesByOrg.keys()) {
    try {
      sessionStorage.removeItem(storageKey(key))
    } catch {
      // ignore
    }
  }
  entitiesByOrg.clear()
  entityMetaByOrg.clear()
  baseLanguageByOrg.clear()
  optionsByKey.clear()
}
