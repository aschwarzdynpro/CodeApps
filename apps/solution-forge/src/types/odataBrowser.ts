/**
 * OData Browser — model types.
 *
 * The browser talks to the Dataverse Web API of ANY configured environment
 * through the existing connector (`ListRecordsWithOrganization`), so it needs
 * its own lightweight metadata model: which tables exist, which of their
 * columns can actually appear in `$select`, and what a query looks like.
 *
 * Plan + decisions: `docs/odata-browser-plan.md`. v1 is read-only; the write
 * types below are the declared seams (see `WRITE_ENABLED` in
 * `dataverseOdataBrowserService`) so switching writing on later is a flag plus
 * three method bodies rather than a refactor.
 */

/** One row of a Web API response (annotation keys included). */
export type OdataRow = Record<string, unknown>

/**
 * Coarse column classification driving the value editors and (from P2) the
 * operator catalog. Derived from `AttributeType` / `AttributeTypeName` —
 * finer than "string vs number", coarser than the ~30 Dataverse attribute
 * types.
 */
export type ColumnKind =
  | 'string'
  | 'number'
  | 'money'
  | 'boolean'
  | 'datetime'
  | 'dateonly'
  | 'choice'
  | 'multichoice'
  | 'lookup'
  | 'guid'
  | 'other'

/** A table as offered in the entity picker. */
export interface EntityRef {
  logicalName: string
  schemaName: string
  /** The OData entity-set name — NOT logical name + "s" (webresourceset!). */
  entitySet: string
  displayName: string
  displayCollectionName: string
  primaryIdAttribute: string
  primaryNameAttribute: string
  /** Entity type code — needed to read option labels from `stringmap`. */
  objectTypeCode: number
  isPrivate: boolean
  isActivity: boolean
  isCustomEntity: boolean
  isManaged: boolean
}

/** Raw attribute metadata, normalized — input of `classifyColumn`. */
export interface RawAttribute {
  logicalName: string
  displayName: string
  attributeType: string
  /** `AttributeTypeName.Value`, e.g. `MultiSelectPicklistType`. */
  attributeTypeName: string
  /** Set on derived/virtual siblings (`<money>_base`, name attributes). */
  attributeOf: string | null
  isValidForRead: boolean
  isValidForCreate: boolean
  isValidForUpdate: boolean
  isValidForAdvancedFind: boolean
  isPrimaryId: boolean
  isPrimaryName: boolean
}

/** An attribute plus everything the UI needs to decide what to do with it. */
export interface ColumnMeta extends RawAttribute {
  kind: ColumnKind
  /**
   * The name to put into `$select` — `_x_value` for lookups, the logical name
   * otherwise. Empty when the column cannot be selected at all.
   */
  selectName: string
  selectable: boolean
  /** Why it cannot be selected (shown greyed in the column picker). */
  unselectableReason: string | null
}

/** A table with its columns (loaded lazily, cached per org). */
export interface EntityMeta {
  ref: EntityRef
  columns: ColumnMeta[]
}

export interface OrderBy {
  column: string
  desc: boolean
}

/**
 * The canonical query state. Both the guided builder and (from P2) the raw
 * query line write into this — `filterRaw` / `expandRaw` hold expression text
 * verbatim so an expert query is never rewritten by the builder.
 */
export interface ODataQuery {
  entitySet: string
  select: string[]
  orderBy: OrderBy[]
  filterRaw: string | null
  expandRaw: string | null
  /** `$top`; null = server default. */
  top: number | null
  /** `prefer: odata.maxpagesize` — server-driven paging. */
  pageSize: number
  /** `prefer: odata.include-annotations="*"` — formatted values + lookup types. */
  annotations: boolean
}

/** One executed page. */
export interface QueryResult {
  rows: OdataRow[]
  /** Continuation token pulled out of `@odata.nextLink`, if the page is partial. */
  skipToken: string | null
  durationMs: number
}

// ---------------------------------------------------------------------------
// Write seams — declared in v1, not wired. See docs/odata-browser-plan.md §12.
// ---------------------------------------------------------------------------

/** Edited field values for one record, keyed by column logical name. */
export interface RecordDraft {
  entitySet: string
  recordId: string
  values: Record<string, unknown>
}

/** What a save would actually send — reviewed before it is sent. */
export interface WritePlan {
  entitySet: string
  recordId: string | null
  /** The PATCH/POST body (lookups already as `<nav>@odata.bind`). */
  body: Record<string, unknown>
  changed: { column: string; from: unknown; to: unknown }[]
  skipped: { column: string; reason: string }[]
}

export interface WriteResult {
  ok: boolean
  recordId: string | null
  message: string | null
}
