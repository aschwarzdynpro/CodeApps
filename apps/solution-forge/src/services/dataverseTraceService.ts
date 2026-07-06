import type {
  PluginTraceDetail,
  PluginTraceSummary,
  TraceFilter,
  TraceLevel,
  TraceLevelInfo,
  TracePerfBucket,
} from '../types/traces'
import {
  TRACE_STREAM_LIMIT,
  TRACE_TEXT_SEARCH_MAX_HOURS,
} from '../types/traces'
import type { TraceService } from './traceService'
import { mockTraceService } from './mockTraceService'
import { powerModeReady } from '../PowerProvider'
import {
  fetchXmlEscape,
  fetchXmlQuery,
  rowNum,
  rowStr,
  type Row,
} from './currentEnvQuery'
import { isCurrentEnvKey, orgUrlForEnvKey } from '../config'
import { OrganizationsService } from '../generated/services/OrganizationsService'

/**
 * Real implementation of {@link TraceService}.
 *
 * Reads go through the Dataverse connector's FetchXML passthrough against the
 * current environment (SP identity — the connection needs read access to
 * `plugintracelog` and `organization`). The heavy `messageblock` /
 * `exceptiondetails` columns are only ever selected in the per-row detail
 * query, never in the stream — a single trace payload can exceed 100 KB.
 *
 * The trace-level switch writes through the NATIVE `organization` data
 * source, i.e. as the signed-in user, so the update privilege is enforced
 * server-side per user (the connector's SP would silently allow everyone).
 */

const STREAM_ATTRIBUTES =
  '<attribute name="plugintracelogid" />' +
  '<attribute name="typename" />' +
  '<attribute name="messagename" />' +
  '<attribute name="primaryentity" />' +
  '<attribute name="operationtype" />' +
  '<attribute name="mode" />' +
  '<attribute name="depth" />' +
  '<attribute name="correlationid" />' +
  '<attribute name="performanceexecutionstarttime" />' +
  '<attribute name="performanceexecutionduration" />' +
  '<attribute name="createdon" />'

/**
 * "Has a real exception" condition. `exceptiondetails` is often a non-null
 * EMPTY STRING on a successful trace, so `not-null` matches every row (making
 * everything look failed and the exceptions-only filter a no-op). `like "%_%"`
 * needs at least one character, so it excludes both NULL and "" and matches
 * only rows that actually carry a stack trace.
 */
const HAS_EXCEPTION_CONDITION =
  '<condition attribute="exceptiondetails" operator="like" value="%_%" />'

function toSummary(row: Row, exceptionIds: Set<string> | null): PluginTraceSummary {
  const id = rowStr(row.plugintracelogid)
  return {
    id,
    typeName: rowStr(row.typename),
    messageName: rowStr(row.messagename),
    primaryEntity: rowStr(row.primaryentity),
    operationType: rowNum(row.operationtype),
    mode: rowNum(row.mode),
    depth: rowNum(row.depth),
    correlationId: rowStr(row.correlationid),
    startTime: rowStr(row.performanceexecutionstarttime) || rowStr(row.createdon),
    durationMs: rowNum(row.performanceexecutionduration),
    // null set = every row in this result carries an exception by filter.
    hasException: exceptionIds ? exceptionIds.has(id) : true,
    createdOn: rowStr(row.createdon),
  }
}

/** ISO timestamp `hours` back from now, second precision. */
function sinceIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString().replace(/\.\d+Z$/, 'Z')
}

/** Shared filter conditions for stream + exception-flag queries. */
function buildConditions(filter: TraceFilter): string {
  const parts: string[] = [
    `<condition attribute="createdon" operator="ge" value="${sinceIso(filter.hours)}" />`,
  ]
  if (filter.typeName?.trim())
    parts.push(
      `<condition attribute="typename" operator="like" value="%${fetchXmlEscape(filter.typeName.trim())}%" />`,
    )
  if (filter.messageName?.trim())
    parts.push(
      `<condition attribute="messagename" operator="like" value="%${fetchXmlEscape(filter.messageName.trim())}%" />`,
    )
  if (filter.primaryEntity?.trim())
    parts.push(
      `<condition attribute="primaryentity" operator="like" value="%${fetchXmlEscape(filter.primaryEntity.trim())}%" />`,
    )
  if (filter.mode !== 'all')
    parts.push(
      `<condition attribute="mode" operator="eq" value="${filter.mode === 'sync' ? 0 : 1}" />`,
    )
  if (filter.exceptionsOnly) parts.push(HAS_EXCEPTION_CONDITION)
  if (filter.messageText?.trim())
    // Expensive contains — the caller must have clamped hours to ≤ 24.
    parts.push(
      `<condition attribute="messageblock" operator="like" value="%${fetchXmlEscape(filter.messageText.trim())}%" />`,
    )
  return parts.join('')
}

