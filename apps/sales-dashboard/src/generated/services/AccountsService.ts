/*!
 * HAND-WRITTEN replacement for a generated file — see AccountsModel.ts for
 * why. Read-only.
 */

import type { IGetAllOptions } from '../models/CommonModels'
import type { IOperationResult } from '@microsoft/power-apps/data'
import type { Accounts } from '../models/AccountsModel'
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo'
import { getClient } from '@microsoft/power-apps/data'

export class AccountsService {
  private static readonly dataSourceName = 'accounts'

  private static readonly client = getClient(dataSourcesInfo)

  public static async getAll(options?: IGetAllOptions): Promise<IOperationResult<Accounts[]>> {
    return AccountsService.client.retrieveMultipleRecordsAsync<Accounts>(
      AccountsService.dataSourceName,
      options,
    )
  }
}
