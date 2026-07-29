import { describe, expect, it } from 'vitest'
import {
  addToHistory,
  removeById,
  sanitize,
  upsertSaved,
  type StoredQuery,
} from './odataStore'

function entry(overrides: Partial<StoredQuery> = {}): StoredQuery {
  return {
    id: 'a',
    path: '/accounts?$select=name',
    table: 'account',
    at: 1_000,
    ...overrides,
  }
}

describe('addToHistory', () => {
  it('puts the newest first', () => {
    const list = addToHistory([entry({ id: 'a' })], entry({ id: 'b', path: '/x' }))
    expect(list.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('moves a repeated query up instead of duplicating it', () => {
    const first = entry({ id: 'a', path: '/accounts' })
    const other = entry({ id: 'b', path: '/contacts' })
    const again = entry({ id: 'c', path: '/accounts', at: 2_000 })
    const list = addToHistory(addToHistory([first], other), again)
    expect(list.map((e) => e.path)).toEqual(['/accounts', '/contacts'])
    expect(list[0].at).toBe(2_000)
  })

  it('caps the list', () => {
    let list: StoredQuery[] = []
    for (let i = 0; i < 10; i++)
      list = addToHistory(list, entry({ id: `e${i}`, path: `/t${i}` }), 3)
    expect(list).toHaveLength(3)
    expect(list[0].path).toBe('/t9')
  })

  it('never produces an empty list from a silly limit', () => {
    expect(addToHistory([], entry(), 0)).toHaveLength(1)
  })
})

describe('upsertSaved', () => {
  it('replaces an entry with the same name, case-insensitively', () => {
    const list = upsertSaved(
      [entry({ id: 'a', name: 'Open accounts', path: '/old' })],
      entry({ id: 'b', name: 'open ACCOUNTS', path: '/new' }),
    )
    expect(list).toHaveLength(1)
    expect(list[0].path).toBe('/new')
  })

  it('keeps entries with different names, sorted by name', () => {
    const list = upsertSaved(
      [entry({ id: 'a', name: 'Zeta' })],
      entry({ id: 'b', name: 'Alpha' }),
    )
    expect(list.map((e) => e.name)).toEqual(['Alpha', 'Zeta'])
  })
})

describe('removeById', () => {
  it('removes exactly one entry', () => {
    const list = removeById([entry({ id: 'a' }), entry({ id: 'b' })], 'a')
    expect(list.map((e) => e.id)).toEqual(['b'])
  })
})

describe('sanitize', () => {
  it('drops anything that is not a stored query', () => {
    expect(
      sanitize([
        entry(),
        null,
        'nope',
        { id: 'x' },
        { id: 'y', path: '/p', at: 'soon' },
      ]),
    ).toHaveLength(1)
  })

  it('survives a corrupted payload', () => {
    expect(sanitize(undefined)).toEqual([])
    expect(sanitize({ not: 'an array' })).toEqual([])
  })
})
