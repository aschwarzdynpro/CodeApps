import type {
  ImportJobSummary,
  ImportLogDetail,
} from '../types/importHistory'
import type { ImportHistoryService } from './importHistoryService'
import { mockImportHistoryService } from './mockImportHistoryService'
import { powerModeReady } from '../PowerProvider'
import {
  fetchXmlEscape,
  fetchXmlQuery,
  formattedValue,
  rowNum,
  rowStr,
} from './currentEnvQuery'
import { orgUrlForEnvKey } from '../config'
import { importJobStatusHeuristic, parseImportLog } from '../utils/importLog'

/**
 * Real implementation of {@link ImportHistoryService}. Reads the `importjob`
 * table of the chosen environment through the connector (SP identity). The
 * `data` column (the annotated manifest XML) is NEVER selected in the list —
 * it is fetched per job on expand and parsed client-side
 * (`utils/importLog.ts`).
 */

const LIST_LIMIT = 100

class DataverseImportHistoryService implements ImportHistoryService {
  async listImportJobs(envKey: string): Promise<ImportJobSummary[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockImportHistoryService.listImportJobs(envKey)
    const fetchXml =
      `<fetch count="${LIST_LIMIT}">` +
      `<entity name="importjob">` +
      `<attribute name="importjobid" />` +
      `<attribute name="solutionname" />` +
      `<attribute name="startedon" />` +
      `<attribute name="completedon" />` +
      `<attribute name="progress" />` +
      `<attribute name="createdby" />` +
      `<attribute name="createdon" />` +
      `<attribute name="importcontext" />` +
      `<attribute name="operationcontext" />` +
      `<order attribute="startedon" descending="true" />` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery(
      'importjobs',
      fetchXml,
      orgUrlForEnvKey(envKey),
    )
    return rows.map((row) => {
      const startedOn = rowStr(row.startedon) || rowStr(row.createdon)
      const completedOn = rowStr(row.completedon)
      const progress = rowNum(row.progress)
      const importContext = rowStr(row.importcontext)
      const operationContext = rowStr(row.operationcontext)
      return {
        id: rowStr(row.importjobid),
        solutionName: rowStr(row.solutionname) || '(unknown solution)',
        startedOn,
        completedOn,
        progress,
        status: importJobStatusHeuristic(progress, completedOn, startedOn),
        createdBy: formattedValue(row, 'createdby') ?? '',
        context: [operationContext, importContext].filter(Boolean).join(' · '),
      }
    })
  }

  async getImportLog(jobId: string, envKey: string): Promise<ImportLogDetail> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockImportHistoryService.getImportLog(jobId, envKey)
    const fetchXml =
      `<fetch count="1">` +
      `<entity name="importjob">` +
      `<attribute name="data" />` +
      `<filter><condition attribute="importjobid" operator="eq" value="${fetchXmlEscape(jobId)}" /></filter>` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery(
      'importjobs',
      fetchXml,
      orgUrlForEnvKey(envKey),
    )
    const xml = rowStr(rows[0]?.data)
    if (!xml)
      return {
        solutionUniqueName: '',
        solutionVersion: '',
        status: 'unknown',
        topErrorText:
          'The import job carries no log payload (the platform may have pruned it).',
        missingDependencies: [],
        failures: [],
      }
    return parseImportLog(xml)
  }
}

export const dataverseImportHistoryService: ImportHistoryService =
  new DataverseImportHistoryService()
