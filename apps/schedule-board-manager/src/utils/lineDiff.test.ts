import { describe, expect, it } from 'vitest'
import { foldUnchanged, lineDiff } from './lineDiff'

describe('lineDiff', () => {
  it('marks added and removed lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'add', text: 'x' },
      { op: 'same', text: 'c' },
    ])
  })
  it('ignores CRLF differences', () => {
    expect(lineDiff('a\r\nb', 'a\nb').every((l) => l.op === 'same')).toBe(true)
  })
  it('folds long unchanged runs', () => {
    const before = Array.from({ length: 10 }, (_, i) => `l${i}`).join('\n')
    const after = before.replace('l5', 'L5')
    const rows = foldUnchanged(lineDiff(before, after), 1)
    expect(rows[0]).toEqual({ op: 'skip', count: 4 })
    expect(rows.at(-1)).toEqual({ op: 'skip', count: 3 })
    expect(rows.filter((r) => r.op === 'add' || r.op === 'del')).toHaveLength(2)
  })
})
