import type { OrgBusinessUnit } from '../types/orgStructure'

/**
 * Tidy-tree layout for the BU org-chart (pure, unit-tested). Kept dependency-
 * free — the app renders the result as inline SVG.
 */

export interface TreeNode {
  id: string
  children: TreeNode[]
}

/**
 * Turn the flat BU list into a forest. A BU whose parent is missing (or whose
 * parent is itself, defensively) becomes a root. `collapsed` prunes a node's
 * children so a collapsed subtree lays out as a leaf.
 */
export function buildForest(
  businessUnits: Pick<OrgBusinessUnit, 'id' | 'parentId'>[],
  collapsed: Set<string> = new Set(),
): TreeNode[] {
  const byId = new Map(businessUnits.map((b) => [b.id, b]))
  const childrenOf = new Map<string, string[]>()
  const roots: string[] = []
  for (const bu of businessUnits) {
    if (bu.parentId && bu.parentId !== bu.id && byId.has(bu.parentId)) {
      const list = childrenOf.get(bu.parentId) ?? []
      list.push(bu.id)
      childrenOf.set(bu.parentId, list)
    } else {
      roots.push(bu.id)
    }
  }
  const build = (id: string): TreeNode => ({
    id,
    children: collapsed.has(id)
      ? []
      : (childrenOf.get(id) ?? []).map(build),
  })
  return roots.map(build)
}

export interface NodePosition {
  /** Center x of the node. */
  x: number
  /** Top y of the node. */
  y: number
  height: number
  depth: number
}

export interface TreeLayout {
  positions: Map<string, NodePosition>
  edges: { from: string; to: string }[]
  width: number
  height: number
}

export interface LayoutOptions {
  nodeWidth: number
  /** Horizontal gap between adjacent leaf slots. */
  hGap: number
  /** Vertical gap between levels. */
  levelGap: number
  /** Rendered height of a node (varies with its team count). */
  heightOf: (id: string) => number
}

/**
 * Lay out a forest: leaves get sequential horizontal slots, each parent is
 * centered over its children, and every level's y accounts for the tallest
 * node on the level above (nodes have variable height). Overlap-free because
 * each subtree occupies a contiguous, exclusive range of leaf slots.
 */
export function layoutTree(
  forest: TreeNode[],
  opts: LayoutOptions,
): TreeLayout {
  const { nodeWidth, hGap, levelGap, heightOf } = opts
  const positions = new Map<string, NodePosition>()
  const edges: { from: string; to: string }[] = []
  const slot = nodeWidth + hGap
  let cursor = 0
  let maxDepth = 0

  // First pass: x (leaf slots + parent centering) and depth.
  const walk = (node: TreeNode, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth)
    let x: number
    if (node.children.length === 0) {
      x = cursor * slot + nodeWidth / 2
      cursor++
    } else {
      const childXs = node.children.map((c) => walk(c, depth + 1))
      x = (childXs[0] + childXs[childXs.length - 1]) / 2
    }
    positions.set(node.id, { x, y: 0, height: heightOf(node.id), depth })
    for (const c of node.children) edges.push({ from: node.id, to: c.id })
    return x
  }
  for (const root of forest) walk(root, 0)

  // Second pass: per-level max height → cumulative y per level.
  const levelHeight: number[] = new Array(maxDepth + 1).fill(0)
  for (const pos of positions.values())
    levelHeight[pos.depth] = Math.max(levelHeight[pos.depth], pos.height)
  const levelY: number[] = new Array(maxDepth + 1).fill(0)
  for (let d = 1; d <= maxDepth; d++)
    levelY[d] = levelY[d - 1] + levelHeight[d - 1] + levelGap
  for (const pos of positions.values()) pos.y = levelY[pos.depth]

  const width = Math.max(0, cursor * slot - hGap)
  const height =
    levelHeight.length > 0
      ? levelY[maxDepth] + levelHeight[maxDepth]
      : 0
  return { positions, edges, width, height }
}
