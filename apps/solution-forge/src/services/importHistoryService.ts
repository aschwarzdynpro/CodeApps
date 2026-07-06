import type {
  ImportJobQuery,
  ImportJobSummary,
  ImportLogDetail,
} from '../types/importHistory'
import { dataverseImportHistoryService } from './dataverseImportHistoryService'

/**
 * Service contract for the Solution Import History viewer.
 *
 * - `listImportJobs()` returns the `importjob` rows of the selected
 *   environment WITHOUT the heavy `data` column (the annotated manifest XML
 *   can be megabytes). An optional {@link ImportJobQuery} narrows the list
 *   server-side (by solution and/or status) — the list is capped, so filtering
 *   must happen in the query, not client-side.
 * - `getImportLog()` fetches one job's XML lazily and parses it into the
 *   structured detail (manifest verdict, missing-dependency table, generic
 *   failures). Read-only.
 */
export interface ImportHistoryService {
  listImportJobs(
    envKey: string,
    query?: ImportJobQuery,
  ): Promise<ImportJobSummary[]>
  getImportLog(jobId: string, envKey: string): Promise<ImportLogDetail>
}

export const importHistoryService: ImportHistoryService =
  dataverseImportHistoryService
