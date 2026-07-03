import { describe, expect, it } from 'vitest'
import { evaluateHeartbeat } from './heartbeat'

const NOW = new Date('2026-07-03T12:00:00Z')

const def = (
  interval: number,
  grace: number,
  isActive = true,
): Parameters<typeof evaluateHeartbeat>[0] => ({
  expectedIntervalMinutes: interval,
  graceMinutes: grace,
  isActive,
})

const beatAgo = (minutes: number) => ({
  timestamp: new Date(NOW.getTime() - minutes * 60_000).toISOString(),
})

describe('evaluateHeartbeat', () => {
  it('is ok while the beat is within interval + grace', () => {
    expect(evaluateHeartbeat(def(60, 15), beatAgo(10), NOW)).toEqual({
      state: 'ok',
      overdueMinutes: 0,
    })
    // Exactly at the deadline still counts as ok.
    expect(evaluateHeartbeat(def(60, 15), beatAgo(75), NOW).state).toBe('ok')
  })

  it('grace keeps a slightly late beat green', () => {
    expect(evaluateHeartbeat(def(60, 15), beatAgo(70), NOW).state).toBe('ok')
  })

  it('turns overdue past interval + grace, reporting minutes over', () => {
    expect(evaluateHeartbeat(def(60, 15), beatAgo(90), NOW)).toEqual({
      state: 'overdue',
      overdueMinutes: 15,
    })
  })

  it('never-beaten definitions are flagged', () => {
    expect(evaluateHeartbeat(def(60, 15), null, NOW).state).toBe('never')
    expect(evaluateHeartbeat(def(60, 15), { timestamp: '' }, NOW).state).toBe(
      'never',
    )
    expect(
      evaluateHeartbeat(def(60, 15), { timestamp: 'not-a-date' }, NOW).state,
    ).toBe('never')
  })

  it('inactive definitions are never red', () => {
    expect(evaluateHeartbeat(def(60, 15, false), beatAgo(9999), NOW)).toEqual({
      state: 'inactive',
      overdueMinutes: 0,
    })
    expect(evaluateHeartbeat(def(60, 15, false), null, NOW).state).toBe(
      'inactive',
    )
  })
})
