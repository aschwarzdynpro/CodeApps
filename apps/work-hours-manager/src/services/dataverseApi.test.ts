import { describe, expect, it } from 'vitest'
import { PrivilegeError } from './calendarService'
import { isTransient, mapPool, withRetry } from './dataverseApi'

const noWait = () => Promise.resolve()

describe('withRetry', () => {
  it('repeats throttled reads with growing waits and returns the first success', async () => {
    const waits: number[] = []
    let calls = 0
    const result = await withRetry(
      async () => {
        calls++
        if (calls < 3) throw new Error('calendars(…) lesen: 429 Too Many Requests')
        return 'ok'
      },
      { wait: async (ms) => void waits.push(ms) },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(3)
    expect(waits).toEqual([1000, 2000])
  })

  it('gives up after the last attempt with the original error', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error('503 Service Unavailable')
        },
        { attempts: 3, wait: noWait },
      ),
    ).rejects.toThrow('503')
    expect(calls).toBe(3)
  })

  it('never repeats a lasting error or a missing privilege', async () => {
    let calls = 0
    const fail = (err: Error) =>
      withRetry(
        async () => {
          calls++
          throw err
        },
        { wait: noWait },
      )
    await expect(fail(new Error('Principal user is missing prvReadCalendar privilege'))).rejects.toThrow()
    await expect(fail(new PrivilegeError('msdyn_SaveCalendar: 429 privilege'))).rejects.toThrow()
    expect(calls).toBe(2)
  })
})

describe('isTransient', () => {
  it('knows throttling, gateway and network trouble', () => {
    expect(isTransient(new Error('Rate limit is exceeded. Try again in 5 seconds.'))).toBe(true)
    expect(isTransient({ error: { message: 'The operation timed out' } })).toBe(true)
    expect(isTransient(new Error('504 Gateway Timeout'))).toBe(true)
    expect(isTransient(new Error('Calendar With Id = 123 Does Not Exist'))).toBe(false)
    expect(isTransient(new Error('id 4290 not found'))).toBe(false)
  })
})

describe('mapPool', () => {
  it('keeps the input order and never runs more than the limit at once', async () => {
    let running = 0
    let peak = 0
    const out = await mapPool([5, 1, 4, 2, 3], 2, async (n) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, n))
      running--
      return n * 10
    })
    expect(out).toEqual([50, 10, 40, 20, 30])
    expect(peak).toBe(2)
  })
})
