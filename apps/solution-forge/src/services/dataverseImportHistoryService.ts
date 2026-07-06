import type {
  ImportJobQuery,
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

/**
 * Build the `<filter>` for a query. Status is the viewer's heuristic
 * (`utils/importLog.ts → importJobStatusHeuristic`) expressed as fetch
 * conditions: succeeded = progress ≥ 100; failed = completed but progress < 100;
 * running = not completed and progress < 100.
 */
function buildFilter(query?: ImportJobQuery): string {
  const conditions: string[] = []
  if (query?.solutionName) {
    const op = query.solutionMatch === 'like' ? 'like' : 'eq'
    const value =
      op === 'like'
        ? `%${fetchXmlEscape(query.solutionName)}%`
        : fetchXmlEscape(query.solutionName)
    conditions.push(
      `<condition attribute="solutionname" operator="${op}" value="${value}" />`,
    )
  }
  if (query?.status === 'failed')
    conditions.push(
      `<condition attribute="completedon" operator="not-null" />`,
      `<condition attribute="progress" operator="lt" value="100" />`,
    )
  else if (query?.status === 'succeeded')
    conditions.push(
      `<condition attribute="progress" operator="ge" value="100" />`,
    )
  else if (query?.status === 'running')
    conditions.push(
      `<condition attribute="completedon" operator="null" />`,
      `<condition attribute="progress" operator="lt" value="100" />`,
    )
  return conditions.length
    ? `<filter type="and">${conditions.join('')}</filter>`
    : ''
}

class DataverseImportHistoryService implements ImportHistoryService {
  async listImportJobs(
    envKey: string,
    query?: ImportJobQuery,
  ): Promise<ImportJobSummary[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockImportHistoryService.listImportJobs(envKey, query)
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
      buildFilter(query) +
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
