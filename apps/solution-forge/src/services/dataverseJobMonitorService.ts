import type {
  AsyncJobInfo,
  FlowFilter,
  FlowInfo,
  FlowRunDetailField,
  FlowRunInfo,
  FlowRunStats,
  JobActionResult,
  JobFilter,
  JobHealthSummary,
  JobTrendPoint,
  WatchdogEntry,
} from '../types/jobs'
import { ASYNC_STATUS, ASYNC_STATUS_LABELS } from '../types/jobs'
import type { JobMonitorService } from './jobMonitorService'
import { JOB_BULK_LIMIT } from './jobMonitorService'
import { mockJobMonitorService } from './mockJobMonitorService'
import { powerModeReady } from '../PowerProvider'
import {
  fetchXmlAllPages,
  fetchXmlEscape,
  fetchXmlQuery,
  formattedValue,
  rowNum,
  rowStr,
  type Row,
} from './currentEnvQuery'
import { evaluateHeartbeat } from '../utils/heartbeat'
import {
  environmentIdForEnvKey,
  flowRunUrl,
  isCurrentEnvKey,
  orgUrlForEnvKey,
  WATCHDOG_TABLES,
} from '../config'
import { AsyncoperationsService } from '../generated/services/AsyncoperationsService'

/**
 * Real implementation of {@link JobMonitorService}.
 *
 * Reads use the connector's FetchXML passthrough against the current
 * environment (SP identity). `asyncoperation` is huge — every query carries
 * a time filter and a row cap; aggregates run server-side. Cancels/retries
 * write through the NATIVE `asyncoperation` data source, i.e. as the
 * signed-in user, so ownership/privileges are enforced per user and the
 * audit trail shows who acted.
 */

const JOB_LIST_LIMIT = 200
const FLOW_RUN_SAMPLE = 20
const FLOW_STATS_MAX_FLOWS = 20

function sinceIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000)
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
}

function toJob(row: Row): AsyncJobInfo {
  const statusCode = rowNum(row.statuscode)
  return {
    id: rowStr(row.asyncoperationid),
    name: rowStr(row.name),
    operationType: rowNum(row.operationtype),
    operationTypeLabel:
      formattedValue(row, 'operationtype') ?? String(rowNum(row.operationtype)),
    stateCode: rowNum(row.statecode),
    statusCode,
    statusLabel:
      formattedValue(row, 'statuscode') ??
      ASYNC_STATUS_LABELS[statusCode] ??
      String(statusCode),
    createdOn: rowStr(row.createdon),
    startedOn: rowStr(row.startedon),
    completedOn: rowStr(row.completedon),
    retryCount: rowNum(row.retrycount),
    message: rowStr(row.friendlymessage),
    ownerName: formattedValue(row, 'ownerid') ?? '',
    regardingName: formattedValue(row, 'regardingobjectid') ?? '',
  }
}

/** count + min(createdon) aggregate over asyncoperation with a filter. */
async function countJobs(
  conditions: string,
  orgUrl: string,
  withOldest = false,
): Promise<{ count: number; oldest: string }> {
  const fetchXml =
    `<fetch aggregate="true">` +
    `<entity name="asyncoperation">` +
    `<attribute name="asyncoperationid" alias="cnt" aggregate="count" />` +
    (withOldest
      ? `<attribute name="createdon" alias="oldest" aggregate="min" />`
      : '') +
    `<filter type="and">${conditions}</filter>` +
    `</entity></fetch>`
  const rows = await fetchXmlQuery('asyncoperations', fetchXml, orgUrl)
  const row = rows[0]
  return {
    count: row ? rowNum(row.cnt) : 0,
    oldest: row ? rowStr(row.oldest) : '',
  }
}

/**
 * Guard the native write paths: the `asyncoperation` source always targets
 * the host env, so refuse a cross-env write rather than silently changing
 * jobs in the wrong environment. The UI disables the buttons too.
 */
