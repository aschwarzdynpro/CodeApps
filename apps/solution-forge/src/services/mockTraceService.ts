import type {
  PluginTraceDetail,
  PluginTraceSummary,
  TraceFilter,
  TraceLevel,
  TraceLevelInfo,
  TracePerfBucket,
} from '../types/traces'
import { TRACE_STREAM_LIMIT } from '../types/traces'
import type { TraceService } from './traceService'

/**
 * Mock implementation of {@link TraceService} — a seeded, deterministic
 * trace history over the last ~72 h including correlation cascades (depth
 * 1→3), a deliberately slow plugin and a recurring exception, so every
 * Trace Explorer view is demonstrable offline.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Deterministic PRNG so the demo data is stable across reloads. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Seed {
  typeName: string
  messageName: string
  primaryEntity: string
  baseMs: number
  failEvery?: number
  cascade?: { typeName: string; messageName: string; primaryEntity: string; ms: number }[]
}

const SEEDS: Seed[] = [
  {
    typeName: 'Schulz.Plugins.Account.AccountPostUpdate',
    messageName: 'Update',
    primaryEntity: 'account',
    baseMs: 120,
    cascade: [
      {
        typeName: 'Schulz.Plugins.Contact.ContactCascadeSync',
        messageName: 'Update',
        primaryEntity: 'contact',
        ms: 60,
      },
      {
        typeName: 'Schulz.Plugins.Shared.AuditStamp',
        messageName: 'Update',
        primaryEntity: 'contact',
        ms: 25,
      },
    ],
  },
  {
    typeName: 'Schulz.Plugins.Order.SalesOrderPreCreate',
    messageName: 'Create',
    primaryEntity: 'salesorder',
    baseMs: 340,
    failEvery: 7,
  },
  {
    typeName: 'Schulz.Plugins.Pricing.RecalculateTotals',
    messageName: 'Update',
    primaryEntity: 'salesorder',
    // The deliberately slow one — dominates the performance heatmap.
    baseMs: 2600,
  },
  {
    typeName: 'Schulz.Plugins.Shared.TelemetryForwarder',
    messageName: 'RetrieveMultiple',
    primaryEntity: 'account',
    baseMs: 15,
  },
]

interface MockTrace extends PluginTraceSummary {
  messageBlock: string
  exceptionDetails: string
}

function buildTraces(): MockTrace[] {
  const rand = mulberry32(42)
  const out: MockTrace[] = []
  const now = Date.now()
  let n = 0
  // One event roughly every 20 minutes over the last 72 h, per seed schedule.
  for (let slot = 0; slot < 72 * 3; slot++) {
    const at = now - slot * 20 * 60_000 - Math.floor(rand() * 300_000)
    const seed = SEEDS[slot % SEEDS.length]
    n++
    const correlationId = `c0ffee00-0000-4000-8000-${String(n).padStart(12, '0')}`
    const failed = !!seed.failEvery && slot % seed.failEvery === 0
    const durationMs = Math.round(seed.baseMs * (0.7 + rand() * 0.8))
    const mk = (
      s: { typeName: string; messageName: string; primaryEntity: string },
      depth: number,
      startOffset: number,
      ms: number,
      exception: string,
    ): MockTrace => ({
      id: `trace-${n}-${depth}-${startOffset}`,
      typeName: s.typeName,
      messageName: s.messageName,
      primaryEntity: s.primaryEntity,
      operationType: 1,
      mode: slot % 3 === 0 ? 1 : 0,
      depth,
      correlationId,
      startTime: new Date(at + startOffset).toISOString(),
      durationMs: ms,
      hasException: !!exception,
      createdOn: new Date(at + startOffset + ms).toISOString(),
      messageBlock:
        `Entered ${s.typeName}.Execute()\n` +
        `Message: ${s.messageName}, Entity: ${s.primaryEntity}, Depth: ${depth}\n` +
        `InputParameters: Target(${s.primaryEntity})\n` +
        (exception
          ? 'Validating order lines…\nPrice list lookup FAILED\n'
          : 'Business logic completed.\n') +
        `Exiting ${s.typeName}.Execute() after ${ms} ms`,
      exceptionDetails: exception,
    })
    const exception = failed
      ? 'Unhandled exception: Microsoft.Xrm.Sdk.InvalidPluginExecutionException: ' +
        'Price list "Standard EUR" not found for currency EUR\n' +
        `   at ${seed.typeName}.Execute(IServiceProvider serviceProvider)`
      : ''
    out.push(mk(seed, 1, 0, durationMs, exception))
    if (seed.cascade && slot % 2 === 0) {
      let offset = Math.round(durationMs * 0.3)
      for (const [i, c] of seed.cascade.entries()) {
        out.push(mk(c, 2 + i, offset, Math.round(c.ms * (0.8 + rand() * 0.5)), ''))
        offset += c.ms
      }
    }
  }
  return out.sort((a, b) => b.createdOn.localeCompare(a.createdOn))
}

const MOCK_TRACES = buildTraces()

let mockLevel: TraceLevel = 2

class MockTraceService implements TraceService {
  async listTraces(
    filter: TraceFilter,
    _envKey: string,
  ): Promise<PluginTraceSummary[]> {
    void _envKey
    await delay(250)
    const since = Date.now() - filter.hours * 3600_000
    const needle = (v?: string) => v?.trim().toLowerCase() ?? ''
    const tn = needle(filter.typeName)
    const mn = needle(filter.messageName)
    const pe = needle(filter.primaryEntity)
    const text = needle(filter.messageText)
    return MOCK_TRACES.filter((t) => {
      if (new Date(t.createdOn).getTime() < since) return false
      if (tn && !t.typeName.toLowerCase().includes(tn)) return false
      if (mn && !t.messageName.toLowerCase().includes(mn)) return false
      if (pe && !t.primaryEntity.toLowerCase().includes(pe)) return false
      if (filter.mode === 'sync' && t.mode !== 0) return false
      if (filter.mode === 'async' && t.mode !== 1) return false
      if (filter.exceptionsOnly && !t.hasException) return false
      if (text && !t.messageBlock.toLowerCase().includes(text)) return false
      return true
    })
      .slice(0, TRACE_STREAM_LIMIT)
      .map(({ messageBlock, exceptionDetails, ...summary }) => {
        void messageBlock
        void exceptionDetails
        return summary
      })
  }

  async getTraceDetail(
    id: string,
    _envKey: string,
  ): Promise<PluginTraceDetail> {
    void _envKey
    await delay(150)
    const trace = MOCK_TRACES.find((t) => t.id === id)
    if (!trace) throw new Error('Trace not found.')
    return {
      id,
      messageBlock: trace.messageBlock,
      exceptionDetails: trace.exceptionDetails,
    }
  }

  async listCorrelation(
    correlationId: string,
    _envKey: string,
  ): Promise<PluginTraceSummary[]> {
    void _envKey
    await delay(200)
    return MOCK_TRACES.filter((t) => t.correlationId === correlationId)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map(({ messageBlock, exceptionDetails, ...summary }) => {
        void messageBlock
        void exceptionDetails
        return summary
      })
  }

  async getPerfBuckets(
    hours: number,
    _envKey: string,
  ): Promise<TracePerfBucket[]> {
    void _envKey
    await delay(300)
    const since = Date.now() - hours * 3600_000
    const buckets = new Map<string, { count: number; total: number; max: number }>()
    for (const t of MOCK_TRACES) {
      if (new Date(t.createdOn).getTime() < since) continue
      const key = `${t.typeName}|${t.messageName}`
      const b = buckets.get(key) ?? { count: 0, total: 0, max: 0 }
      b.count++
      b.total += t.durationMs
      b.max = Math.max(b.max, t.durationMs)
      buckets.set(key, b)
    }
    return [...buckets.entries()]
      .map(([key, b]) => {
        const [typeName, messageName] = key.split('|')
        const avgMs = Math.round(b.total / b.count)
        return {
          typeName,
          messageName,
          count: b.count,
          avgMs,
          maxMs: b.max,
          p95Ms: Math.round(avgMs + 0.5 * (b.max - avgMs)),
        }
      })
      .sort((a, b) => b.count * b.avgMs - a.count * a.avgMs)
  }

  async getTraceLevel(_envKey: string): Promise<TraceLevelInfo> {
    void _envKey
    await delay(100)
    return { organizationId: 'org-mock', level: mockLevel }
  }

  async setTraceLevel(
    _organizationId: string,
    level: TraceLevel,
    _envKey: string,
  ): Promise<void> {
    void _organizationId
    void _envKey
    await delay(150)
    mockLevel = level
  }
}

export const mockTraceService: TraceService = new MockTraceService()
