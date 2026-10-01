/**
 * Line diff for template text (resource cell templates are a few dozen
 * lines). Longest common subsequence; very large inputs fall back to
 * "everything replaced" instead of allocating a huge table.
 */

export interface DiffLine {
  op: 'same' | 'add' | 'del'
  text: string
}

const MAX_CELLS = 4_000_000

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.replace(/\r\n/g, '\n').split('\n')
  const b = after.replace(/\r\n/g, '\n').split('\n')
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((text) => ({ op: 'del' as const, text })), ...b.map((text) => ({ op: 'add' as const, text }))]
  }
  // lcs[i][j] = length of the LCS of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: 'del', text: a[i++] })
    } else {
      out.push({ op: 'add', text: b[j++] })
    }
  }
  while (i < a.length) out.push({ op: 'del', text: a[i++] })
  while (j < b.length) out.push({ op: 'add', text: b[j++] })
  return out
}

export type DiffRow = DiffLine | { op: 'skip'; count: number }

/** Keeps `context` unchanged lines around each change and folds the rest. */
export function foldUnchanged(lines: DiffLine[], context = 2): DiffRow[] {
  const keep = lines.map(() => false)
  lines.forEach((l, idx) => {
    if (l.op === 'same') return
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep[k] = true
  })
  const out: DiffRow[] = []
  let skipped = 0
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      if (skipped) out.push({ op: 'skip', count: skipped })
      skipped = 0
      out.push(l)
    } else skipped++
  })
  if (skipped) out.push({ op: 'skip', count: skipped })
  return out
}