class DataverseTraceService implements TraceService {
  async listTraces(
    filter: TraceFilter,
    envKey: string,
  ): Promise<PluginTraceSummary[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockTraceService.listTraces(filter, envKey)
    if (
      filter.messageText?.trim() &&
      filter.hours > TRACE_TEXT_SEARCH_MAX_HOURS
    )
      throw new Error(
        `Message-text search is limited to a ${TRACE_TEXT_SEARCH_MAX_HOURS} h look-back.`,
      )
    const orgUrl = orgUrlForEnvKey(envKey)
    const conditions = buildConditions(filter)
    const fetchXml =
      `<fetch count="${TRACE_STREAM_LIMIT}">` +
      `<entity name="plugintracelog">${STREAM_ATTRIBUTES}` +
      `<filter type="and">${conditions}</filter>` +
      `<order attribute="createdon" descending="true" />` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery('plugintracelogs', fetchXml, orgUrl)

    // Exception flag without loading the payload: a second id-only query for
    // rows that carry exceptiondetails. Skipped when the filter already
    // guarantees it.
    let exceptionIds: Set<string> | null = null
    if (!filter.exceptionsOnly) {
      const exFetch =
        `<fetch count="${TRACE_STREAM_LIMIT}">` +
        `<entity name="plugintracelog">` +
        `<attribute name="plugintracelogid" />` +
        `<filter type="and">${conditions}${HAS_EXCEPTION_CONDITION}</filter>` +
        `<order attribute="createdon" descending="true" />` +
        `</entity></fetch>`
      try {
        const exRows = await fetchXmlQuery('plugintracelogs', exFetch, orgUrl)
        exceptionIds = new Set(exRows.map((r) => rowStr(r.plugintracelogid)))
      } catch (err) {
        console.warn('[traces] exception-flag query failed:', err)
        exceptionIds = new Set()
      }
    }
    return rows.map((row) => toSummary(row, exceptionIds))
  }