function assertHostEnv(envKey: string, action: string): void {
  if (!isCurrentEnvKey(envKey))
    throw new Error(
      `Cannot ${action} in another environment — native writes only target the host environment. Switch the target back to the current environment.`,
    )
}

/** Sequential bulk state change with per-job outcome. */
async function bulkSetState(
  jobs: { id: string; name: string }[],
  changes: Record<string, unknown>,
  onProgress?: (done: number, total: number) => void,
): Promise<JobActionResult[]> {
  const batch = jobs.slice(0, JOB_BULK_LIMIT)
  const results: JobActionResult[] = []
  let done = 0
  for (const job of batch) {
    try {
      const result = await AsyncoperationsService.update(job.id, changes)
      if (result && result.success === false) {
        const detail = (result as { error?: { message?: string } }).error
          ?.message
        throw new Error(detail || 'update rejected')
      }
      results.push({ id: job.id, name: job.name, ok: true })
    } catch (err) {
      results.push({
        id: job.id,
        name: job.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    onProgress?.(++done, batch.length)
  }
  return results
}

/** flowrun columns to omit from the run popup (internal / noise). */
const RUN_FIELD_SKIP = new Set([
  'flowrunid',
  'versionnumber',
  'importsequencenumber',
  'overriddencreatedon',
  'timezoneruleversionnumber',
  'utcconversiontimezonecode',
  'owningbusinessunit',
  'owningteam',
  'owninguser',
])

/** Friendly labels for the common flowrun columns. */
const RUN_FIELD_LABELS: Record<string, string> = {
  name: 'Run id',
  status: 'Status',
  starttime: 'Start time',
  endtime: 'End time',
  errorcode: 'Error code',
  errormessage: 'Error message',
  triggertype: 'Trigger type',
  workflow: 'Flow',
  createdon: 'Created on',
  modifiedon: 'Modified on',
  ownerid: 'Owner',
}

function humanizeField(key: string): string {
  return key
    .replace(/^_/, '')
    .replace(/_value$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Turn a raw flowrun row (`<all-attributes/>`) into a label/value list —
 *  formatted values preferred, empties and annotations dropped. */
function formatRunFields(row: Row): FlowRunDetailField[] {
  const fields: FlowRunDetailField[] = []
  for (const key of Object.keys(row)) {
    if (key.includes('@')) continue // annotation — surfaced via formattedValue
    let logical = key
    let value: string
    if (key.startsWith('_') && key.endsWith('_value')) {
      logical = key.slice(1, -'_value'.length)
      const fv = formattedValue(row, key)
      if (RUN_FIELD_SKIP.has(logical) || !fv) continue
      value = fv
    } else {
      if (RUN_FIELD_SKIP.has(key)) continue
      const raw = row[key]
      if (
        raw === null ||
        raw === undefined ||
        raw === '' ||
        typeof raw === 'object'
      )
        continue
      value = formattedValue(row, key) ?? String(raw)
    }
    fields.push({
      label: RUN_FIELD_LABELS[logical] ?? humanizeField(logical),
      value,
    })
  }
  return fields
}

class DataverseJobMonitorService implements JobMonitorService {
  async getHealthSummary(envKey: string): Promise<JobHealthSummary> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockJobMonitorService.getHealthSummary(envKey)
    const orgUrl = orgUrlForEnvKey(envKey)

    const failedP = countJobs(
      `<condition attribute="createdon" operator="ge" value="${sinceIso(24)}" />` +
        `<condition attribute="statuscode" operator="eq" value="${ASYNC_STATUS.failed}" />`,
      orgUrl,
    )
    const waitingP = countJobs(
      `<condition attribute="statuscode" operator="in"><value>${ASYNC_STATUS.waitingForResources}</value><value>${ASYNC_STATUS.waiting}</value></condition>`,
      orgUrl,
      true,
    )
    // Flow failure rate from a bounded sample of the newest runs across all
    // flows — labelled as a sample in the UI.
    const flowSampleP = (async () => {
      try {
        const fetchXml =
          `<fetch count="100">` +
          `<entity name="flowrun">` +
          `<attribute name="flowrunid" />` +
          `<attribute name="status" />` +
          `<attribute name="starttime" />` +
          `<filter><condition attribute="starttime" operator="ge" value="${sinceIso(24)}" /></filter>` +
          `<order attribute="starttime" descending="true" />` +
          `</entity></fetch>`
        const rows = await fetchXmlQuery('flowruns', fetchXml, orgUrl)
        const failed = rows.filter((r) =>
          rowStr(r.status).toLowerCase().includes('fail'),
        ).length
        return {
          rate: rows.length ? failed / rows.length : 0,
          size: rows.length,
        }
      } catch (err) {
        console.warn('[jobs] flowrun sample failed:', err)
        return null
      }
    })()
    const watchdogP = this.listWatchdog(envKey)

    const [failed, waiting, flowSample, watchdog] = await Promise.all([
      failedP,
      waitingP,
      flowSampleP,
      watchdogP,
    ])
    const wd = { ok: 0, overdue: 0, never: 0, inactive: 0 }
    for (const entry of watchdog.entries) wd[entry.state]++
    return {
      failed24h: failed.count,
      waitingCount: waiting.count,
      oldestWaitingOn: waiting.oldest,
      flowFailRate24h: flowSample ? flowSample.rate : null,
      flowSampleSize: flowSample?.size ?? 0,
      watchdog: wd,
      watchdogAvailable: watchdog.available,
    }
  }

  async listJobs(filter: JobFilter, envKey: string): Promise<AsyncJobInfo[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockJobMonitorService.listJobs(filter, envKey)
    const conditions: string[] = [
      `<condition attribute="createdon" operator="ge" value="${sinceIso(filter.hours)}" />`,
    ]
    if (filter.statusCodes && filter.statusCodes.length > 0)
      conditions.push(
        `<condition attribute="statuscode" operator="in">${filter.statusCodes
          .map((c) => `<value>${c}</value>`)
          .join('')}</condition>`,
      )
    if (filter.operationType !== undefined)
      conditions.push(
        `<condition attribute="operationtype" operator="eq" value="${filter.operationType}" />`,
      )
    if (filter.nameSearch?.trim())
      conditions.push(
        `<condition attribute="name" operator="like" value="%${fetchXmlEscape(filter.nameSearch.trim())}%" />`,
      )
    const fetchXml =
      `<fetch count="${JOB_LIST_LIMIT}">` +
      `<entity name="asyncoperation">` +
      `<attribute name="asyncoperationid" />` +
      `<attribute name="name" />` +
      `<attribute name="operationtype" />` +
      `<attribute name="statecode" />` +
      `<attribute name="statuscode" />` +
      `<attribute name="createdon" />` +
      `<attribute name="startedon" />` +
      `<attribute name="completedon" />` +
      `<attribute name="retrycount" />` +
      `<attribute name="friendlymessage" />` +
      `<attribute name="ownerid" />` +
      `<attribute name="regardingobjectid" />` +
      `<filter type="and">${conditions.join('')}</filter>` +
      `<order attribute="createdon" descending="true" />` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery(
      'asyncoperations',
      fetchXml,
      orgUrlForEnvKey(envKey),
    )
    return rows.map(toJob)
  }

  async cancelJobs(
    jobs: { id: string; name: string }[],
    envKey: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<JobActionResult[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockJobMonitorService.cancelJobs(jobs, envKey, onProgress)
    assertHostEnv(envKey, 'cancel jobs')
    return bulkSetState(
      jobs,
      { statecode: 3, statuscode: ASYNC_STATUS.canceled },
      onProgress,
    )
  }

  async retryJobs(
    jobs: { id: string; name: string }[],
    envKey: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<JobActionResult[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockJobMonitorService.retryJobs(jobs, envKey, onProgress)
    assertHostEnv(envKey, 'retry jobs')
    // Back to Ready / Waiting for resources — the async service picks it up.
    return bulkSetState(
      jobs,
      { statecode: 0, statuscode: ASYNC_STATUS.waitingForResources },
      onProgress,
    )
  }

  async listFlows(envKey: string, filter?: FlowFilter): Promise<FlowInfo[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockJobMonitorService.listFlows(envKey, filter)
    // category 5 = modern (cloud) flow, type 1 = definition.
    const conditions = [
      `<condition attribute="category" operator="eq" value="5" />`,
      `<condition attribute="type" operator="eq" value="1" />`,
    ]
    if (filter?.nameSearch?.trim())
      conditions.push(
        `<condition attribute="name" operator="like" value="%${fetchXmlEscape(filter.nameSearch.trim())}%" />`,
      )
    // Solution membership: link workflow → solutioncomponent (componenttype 29
    // = Process) → solution, filtered by the import-stable unique name.
    const solutionLink = filter?.solutionUniqueName
      ? `<link-entity name="solutioncomponent" from="objectid" to="workflowid" link-type="inner">` +
        `<filter><condition attribute="componenttype" operator="eq" value="29" /></filter>` +
        `<link-entity name="solution" from="solutionid" to="solutionid" link-type="inner">` +
        `<filter><condition attribute="uniquename" operator="eq" value="${fetchXmlEscape(filter.solutionUniqueName)}" /></filter>` +
        `</link-entity></link-entity>`
      : ''
    // No row cap — page through every matching flow (a single 5 000 page in
    // practice; no environment has that many cloud flows).
    const fetchXml =
      `<fetch>` +
      `<entity name="workflow">` +
      `<attribute name="workflowid" />` +
      `<attribute name="workflowidunique" />` +
      `<attribute name="name" />` +
      `<attribute name="statecode" />` +
      `<attribute name="modifiedon" />` +
      `<attribute name="ownerid" />` +
      `<filter type="and">${conditions.join('')}</filter>` +
      solutionLink +
      `<order attribute="modifiedon" descending="true" />` +
      `</entity></fetch>`
    const rows = await fetchXmlAllPages('workflows', fetchXml, orgUrlForEnvKey(envKey))
    return rows.map((row) => ({
      workflowId: rowStr(row.workflowid),
      workflowIdUnique: rowStr(row.workflowidunique),
      name: rowStr(row.name),
      stateCode: rowNum(row.statecode),
      ownerName: formattedValue(row, 'ownerid') ?? '',
      modifiedOn: rowStr(row.modifiedon),
    }))
  }

  async sampleFlowStats(
    flows: FlowInfo[],
    envKey: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Map<string, FlowRunStats | undefined>> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockJobMonitorService.sampleFlowStats(flows, envKey, onProgress)
    const orgUrl = orgUrlForEnvKey(envKey)
    // Connector rate limits: sample only the given flows, hard-capped.
    const targets = flows.slice(0, FLOW_STATS_MAX_FLOWS)
    const map = new Map<string, FlowRunStats | undefined>()
    let done = 0
    for (const flow of targets) {
      try {
        const fetchXml =
          `<fetch count="${FLOW_RUN_SAMPLE}">` +
          `<entity name="flowrun">` +
          `<attribute name="flowrunid" />` +
          `<attribute name="status" />` +
          `<attribute name="starttime" />` +
          `<filter><condition attribute="workflow" operator="eq" value="${fetchXmlEscape(flow.workflowId)}" /></filter>` +
          `<order attribute="starttime" descending="true" />` +
          `</entity></fetch>`
        const rows = await fetchXmlQuery('flowruns', fetchXml, orgUrl)
        const failed = rows.filter((r) =>
          rowStr(r.status).toLowerCase().includes('fail'),
        ).length
        map.set(flow.workflowId, {
          sampleSize: rows.length,
          failed,
          failRate: rows.length ? failed / rows.length : 0,
          lastRunOn: rowStr(rows[0]?.starttime),
        })
      } catch (err) {
        console.warn(`[jobs] run sample for flow ${flow.name} failed:`, err)
        map.set(flow.workflowId, undefined)
      }
      onProgress?.(++done, targets.length)
    }
    return map
  }

  async listFlowRuns(flow: FlowInfo, envKey: string): Promise<FlowRunInfo[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockJobMonitorService.listFlowRuns(flow, envKey)
    const environmentId = environmentIdForEnvKey(envKey)
    const fetchXml =
      `<fetch count="50">` +
      `<entity name="flowrun">` +
      `<attribute name="flowrunid" />` +
      `<attribute name="name" />` +
      `<attribute name="status" />` +
      `<attribute name="starttime" />` +
      `<attribute name="endtime" />` +
      `<attribute name="errormessage" />` +
      `<filter><condition attribute="workflow" operator="eq" value="${fetchXmlEscape(flow.workflowId)}" /></filter>` +
      `<order attribute="starttime" descending="true" />` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery('flowruns', fetchXml, orgUrlForEnvKey(envKey))
    return rows.map((row) => {
      const start = rowStr(row.starttime)
      const end = rowStr(row.endtime)
      const runName = rowStr(row.name)
      return {
        id: rowStr(row.flowrunid),
        runName,
        status: rowStr(row.status),
        startTime: start,
        endTime: end,
        durationMs:
          start && end
            ? Math.max(0, new Date(end).getTime() - new Date(start).getTime())
            : 0,
        errorMessage: rowStr(row.errormessage),
        portalUrl: flowRunUrl(environmentId, flow.workflowIdUnique, runName),
      }
    })
  }

  async getFlowRunDetail(
    run: FlowRunInfo,
    envKey: string,
  ): Promise<FlowRunDetailField[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockJobMonitorService.getFlowRunDetail(run, envKey)
    const fetchXml =
      `<fetch count="1"><entity name="flowrun"><all-attributes />` +
      `<filter><condition attribute="flowrunid" operator="eq" value="${fetchXmlEscape(run.id)}" /></filter>` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery(
      'flowruns',
      fetchXml,
      orgUrlForEnvKey(envKey),
    )
    return formatRunFields(rows[0] ?? {})
  }

  async listWatchdog(envKey: string): Promise<{
    available: boolean
    entries: WatchdogEntry[]
  }> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockJobMonitorService.listWatchdog(envKey)
    const orgUrl = orgUrlForEnvKey(envKey)
    const t = WATCHDOG_TABLES
    let defRows: Row[]
    try {
      const fetchXml =
        `<fetch count="100">` +
        `<entity name="${t.definitionEntity}">` +
        `<attribute name="${t.definitionIdAttr}" />` +
        `<attribute name="${t.definitionNameAttr}" />` +
        `<attribute name="${t.intervalAttr}" />` +
        `<attribute name="${t.graceAttr}" />` +
        `<attribute name="${t.activeAttr}" />` +
        `</entity></fetch>`
      defRows = await fetchXmlQuery(t.definitionEntitySet, fetchXml, orgUrl)
    } catch (err) {
      // The watchdog tables are optional — most likely they simply aren't
      // installed in this environment.
      console.warn('[jobs] watchdog definition query failed:', err)
      return { available: false, entries: [] }
    }
    const now = new Date()
    const entries: WatchdogEntry[] = []
    for (const row of defRows) {
      const definition = {
        id: rowStr(row[t.definitionIdAttr]),
        name: rowStr(row[t.definitionNameAttr]) || '(unnamed)',
        expectedIntervalMinutes: rowNum(row[t.intervalAttr]),
        graceMinutes: rowNum(row[t.graceAttr]),
        isActive: row[t.activeAttr] !== false,
      }
      let lastBeat: WatchdogEntry['lastBeat'] = null
      try {
        const beatFetch =
          `<fetch count="1">` +
          `<entity name="${t.beatEntity}">` +
          `<attribute name="${t.beatTimestampAttr}" />` +
          `<attribute name="${t.beatStatusAttr}" />` +
          `<attribute name="${t.beatMessageAttr}" />` +
          `<filter><condition attribute="${t.beatDefinitionAttr}" operator="eq" value="${fetchXmlEscape(definition.id)}" /></filter>` +
          `<order attribute="${t.beatTimestampAttr}" descending="true" />` +
          `</entity></fetch>`
        const beatRows = await fetchXmlQuery(t.beatEntitySet, beatFetch, orgUrl)
        const beat = beatRows[0]
        if (beat)
          lastBeat = {
            timestamp: rowStr(beat[t.beatTimestampAttr]),
            status: rowStr(beat[t.beatStatusAttr]),
            message: rowStr(beat[t.beatMessageAttr]),
          }
      } catch (err) {
        console.warn(`[jobs] beat query for ${definition.name} failed:`, err)
      }
      const verdict = evaluateHeartbeat(definition, lastBeat, now)
      entries.push({
        definition,
        lastBeat,
        state: verdict.state,
        overdueMinutes: verdict.overdueMinutes,
      })
    }
    // Red first, then never-beaten, then healthy, inactive last.
    const rank: Record<WatchdogEntry['state'], number> = {
      overdue: 0,
      never: 1,
      ok: 2,
      inactive: 3,
    }
    entries.sort((a, b) => rank[a.state] - rank[b.state])
    return { available: true, entries }
  }

  async getTrends(days: number, envKey: string): Promise<JobTrendPoint[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockJobMonitorService.getTrends(days, envKey)
    const orgUrl = orgUrlForEnvKey(envKey)
    const grouped = async (extra: string): Promise<Map<string, number>> => {
      const fetchXml =
        `<fetch aggregate="true">` +
        `<entity name="asyncoperation">` +
        `<attribute name="asyncoperationid" alias="cnt" aggregate="count" />` +
        `<attribute name="createdon" alias="d" groupby="true" dategrouping="day" />` +
        `<attribute name="createdon" alias="m" groupby="true" dategrouping="month" />` +
        `<attribute name="createdon" alias="y" groupby="true" dategrouping="year" />` +
        `<filter type="and">` +
        `<condition attribute="createdon" operator="last-x-days" value="${days}" />` +
        extra +
        `</filter>` +
        `</entity></fetch>`
      const rows = await fetchXmlQuery('asyncoperations', fetchXml, orgUrl)
      const map = new Map<string, number>()
      for (const row of rows) {
        const key = `${rowNum(row.y)}-${String(rowNum(row.m)).padStart(2, '0')}-${String(rowNum(row.d)).padStart(2, '0')}`
        map.set(key, (map.get(key) ?? 0) + rowNum(row.cnt))
      }
      return map
    }
    const failedMap = await grouped(
      `<condition attribute="statuscode" operator="eq" value="${ASYNC_STATUS.failed}" />`,
    )
    // The unfiltered total can exceed the 50 000-row aggregate limit on busy
    // environments — degrade to a failed-only trend instead of failing.
    let totalMap: Map<string, number> | null = null
    try {
      totalMap = await grouped('')
    } catch (err) {
      console.warn('[jobs] total-per-day aggregate failed (degrading):', err)
    }
    const points: JobTrendPoint[] = []
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86_400_000)
        .toISOString()
        .slice(0, 10)
      points.push({
        day,
        failed: failedMap.get(day) ?? 0,
        total: totalMap?.get(day) ?? 0,
      })
    }
    return points
  }
}

export const dataverseJobMonitorService: JobMonitorService =
  new DataverseJobMonitorService()
