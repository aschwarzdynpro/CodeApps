/**
 * Dataverse implementation of {@link SecurityBaselineService} — native CRUD on
 * `pro_securitysnapshot` as the signed-in user (see the interface for why).
 */
import type { IGetAllOptions } from '../generated/models/CommonModels'
import type { IOperationResult } from '@microsoft/power-apps/data'
import { powerModeReady } from '../PowerProvider'
import { Pro_securitysnapshotsService } from '../generated/services/Pro_securitysnapshotsService'
import type {
  Pro_securitysnapshots,
  Pro_securitysnapshotsBase,
} from '../generated/models/Pro_securitysnapshotsModel'
import type { SecuritySnapshotSummary } from '../types/roleComparer'
import { baselineSizeVerdict } from '../utils/securityBaseline'
import type {
  SaveBaselineInput,
  SecurityBaselineService,
} from './securityBaselineService'
import { mockSecurityBaselineService } from './mockSecurityBaselineService'

/** Page through a generated getAll until the result set is exhausted. */
async function fetchAll<T>(
  getAll: (options?: IGetAllOptions) => Promise<IOperationResult<T[]>>,
  options: IGetAllOptions,
): Promise<T[]> {
  const rows: T[] = []
  let skipToken: string | undefined
  do {
    const result = await getAll({ ...options, ...(skipToken ? { skipToken } : {}) })
    if (!result.success || !result.data) {
      console.warn('[baseline] page fetch failed — result:', result)
      throw new Error('Reading the security baselines failed.')
    }
    rows.push(...result.data)
    skipToken = result.skipToken
  } while (skipToken)
  return rows
}

function toSummary(row: Pro_securitysnapshots): SecuritySnapshotSummary {
  return {
    id: row.pro_securitysnapshotid,
    name: row.pro_name,
    scope: row.pro_scope_str ?? '',
    envKeys: (row.pro_envkeys_str ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    roleCount: row.pro_rolecount_int ?? 0,
    frozenOn: row.createdon,
    frozenBy: row.createdbyname,
    notes: row.pro_notes_txt,
  }
}

class DataverseSecurityBaselineService implements SecurityBaselineService {
  async list(): Promise<SecuritySnapshotSummary[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockSecurityBaselineService.list()
    try {
      // Deliberately WITHOUT pro_payload_txt — the payload is up to ~900 kB
      // per row and the picker only needs the header (same reasoning as never
      // selecting importjob.data in the Import History).
      const rows = await fetchAll(
        (o) => Pro_securitysnapshotsService.getAll(o),
        {
          select: [
            'pro_securitysnapshotid',
            'pro_name',
            'pro_scope_str',
            'pro_envkeys_str',
            'pro_rolecount_int',
            'pro_notes_txt',
            'createdon',
          ],
          orderBy: ['createdon desc'],
        },
      )
      return rows.map(toSummary)
    } catch (err) {
      console.warn('[baseline] list() threw:', err)
      return []
    }
  }

  async getPayload(id: string): Promise<string | null> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockSecurityBaselineService.getPayload(id)
    try {
      const result = await Pro_securitysnapshotsService.get(id, {
        select: ['pro_securitysnapshotid', 'pro_payload_txt'],
      })
      if (!result.success || !result.data) return null
      return result.data.pro_payload_txt ?? null
    } catch (err) {
      console.warn('[baseline] getPayload() threw:', err)
      return null
    }
  }

  async save(input: SaveBaselineInput): Promise<SecuritySnapshotSummary> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockSecurityBaselineService.save(input)
    // Refuse rather than let Dataverse truncate: a shortened baseline would
    // report every dropped role as unchanged.
    const verdict = baselineSizeVerdict(input.payload)
    if (!verdict.ok) throw new Error(verdict.message)
    const record = {
      pro_name: input.name,
      pro_scope_str: input.scope,
      pro_envkeys_str: input.envKeys.join(','),
      pro_rolecount_int: input.roleCount,
      pro_payload_txt: input.payload,
      ...(input.notes ? { pro_notes_txt: input.notes } : {}),
    } as unknown as Omit<Pro_securitysnapshotsBase, 'pro_securitysnapshotid'>
    const result = await Pro_securitysnapshotsService.create(record)
    if (!result.success || !result.data) {
      console.warn('[baseline] save rejected:', result)
      throw new Error('Freezing the baseline failed.')
    }
    return toSummary(result.data)
  }

  async remove(id: string): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockSecurityBaselineService.remove(id)
    await Pro_securitysnapshotsService.delete(id)
  }
}

export const dataverseSecurityBaselineService =
  new DataverseSecurityBaselineService()
