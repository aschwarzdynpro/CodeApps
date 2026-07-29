import type {
  EntityMeta,
  EntityRef,
  ODataQuery,
  OdataRow,
  OptionLabel,
  QueryResult,
  RecordDraft,
  WriteResult,
} from '../types/odataBrowser'
import type { OdataBrowserService } from './odataBrowserService'
import { mockOdataBrowserService } from './mockOdataBrowserService'
import { powerModeReady } from '../PowerProvider'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'
import { envByKey, orgUrlForEnvKey } from '../config'
import {
  cachedEntitySets,
  clearMetadataCache,
  getEntityMeta,
  getOptionLabels,
  listEntities,
} from './metadataCatalog'
import { fetchXmlQuery } from './currentEnvQuery'
import {
  columnMap,
  preferHeader,
  renderQueryOptions,
  skipTokenFrom,
  type Columns,
} from '../utils/odataQuery'
import { OdataQueryError, describeOdataFault } from '../utils/odataErrors'

/**
 * Real implementation of {@link OdataBrowserService}.
 *
 * Everything runs over `ListRecordsWithOrganization` — the same connector op
 * the Operate features use — so the browser needs no new data source and can
 * address every configured environment. Identity is the connection's service
 * principal (see the interface docs and the workspace banner).
 *
 * The `prefer` header carries two things the browser depends on:
 * `odata.include-annotations="*"` (formatted values + lookup logical names, so
 * the grid can show "Active" and a contact name instead of 0 and a GUID) and
 * `odata.maxpagesize=<n>` (server-driven paging, which is what produces the
 * `@odata.nextLink` we turn back into a skip token).
 */

/**
 * v1 is read-only. Flipping this to `true` is only half the job — the three
 * write methods below still need their bodies, and the UI needs the write
 * affordances behind `canWrite`. See docs/odata-browser-plan.md §12.
 */
const WRITE_ENABLED: boolean = false

const writeDisabled = (): never => {
  throw new OdataQueryError(
    'OData Browser write mode is disabled.',
    'v1 is read-only by decision — queries run as the connector service principal, so an unguarded write path would be an admin editor over every table. See docs/odata-browser-plan.md §12.',
  )
}

class DataverseOdataBrowserService implements OdataBrowserService {
  async listEntities(envKey: string): Promise<EntityRef[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockOdataBrowserService.listEntities(envKey)
    try {
      return await listEntities(orgUrlForEnvKey(envKey))
    } catch (err) {
      throw this.toQueryError(err, envKey, 'EntityDefinitions')
    }
  }

