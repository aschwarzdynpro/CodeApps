import type {
  ImportJobSummary,
  ImportLogDetail,
} from '../types/importHistory'
import { dataverseImportHistoryService } from './dataverseImportHistoryService'

/**
 * Service contract for the Solution Import History viewer.
 *
 * - `listImportJobs()` returns the `importjob` rows of the selected
 *   environment WITHOUT the heavy `data` column (the annotated manifest XML
 *   can be megabytes).
 * - `getImportLog()` fetches one job's XML lazily and parses it into the
 *   structured detail (manifest verdict, missing-dependency table, generic
 *   failures). Read-only.
 */
export interface ImportHistoryService {
  listImportJobs(envKey: string): Promise<ImportJobSummary[]>
  getImportLog(jobId: string, envKey: string): Promise<ImportLogDetail>
}

export const importHistoryService: ImportHistoryService =
  dataverseImportHistoryService
