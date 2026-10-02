import { useCallback, useState } from 'react'
import type { BoardService } from '../../services/boardService'
import { useLoad } from '../../hooks/useLoad'
import { emptyLine, serializeTile, type Segment, type TileLine, type TileModel } from '../../utils/tileModel'
import type { Insert } from './insert'

/** UI state of the line editor: active row, and a freshly added empty last row. */
export function useTileState() {
  const [active, setActive] = useState(0)
  const [pending, setPending] = useState(false)
  return { active, setActive, pending, setPending }
}

/**
 * Operations on the template's lines. The model comes from the template text
 * on every render; only a new, still empty last row lives in the state — in
 * HTML it would be indistinguishable from a trailing `<br>` and vanish.
 */
export function tileOps(state: ReturnType<typeof useTileState>, model: TileModel, write: (html: string) => void) {
  const { active, setActive, pending, setPending } = state
  const lines = pending ? [...model.lines, emptyLine()] : model.lines

  const commit = (next: TileLine[]) => {
    const trailingEmpty = next.length > 0 && next[next.length - 1].segments.length === 0
    setPending(trailingEmpty)
    write(serializeTile({ ...model, lines: trailingEmpty ? next.slice(0, -1) : next }))
  }

  /** Palette click: `{path}` becomes a field, anything else text — appended to the active row. */
  const insert: Insert = (text) => {
    const m = /^\{(.+)\}$/.exec(text)
    const segment: Segment = m ? { kind: 'field', path: m[1], bold: false } : { kind: 'text', text, bold: false }
    const base = lines.length ? lines : [emptyLine()]
    const at = Math.min(active, base.length - 1)
    // Two fields in a row would run together in the tile — separate them.
    const append = (segs: Segment[]): Segment[] =>
      segment.kind === 'field' && segs.at(-1)?.kind === 'field' ? [...segs, { kind: 'text', text: ' ', bold: false }, segment] : [...segs, segment]
    commit(base.map((l, i) => (i === at ? { segments: append(l.segments) } : l)))
  }

  return { lines, active, setActive, setPending, commit, insert }
}

/** Display names along a placeholder path ("Projekt › Kunde › Name"); null if metadata can't resolve it. */
async function resolveLabel(svc: BoardService, base: string, path: string): Promise<string | null> {
  const parts = path.split('.')
  let entity = base
  const out: string[] = []
  for (const [i, part] of parts.entries()) {
    const info = await svc.getTableInfo(entity).catch(() => null)
    if (!info) return null
    if (i < parts.length - 1) {
      const rel = info.relationships?.find((r) => r.schemaName.toLowerCase() === part.toLowerCase())
      if (!rel) return null
      out.push(info.columns.find((c) => c.logicalName === rel.attribute)?.displayName ?? rel.attribute)
      entity = rel.target
    } else {
      const col = info.columns.find((c) => c.logicalName === part)
      if (!col) return null
      out.push(col.displayName)
    }
  }
  return out.join(' › ')
}

/** Readable labels for the placeholders of a template, from the environment's metadata. */
export function useFieldLabels(base: string, paths: string[]): Map<string, string> {
  const unique = [...new Set(paths)].sort()
  const key = unique.length ? `labels:${base}:${unique.join('|')}` : null
  const load = useCallback(
    async (svc: BoardService) => {
      const map = new Map<string, string>()
      for (const p of unique) {
        const label = await resolveLabel(svc, base, p)
        if (label) map.set(p, label)
      }
      return map
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers base and paths
    [key],
  )
  return useLoad(key, load).data ?? new Map()
}
