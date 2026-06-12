import type { IOperationResult } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import { getClient } from '@microsoft/power-apps/data'

/**
 * Hand-maintained client for the Dataverse function
 * `RetrieveMissingDependencies(SolutionUniqueName='…')` — required
 * components of a solution that are not part of the solution itself.
 *
 * Mirrors the generated function pattern (see audit-explorer's
 * RetrieveAuditDetailsService); the matching "retrievemissingdependencies"
 * entry in .power/schemas/appschemas/dataSourcesInfo.ts is re-inserted by
 * scripts/add-data-source.ps1 after every generator run. Lives outside
 * src/generated/ so it is committed.
 */
export class RetrieveMissingDependenciesService {
  private static readonly dataSourceName = 'retrievemissingdependencies'

  private static readonly client = getClient(dataSourcesInfo)

  public static async RetrieveMissingDependencies(
    solutionUniqueName: string,
  ): Promise<IOperationResult<Record<string, unknown>>> {
    const params: { solutionUniqueName: string } = { solutionUniqueName }
    const result = await RetrieveMissingDependenciesService.client.executeAsync<
      { solutionUniqueName: string },
      Record<string, unknown>
    >({
      dataverseRequest: {
        action: 'customapi',
        parameters: {
          operationName: 'RetrieveMissingDependencies',
          tableName: RetrieveMissingDependenciesService.dataSourceName,
          body: params,
        },
      },
    })
    return result
  }
}