  async getEntityMeta(
    envKey: string,
    logicalName: string,
  ): Promise<EntityMeta> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockOdataBrowserService.getEntityMeta(envKey, logicalName)
    try {
      return await getEntityMeta(orgUrlForEnvKey(envKey), logicalName)
    } catch (err) {
      throw this.toQueryError(err, envKey, 'EntityDefinitions')
    }
  }

  async runQuery(
    envKey: string,
    query: ODataQuery,
    skipToken: string | null = null,
  ): Promise<QueryResult> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockOdataBrowserService.runQuery(envKey, query, skipToken)
    if (!query.entitySet) throw new OdataQueryError('No table selected.')

    const orgUrl = orgUrlForEnvKey(envKey)
    // The structured filter can only be rendered correctly with the column
    // kinds at hand (a numeric column must not be quoted). Both reads below
    // are cache hits after the table was picked.
    const opts = renderQueryOptions(
      query,
      await this.columnsFor(envKey, query.entitySet),
    )
    const started = performance.now()
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      orgUrl,
      query.entitySet,
      preferHeader(query),
      undefined, // accept
      undefined, // x-ms-odata-metadata-full
      undefined, // MSCRM.IncludeMipSensitivityLabel
      opts.select,
      opts.filter,
      opts.orderby,
      opts.expand,
      undefined, // fetchXml — the browser is the OData path on purpose
      opts.top,
      skipToken ?? undefined,
    )
    const durationMs = Math.round(performance.now() - started)
    if (!result.success) throw this.toQueryError(result, envKey, query.entitySet)

    const data = result.data as
      | { value?: OdataRow[]; '@odata.nextLink'?: unknown }
      | undefined
    return {
      rows: data?.value ?? [],
      skipToken: skipTokenFrom(data?.['@odata.nextLink']),
      durationMs,
    }
  }

  async listOptions(
    envKey: string,
    objectTypeCode: number,
    attributeLogicalName: string,
  ): Promise<OptionLabel[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockOdataBrowserService.listOptions(
        envKey,
        objectTypeCode,
        attributeLogicalName,
      )
    return getOptionLabels(
      orgUrlForEnvKey(envKey),
      objectTypeCode,
      attributeLogicalName,
    )
  }

  async countRows(
    envKey: string,
    entitySet: string,
    fetchXml: string,
  ): Promise<number | 'over-limit'> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockOdataBrowserService.countRows(envKey, entitySet, fetchXml)
    try {
      const rows = await fetchXmlQuery(
        entitySet,
        fetchXml,
        orgUrlForEnvKey(envKey),
      )
      const value = rows[0]?.cnt
      const count = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(count))
        throw new OdataQueryError('The count query returned no result.')
      return count
    } catch (err) {
      // Dataverse caps aggregates at 50 000 rows and fails the whole query
      // rather than truncating — report the ceiling instead of a raw fault.
      const message = describeOdataFault(err).message.toLowerCase()
      if (
        message.includes('aggregate') &&
        (message.includes('limit') || message.includes('exceed'))
      )
        return 'over-limit'
      throw this.toQueryError(err, envKey, entitySet)
    }
  }

  refreshMetadata(envKey: string): void {
    clearMetadataCache(orgUrlForEnvKey(envKey))
  }

  /**
   * Column lookup for an entity set, from the metadata cache. Best-effort: an
   * empty map only degrades literal quoting, it never blocks the query.
   */
  private async columnsFor(envKey: string, entitySet: string): Promise<Columns> {
    try {
      const orgUrl = orgUrlForEnvKey(envKey)
      const ref = (await listEntities(orgUrl)).find(
        (e) => e.entitySet === entitySet,
      )
      if (!ref) return new Map()
      return columnMap(await getEntityMeta(orgUrl, ref.logicalName))
    } catch (err) {
      console.warn('[odata] column lookup for filter rendering failed:', err)
      return new Map()
    }
  }

  // --- write seams (disabled in v1) ---------------------------------------

  async createRecord(
    _envKey: string,
    _draft: RecordDraft,
  ): Promise<WriteResult> {
    void _envKey
    void _draft
    if (!WRITE_ENABLED) writeDisabled()
    throw new OdataQueryError('createRecord is not implemented yet.')
  }

  async updateRecord(
    _envKey: string,
    _draft: RecordDraft,
  ): Promise<WriteResult> {
    void _envKey
    void _draft
    if (!WRITE_ENABLED) writeDisabled()
    throw new OdataQueryError('updateRecord is not implemented yet.')
  }

  async deleteRecord(
    _envKey: string,
    _entitySet: string,
    _recordId: string,
  ): Promise<WriteResult> {
    void _envKey
    void _entitySet
    void _recordId
    if (!WRITE_ENABLED) writeDisabled()
    throw new OdataQueryError('deleteRecord is not implemented yet.')
  }

  /** Wrap a connector failure into a fault with a hint attached. */
  private toQueryError(
    err: unknown,
    envKey: string,
    entitySet: string,
  ): OdataQueryError {
    const fault = describeOdataFault(err, {
      entitySet,
      envLabel: envByKey(envKey)?.label ?? envKey,
      knownEntitySets: cachedEntitySets(orgUrlForEnvKey(envKey)),
    })
    return new OdataQueryError(fault.message, fault.hint)
  }
}

export const dataverseOdataBrowserService: OdataBrowserService =
  new DataverseOdataBrowserService()
