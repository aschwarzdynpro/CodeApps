/*!
 * HAND-WRITTEN replacement for a generated file — see LeadsModel.ts for why.
 * Read-only: the dashboard only lists leads; create/update/delete are
 * intentionally not exposed.
 */

import type { IGetAllOptions } from '../models/CommonModels'
import type { IOperationResult } from '@microsoft/power-apps/data'
import type { Leads } from '../models/LeadsModel'
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo'
import { getClient } from '@microsoft/power-apps/data'

export class LeadsService {
  private static readonly dataSourceName = 'leads'

  private static readonly client = getClient(dataSourcesInfo)

  public static async getAll(options?: IGetAllOptions): Promise<IOperationResult<Leads[]>> {
    return LeadsService.client.retrieveMultipleRecordsAsync<Leads>(
      LeadsService.dataSourceName,
      options,
    )
  }
}
