import type { IOperationResult } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { getClient } from '@microsoft/power-apps/data'

/**
 * Hand-maintained client for the Web API's SQL query option —
 * `GET /api/data/v9.2/{entitySet}?sql=SELECT …` — through the code app's
 * **native** Dataverse data source, i.e. as the signed-in user against the
 * app's own environment.
 *
 * Why not the connector: it has no `sql` parameter, and its API hub
 * percent-encodes the `entityName` path parameter (`accounts?sql=…` arrives
 * as `accounts%3Fsql%3D…`, gotcha #14). The native `customapi` executor of
 * `@microsoft/power-apps` behaves differently — it substitutes `{param}`
 * placeholders with `encodeURIComponent(value)` and keeps the rest of the
 * path template verbatim, then GETs `instanceUrl + path` with a dynamic
 * Dataverse token. So `?sql={sql}` can live in the template: the literal
 * `?sql=` survives, the statement is encoded exactly once, as a query value
 * should be.
 *
 * Two operations because the template is static: `ExecuteSql` for the first
 * page, `ExecuteSqlPage` when a `@odata.nextLink` handed back a `$skiptoken`
 * (an empty `$skiptoken=` would be rejected, so it cannot be one template
 * with an optional part). The executor sends no `Prefer` header, so rows
 * carry **no annotations** — raw values, no formatted labels.
 *
 * Mirrors `retrieveMissingDependenciesService.ts`; the matching `executesql`
 * block in `.power/schemas/appschemas/dataSourcesInfo.ts` is re-inserted by
 * `scripts/add-data-source.ps1` and `scripts/deploy-env.ps1` after every
 * generator run. Lives outside `src/generated/` so it is committed.
 */
export class ExecuteSqlService {
  private static readonly dataSourceName = 'executesql'

  private static readonly client = getClient(dataSourcesInfo)

  /** First page of a statement against an entity set. */
  public static async ExecuteSql(
    entitySetName: string,
    sql: string,
  ): Promise<IOperationResult<Record<string, unknown>>> {
    const params: { entitySetName: string; sql: string } = { entitySetName, sql }
    return ExecuteSqlService.client.executeAsync<
      { entitySetName: string; sql: string },
      Record<string, unknown>
    >({
      dataverseRequest: {
        action: 'customapi',
        parameters: {
          operationName: 'ExecuteSql',
          tableName: ExecuteSqlService.dataSourceName,
          body: params,
        },
      },
    })
  }

  /** A continuation page — `skiptoken` as extracted from `@odata.nextLink`. */
  public static async ExecuteSqlPage(
    entitySetName: string,
    sql: string,
    skiptoken: string,
  ): Promise<IOperationResult<Record<string, unknown>>> {
    const params: { entitySetName: string; sql: string; skiptoken: string } = {
      entitySetName,
      sql,
      skiptoken,
    }
    return ExecuteSqlService.client.executeAsync<
      { entitySetName: string; sql: string; skiptoken: string },
      Record<string, unknown>
    >({
      dataverseRequest: {
        action: 'customapi',
        parameters: {
          operationName: 'ExecuteSqlPage',
          tableName: ExecuteSqlService.dataSourceName,
          body: params,
        },
      },
    })
  }
}
