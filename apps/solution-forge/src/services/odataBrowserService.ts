import type {
  EntityMeta,
  EntityRef,
  ODataQuery,
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
