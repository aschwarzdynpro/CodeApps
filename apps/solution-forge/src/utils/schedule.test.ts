import { describe, expect, it } from 'vitest'
import { isBeforeDay, monthGrid, quickPicks, sameDay, toLocalInputValue } from './schedule'

describe('toLocalInputValue', () => {
  it('formats with zero padding', () => {
    expect(toLocalInputValue(new Date(2026, 6, 23, 8, 5))).toBe('2026-07-23T08:05')
  })
})

describe('monthGrid', () => {
  it('covers July 2026 Monday-first', () => {
    const grid = monthGrid(2026, 6)
    expect(grid).toHaveLength(6)
    expect(grid.every((w) => w.length === 7)).toBe(true)
    // July 1st 2026 is a Wednesday — the grid starts Monday June 29th.
    expect(grid[0][0].date.getMonth()).toBe(5)
    expect(grid[0][0].date.getDate()).toBe(29)
    expect(grid[0][0].date.getDay()).toBe(1)
    expect(grid[0][0].inMonth).toBe(false)
    expect(grid[0][2].date.getDate()).toBe(1)
    expect(grid[0][2].inMonth).toBe(true)
  })
})

describe('sameDay / isBeforeDay', () => {
  it('compares date-only', () => {
    expect(sameDay(new Date(2026, 6, 23, 1), new Date(2026, 6, 23, 23))).toBe(true)
    expect(sameDay(new Date(2026, 6, 23), new Date(2026, 6, 24))).toBe(false)
    expect(isBeforeDay(new Date(2026, 6, 22, 23), new Date(2026, 6, 23, 0))).toBe(true)
    expect(isBeforeDay(new Date(2026, 6, 23, 0), new Date(2026, 6, 23, 23))).toBe(false)
  })
})

describe('quickPicks', () => {
  it('suggests future slots for a Thursday morning', () => {
    const picks = quickPicks(new Date(2026, 6, 23, 10, 30))
    expect(picks.map((p) => p.label)).toEqual([
      'In 1 hour',
      'Today 18:00',
      'Tomorrow 08:00',
      'Monday 08:00',
    ])
    expect(toLocalInputValue(picks[0].when)).toBe('2026-07-23T11:00')
    expect(toLocalInputValue(picks[1].when)).toBe('2026-07-23T18:00')
    expect(toLocalInputValue(picks[2].when)).toBe('2026-07-24T08:00')
    // Next Monday after Thursday July 23rd 2026 is July 27th.
    expect(toLocalInputValue(picks[3].when)).toBe('2026-07-27T08:00')
  })
  it('drops "Today 18:00" in the evening', () => {
    const picks = quickPicks(new Date(2026, 6, 23, 19, 0))
    expect(picks.map((p) => p.label)).not.toContain('Today 18:00')
  })
  it('picks tomorrow as Monday on a Sunday', () => {
    const picks = quickPicks(new Date(2026, 6, 26, 9, 0))
    const monday = picks.find((p) => p.label === 'Monday 08:00')!
    expect(toLocalInputValue(monday.when)).toBe('2026-07-27T08:00')
  })
  it('jumps a full week when today is Monday', () => {
    const picks = quickPicks(new Date(2026, 6, 27, 9, 0))
    const monday = picks.find((p) => p.label === 'Monday 08:00')!
    expect(toLocalInputValue(monday.when)).toBe('2026-08-03T08:00')
  })
})
