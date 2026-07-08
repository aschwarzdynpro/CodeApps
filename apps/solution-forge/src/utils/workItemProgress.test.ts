import { describe, expect, it } from 'vitest'
import {
  buildStateOrders,
  deriveStateVisual,
  deriveWorkItemProgress,
} from './workItemProgress'

const TYPES = [
  {
    Name: 'Bug',
    states: [
      { name: 'New', category: 'Proposed' },
      { name: 'Active', category: 'InProgress' },
      { name: 'Resolved', category: 'Resolved' },
      { name: 'Closed', category: 'Completed' },
    ],
  },
  {
    Name: 'User Story',
    states: [
      { name: 'New', category: 'Proposed' },
      { name: 'Active', category: 'InProgress' },
      { name: 'Closed', category: 'Completed' },
    ],
  },
]

describe('buildStateOrders', () => {
  it('keys types lower-case and preserves state order', () => {
    const orders = buildStateOrders(TYPES)
    expect([...orders.keys()]).toEqual(['bug', 'user story'])
    expect(orders.get('bug')!.map((s) => s.name)).toEqual([
      'New',
      'Active',
      'Resolved',
      'Closed',
    ])
  })

  it('orders states by category even when the array comes unordered', () => {
    const orders = buildStateOrders([
      {
        Name: 'Bug',
        states: [
          { name: 'Closed', category: 'Completed' },
          { name: 'New', category: 'Proposed' },
          { name: 'Resolved', category: 'Resolved' },
          { name: 'Active', category: 'InProgress' },
        ],
      },
    ])
    expect(orders.get('bug')!.map((s) => s.name)).toEqual([
      'New',
      'Active',
      'Resolved',
      'Closed',
    ])
  })

  it('reads the raw-REST lower-case type name too', () => {
    const orders = buildStateOrders([
      { name: 'Task', states: [{ name: 'To Do', category: 'Proposed' }] },
    ])
    expect(orders.has('task')).toBe(true)
  })

  it('skips types without usable states', () => {
    const orders = buildStateOrders([
      { Name: 'Empty', states: [] },
      { Name: '', states: [{ name: 'X', category: 'Proposed' }] },
      { Name: 'Task' },
    ])
    expect(orders.size).toBe(0)
  })

  it('tolerates null/garbage input', () => {
    expect(buildStateOrders(null).size).toBe(0)
    expect(buildStateOrders(undefined).size).toBe(0)
  })
})

describe('deriveWorkItemProgress', () => {
  const orders = buildStateOrders(TYPES)

  it('maps the current state to its real position in the type workflow', () => {
    expect(deriveWorkItemProgress('Bug', 'New', orders)).toEqual({
      pct: 6, // index 0 → floored to 6 so it stays visible
      category: 'Proposed',
    })
    expect(deriveWorkItemProgress('Bug', 'Active', orders)).toEqual({
      pct: 33,
      category: 'InProgress',
    })
    expect(deriveWorkItemProgress('Bug', 'Closed', orders)).toEqual({
      pct: 100,
      category: 'Completed',
    })
  })

  it('is case-insensitive on both type and state', () => {
    expect(deriveWorkItemProgress('bug', 'active', orders)?.pct).toBe(33)
    expect(deriveWorkItemProgress('USER STORY', 'Closed', orders)?.pct).toBe(100)
  })

  it('returns null when the type or state is unknown (caller falls back)', () => {
    expect(deriveWorkItemProgress('Bug', 'Frozen', orders)).toBeNull()
    expect(deriveWorkItemProgress('Epic', 'New', orders)).toBeNull()
    expect(deriveWorkItemProgress(undefined, 'New', orders)).toBeNull()
    expect(deriveWorkItemProgress('Bug', '', orders)).toBeNull()
  })
})

describe('deriveStateVisual', () => {
  const orders = buildStateOrders(TYPES)

  it('colours the same state identically regardless of caller (list vs drawer)', () => {
    // Same inputs → same visual, so the row badge and the drawer badge match.
    expect(deriveStateVisual('Active', 'Bug', orders)).toEqual(
      deriveStateVisual('Active', 'Bug', orders),
    )
  })

  it('colours by real category: New (Proposed)=slate, Active (InProgress)=blue', () => {
    expect(deriveStateVisual('New', 'Bug', orders)).toMatchObject({
      bg: '#eef1f6',
      fg: '#475569',
      pct: '6%',
    })
    expect(deriveStateVisual('Active', 'Bug', orders)).toMatchObject({
      bg: '#e7effd',
      fg: '#1d4ed8',
      pct: '33%',
    })
    expect(deriveStateVisual('Closed', 'Bug', orders).fg).toBe('#15803d') // green
  })

  it('falls back to the numeric heuristic when no orders resolve', () => {
    expect(deriveStateVisual('New', 'Bug', new Map()).pct).toBe('53%') // 8/15
  })
})
