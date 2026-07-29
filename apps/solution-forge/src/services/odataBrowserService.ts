import type {
  CollectionRef,
  EntityMeta,
  EntityRef,
  ODataQuery,
  OdataRow,
  OptionLabel,
  QueryResult,
  RecordDraft,
  WriteResult,
} from '../types/odataBrowser'
import { dataverseOdataBrowserService } from './dataverseOdataBrowserService'

/**
 * Service contract for the OData Browser.
 *
 * Reads go through the Dataverse connector against **any** configured
 * environment, i.e. as the connection's service principal — never as the
 * signed-in user. That is why the whole feature is deployment-manager gated
 * and why the workspace shows a permanent identity banner.
 *
 * The write methods are **declared but not enabled** in v1 (see
 * `docs/odata-browser-plan.md` §12): the Dataverse implementation guards them
 * with `WRITE_ENABLED` and throws, and no UI renders a write affordance.
 * Their signatures are final so switching writing on is a flag plus three
 * method bodies.
 */
export interface OdataBrowserService {
  /** Every addressable table of an environment (cached per org). */
  listEntities(envKey: string): Promise<EntityRef[]>
  /** One table with its classified columns (lazy per table). */
  getEntityMeta(envKey: string, logicalName: string): Promise<EntityMeta>
  /**
   * Run a query. `skipToken` continues a previous page (from
   * `QueryResult.skipToken`) instead of starting over.
   */
  runQuery(
    envKey: string,
    query: ODataQuery,
    skipToken?: string | null,
  ): Promise<QueryResult>
  /**
   * Value→label pairs of a choice column, for the filter editor. Best-effort:
   * an empty list means "no labels available", not an error.
   */
  listOptions(
    envKey: string,
    objectTypeCode: number,
    attributeLogicalName: string,
  ): Promise<OptionLabel[]>
  /**
   * Total row count for a filter, via a FetchXML aggregate — the connector
   * exposes no `$count`. Returns `'over-limit'` when Dataverse refuses the
   * aggregate (its 50 000-row ceiling), so the UI can say "≥ 50,000" instead
   * of pretending to know.
   */
  countRows(
    envKey: string,
    entitySet: string,
    fetchXml: string,
  ): Promise<number | 'over-limit'>
  /**
   * One record with every column. No `$select` on purpose — the record panel
   * exists to show what is actually stored, and guessing a column list would
   * defeat that.
   */
  getRecord(
    envKey: string,
    entitySet: string,
    recordId: string,
  ): Promise<OdataRow>
  /**
   * 1:N relationships of a table, for the record panel's Related tab. Loaded
   * on demand — the browse path never needs them.
   */
  listCollections(envKey: string, logicalName: string): Promise<CollectionRef[]>
  /** Forget cached metadata for an environment (the ⟳ metadata button). */
  refreshMetadata(envKey: string): void

  // --- write seams, disabled in v1 ---------------------------------------
  createRecord(envKey: string, draft: RecordDraft): Promise<WriteResult>
  updateRecord(envKey: string, draft: RecordDraft): Promise<WriteResult>
  deleteRecord(
    envKey: string,
    entitySet: string,
    recordId: string,
  ): Promise<WriteResult>
}

export const odataBrowserService: OdataBrowserService =
  dataverseOdataBrowserService
