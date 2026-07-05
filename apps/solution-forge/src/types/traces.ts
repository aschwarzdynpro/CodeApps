/**
 * Plugin Trace Explorer — types over the Dataverse `plugintracelog` table.
 *
 * The stream deliberately never carries `messageblock` / `exceptiondetails`
 * (they can be 100 KB+ per row); those live in {@link PluginTraceDetail} and
 * are fetched per record.
 */

/** One trace row as shown in the stream / correlation timeline. */
export interface PluginTraceSummary {
  id: string
  /** Plugin class (typename), e.g. "Schulz.Plugins.AccountPostCreate". */
  typeName: string
  /** SDK message, e.g. Create / Update / RetrieveMultiple. */
  messageName: string
  /** Primary entity logical name, '' for global messages. */
  primaryEntity: string
  /** 1 = plug-in, 2 = workflow activity (operationtype). */
  operationType: number
  /** 0 = sync, 1 = async (mode). */
  mode: number
  /** Execution-pipeline depth — cascades indent by this. */
  depth: number
  correlationId: string
  /** performanceexecutionstarttime (ISO). */
  startTime: string
  /** performanceexecutionduration in ms. */
  durationMs: number
  /** Whether the row carries exception details (flagged, not loaded). */
  hasException: boolean
  createdOn: string
}

/** Lazily fetched heavy payload of one trace row. */
export interface PluginTraceDetail {
  id: string
  messageBlock: string
  exceptionDetails: string
}

export type TraceModeFilter = 'all' | 'sync' | 'async'

/** Stream filters — server-side where possible. */
export interface TraceFilter {
  /** Look-back window in hours. */
  hours: number
  typeName?: string
  messageName?: string
  primaryEntity?: string
  mode: TraceModeFilter
  exceptionsOnly: boolean
  /**
   * Opt-in full-text search inside messageblock (expensive `contains` — the
   * service enforces a look-back of 24 h or less when set).
   */
  messageText?: string
}

/** Server-side aggregate per plugin type × message (performance heatmap). */
export interface TracePerfBucket {
  typeName: string
  messageName: string
  count: number
  avgMs: number
  maxMs: number
  /**
   * Approximated p95 — FetchXML aggregates offer no percentile, so this is
   * derived (avg + 0.5 × (max − avg)) and labelled as an approximation.
   */
  p95Ms: number
}

/** organization.plugintracelogsetting values. */
export const TRACE_LEVELS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Exception' },
  { value: 2, label: 'All' },
] as const

export type TraceLevel = (typeof TRACE_LEVELS)[number]['value']

export interface TraceLevelInfo {
  organizationId: string
  level: TraceLevel
}

export const TRACE_STREAM_LIMIT = 200

/** Selectable look-back windows for the stream (hours). */
export const TRACE_WINDOWS = [1, 6, 24, 72] as const

/** Full-text search is only allowed with a look-back of at most this. */
export const TRACE_TEXT_SEARCH_MAX_HOURS = 24