  async getTraceDetail(id: string, envKey: string): Promise<PluginTraceDetail> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockTraceService.getTraceDetail(id, envKey)
    const fetchXml =
      `<fetch count="1">` +
      `<entity name="plugintracelog">` +
      `<attribute name="plugintracelogid" />` +
      `<attribute name="messageblock" />` +
      `<attribute name="exceptiondetails" />` +
      `<filter><condition attribute="plugintracelogid" operator="eq" value="${fetchXmlEscape(id)}" /></filter>` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery('plugintracelogs', fetchXml, orgUrlForEnvKey(envKey))
    const row = rows[0]
    if (!row)
      throw new Error(
        'Trace not found — the platform prunes trace logs, this one may be gone.',
      )
    return {
      id,
      messageBlock: rowStr(row.messageblock),
      exceptionDetails: rowStr(row.exceptiondetails),
    }
  }

  async listCorrelation(
    correlationId: string,
    envKey: string,
  ): Promise<PluginTraceSummary[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockTraceService.listCorrelation(correlationId, envKey)
    const orgUrl = orgUrlForEnvKey(envKey)
    const fetchXml =
      `<fetch count="500">` +
      `<entity name="plugintracelog">${STREAM_ATTRIBUTES}` +
      `<filter><condition attribute="correlationid" operator="eq" value="${fetchXmlEscape(correlationId)}" /></filter>` +
      `<order attribute="performanceexecutionstarttime" />` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery('plugintracelogs', fetchXml, orgUrl)
    const exFetch =
      `<fetch count="500">` +
      `<entity name="plugintracelog">` +
      `<attribute name="plugintracelogid" />` +
      `<filter>` +
      `<condition attribute="correlationid" operator="eq" value="${fetchXmlEscape(correlationId)}" />` +
      HAS_EXCEPTION_CONDITION +
      `</filter></entity></fetch>`
    let exceptionIds = new Set<string>()
    try {
      const exRows = await fetchXmlQuery('plugintracelogs', exFetch, orgUrl)
      exceptionIds = new Set(exRows.map((r) => rowStr(r.plugintracelogid)))
    } catch (err) {
      console.warn('[traces] correlation exception-flag query failed:', err)
    }
    return rows.map((row) => toSummary(row, exceptionIds))
  }

  async getPerfBuckets(
    hours: number,
    envKey: string,
  ): Promise<TracePerfBucket[]> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockTraceService.getPerfBuckets(hours, envKey)
    const fetchXml =
      `<fetch aggregate="true">` +
      `<entity name="plugintracelog">` +
      `<attribute name="plugintracelogid" alias="cnt" aggregate="count" />` +
      `<attribute name="performanceexecutionduration" alias="avgms" aggregate="avg" />` +
      `<attribute name="performanceexecutionduration" alias="maxms" aggregate="max" />` +
      `<attribute name="typename" alias="tn" groupby="true" />` +
      `<attribute name="messagename" alias="mn" groupby="true" />` +
      `<filter><condition attribute="createdon" operator="ge" value="${sinceIso(hours)}" /></filter>` +
      `</entity></fetch>`
    let rows: Row[]
    try {
      rows = await fetchXmlQuery('plugintracelogs', fetchXml, orgUrlForEnvKey(envKey))
    } catch (err) {
      // AggregateQueryRecordLimit (50 000 rows) is the usual failure here.
      throw new Error(
        `Performance aggregation failed — likely more than 50 000 traces in the window. Pick a shorter look-back. (${err instanceof Error ? err.message : String(err)})`,
      )
    }
    return rows
      .map((row) => {
        const avgMs = rowNum(row.avgms)
        const maxMs = rowNum(row.maxms)
        return {
          typeName: rowStr(row.tn),
          messageName: rowStr(row.mn),
          count: rowNum(row.cnt),
          avgMs,
          maxMs,
          p95Ms: Math.round(avgMs + 0.5 * Math.max(0, maxMs - avgMs)),
        }
      })
      .sort((a, b) => b.count * b.avgMs - a.count * a.avgMs)
  }

  async getTraceLevel(envKey: string): Promise<TraceLevelInfo> {
    const mode = await powerModeReady
    if (mode !== 'power-platform') return mockTraceService.getTraceLevel(envKey)
    const fetchXml =
      `<fetch count="1">` +
      `<entity name="organization">` +
      `<attribute name="organizationid" />` +
      `<attribute name="plugintracelogsetting" />` +
      `</entity></fetch>`
    const rows = await fetchXmlQuery('organizations', fetchXml, orgUrlForEnvKey(envKey))
    const row = rows[0]
    if (!row) throw new Error('Could not read the organization row.')
    const level = rowNum(row.plugintracelogsetting)
    return {
      organizationId: rowStr(row.organizationid),
      level: (level === 1 || level === 2 ? level : 0) as TraceLevel,
    }
  }

  async setTraceLevel(
    organizationId: string,
    level: TraceLevel,
    envKey: string,
  ): Promise<void> {
    const mode = await powerModeReady
    if (mode !== 'power-platform')
      return mockTraceService.setTraceLevel(organizationId, level, envKey)
    // The native `organization` source always targets the host env; refuse a
    // cross-env write rather than silently changing the wrong environment.
    if (!isCurrentEnvKey(envKey))
      throw new Error(
        'The trace level can only be changed for the host environment — native writes cannot target another environment.',
      )
    const result = await OrganizationsService.update(organizationId, {
      plugintracelogsetting: level,
    })
    if (result && result.success === false) {
      console.warn('[traces] trace-level update failed:', result)
      throw new Error(
        'Switching the trace level failed — you need the update privilege on the organization table.',
      )
    }
  }
}

export const dataverseTraceService: TraceService = new DataverseTraceService()
