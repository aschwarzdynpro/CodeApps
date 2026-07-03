import type {
  HeartbeatBeat,
  HeartbeatDefinition,
  WatchdogState,
} from '../types/jobs'

/**
 * Watchdog core rule as a pure function (unit-testable, no I/O):
 *
 * - inactive definitions are never red — they are reported as 'inactive'.
 * - a definition that has never beaten is 'never' (treated like overdue).
 * - otherwise the beat must be younger than expected interval + grace,
 *   else the entry is 'overdue' by the minutes past that deadline.
 */
export function evaluateHeartbeat(
  definition: Pick<
    HeartbeatDefinition,
    'expectedIntervalMinutes' | 'graceMinutes' | 'isActive'
  >,
  lastBeat: Pick<HeartbeatBeat, 'timestamp'> | null,
  now: Date,
): { state: WatchdogState; overdueMinutes: number } {
  if (!definition.isActive) return { state: 'inactive', overdueMinutes: 0 }
  const allowanceMs =
    (definition.expectedIntervalMinutes + definition.graceMinutes) * 60_000
  if (!lastBeat || !lastBeat.timestamp) {
    return { state: 'never', overdueMinutes: 0 }
  }
  const beatAt = new Date(lastBeat.timestamp).getTime()
  if (Number.isNaN(beatAt)) return { state: 'never', overdueMinutes: 0 }
  const overdueMs = now.getTime() - beatAt - allowanceMs
  if (overdueMs <= 0) return { state: 'ok', overdueMinutes: 0 }
  return { state: 'overdue', overdueMinutes: Math.ceil(overdueMs / 60_000) }
}
