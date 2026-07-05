import { describe, expect, it } from 'vitest'
import { buildForest, layoutTree } from './orgTree'

const flat = (pairs: [string, string | null][]) =>
  pairs.map(([id, parentId]) => ({ id, parentId }))

describe('buildForest', () => {
  it('nests children under their parent and roots the parentless', () => {
    const forest = buildForest(
      flat([
        ['root', null],
        ['a', 'root'],
        ['b', 'root'],
        ['a1', 'a'],
      ]),
    )
    expect(forest).toHaveLength(1)
    expect(forest[0].id).toBe('root')
    expect(forest[0].children.map((c) => c.id).sort()).toEqual(['a', 'b'])
    const a = forest[0].children.find((c) => c.id === 'a')!
    expect(a.children.map((c) => c.id)).toEqual(['a1'])
  })

  it('treats a BU with a missing parent as a root (orphan safety)', () => {
    const forest = buildForest(flat([['x', 'ghost']]))
    expect(forest.map((n) => n.id)).toEqual(['x'])
  })

  it('prunes collapsed subtrees to leaves', () => {
    const forest = buildForest(
      flat([
        ['root', null],
        ['a', 'root'],
      ]),
      new Set(['root']),
    )
    expect(forest[0].children).toHaveLength(0)
  })
})

describe('layoutTree', () => {
  const opts = { nodeWidth: 100, hGap: 20, levelGap: 40, heightOf: () => 60 }

  it('centers a parent over its two leaves and separates the leaves', () => {
    const forest = buildForest(
      flat([
        ['root', null],
        ['a', 'root'],
        ['b', 'root'],
      ]),
    )
    const { positions } = layoutTree(forest, opts)
    const a = positions.get('a')!
    const b = positions.get('b')!
    const root = positions.get('root')!
    expect(b.x - a.x).toBe(120) // one slot (nodeWidth + hGap)
    expect(root.x).toBe((a.x + b.x) / 2)
    // Children sit one level below the root.
    expect(root.depth).toBe(0)
    expect(a.depth).toBe(1)
    expect(a.y).toBe(60 + 40) // parent height + levelGap
  })

  it('lays multiple roots side by side without overlap', () => {
    const forest = buildForest(
      flat([
        ['r1', null],
        ['r2', null],
      ]),
    )
    const { positions, width } = layoutTree(forest, opts)
    expect(positions.get('r2')!.x - positions.get('r1')!.x).toBe(120)
    expect(width).toBe(220) // two slots minus the trailing gap
  })
})
