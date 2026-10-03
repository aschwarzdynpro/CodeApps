import { createContext, useContext, useSyncExternalStore } from 'react'
import type { CellState, ComponentInfo, LabelRow, Lcid, TranslationFile } from '../../types/translation'
import type { GapRow, StateCounts } from '../../utils/gaps'
import type { Suggestion } from '../../utils/glossary'
import type { LabelIndex } from '../../utils/labelIndex'

/** Texts per language from a source outside the file (formxml, sitemap) — shown read only. */
export type Texts = Record<Lcid, string>

/**
 * A label as the designer shows it: the file row when there is one, else a
 * read-only text. `row` is the row of the loaded file (structure: key, ids,
 * base text); its current text and state come from the live data.
 */
export interface LabelRef {
  row: LabelRow | null
  fallback: Texts
  /** The text is the column's display name (a field without own form label): editing it renames the column everywhere. */
  fromColumn?: boolean
  /** What the label is (Registerkarte, Abschnitt, Feld, Spaltenkopf, Tabellenname …). */
  role: string
  /** Where it sits, for the inspector („Information › Allgemein › Übersicht“). */
  context: string
  /** Identity of a read-only label (element id, sitemap node id), so two of them never share a selection. */
  id?: string
}

/**
 * What the canvases build on: the loaded file's structure, view settings and
 * stable actions. Changes only when a setting changes — never on an edit, so
 * the canvases don't re-render while the user types and tabs.
 */
export interface DesignerApi {
  /** The loaded file without edits: positions, ids, base texts. */
  origin: TranslationFile
  index: LabelIndex
  /** Row key → position (the same in every edited version). */
  pos: ReadonlyMap<string, number>
  components: ReadonlyMap<string, ComponentInfo>
  /** The language the canvas shows and edits. */
  lcid: Lcid
  targets: Lcid[]
  baseLanguage: Lcid
  readOnly: boolean
  showBase: boolean
  /** Dim everything that is already translated. */
  focusGaps: boolean
  /** Component names are still being resolved. */
  resolving: boolean
  select: (ref: LabelRef) => void
  onEdit: (rowKey: string, lcid: Lcid, value: string) => void
  onRevert: (rowKey: string, lcid: Lcid) => void
  onAccept: (row: LabelRow, lcid: Lcid, value: string, all: boolean) => void
  onAcknowledge: (rowKey: string, lcid: Lcid, on: boolean) => void
  onRefused: (message: string) => void
}

export const DesignerContext = createContext<DesignerApi | null>(null)

export function useDesigner(): DesignerApi {
  const api = useContext(DesignerContext)
  if (!api) throw new Error('useDesigner outside of <Designer>')
  return api
}

/** What changes with every edit and click. Positions as in {@link DesignerApi.origin}. */
export interface Live {
  /** States per row (and the current row object). */
  gaps: readonly GapRow[]
  counts: Record<Lcid, StateCounts>
  acknowledged: ReadonlySet<string>
  suggestions: ReadonlyMap<string, Suggestion>
  sameBase: ReadonlyMap<string, number>
  /** Key of the selected label (row key, or `ro:` + context for read-only labels). */
  selectedKey: string | null
}

/**
 * The live data as an external store: components subscribe to the slice
 * they show (one label's text and state, a canvas's counts) and re-render
 * only when that slice changes.
 */
export class LiveStore {
  private live: Live
  private readonly listeners = new Set<() => void>()

  constructor(live: Live) {
    this.live = live
  }

  get = (): Live => this.live

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  set(live: Live): void {
    if (live === this.live) return
    this.live = live
    for (const listener of this.listeners) listener()
  }
}

export const LiveContext = createContext<LiveStore | null>(null)

export function useLiveStore(): LiveStore {
  const store = useContext(LiveContext)
  if (!store) throw new Error('useLiveStore outside of <Designer>')
  return store
}

/** A primitive slice of the live data; the component re-renders when it changes. */
export function useLiveValue<T extends string | number | boolean | null>(select: (live: Live) => T): T {
  const store = useLiveStore()
  return useSyncExternalStore(store.subscribe, () => select(store.get()))
}

/** All of the live data (for small components that show a lot of it: inspector, explorer, home). */
export function useLiveState(): Live {
  const store = useLiveStore()
  return useSyncExternalStore(store.subscribe, store.get)
}

/** Current version of a structure row. */
export function liveRow(live: Live, pos: ReadonlyMap<string, number>, row: LabelRow): LabelRow {
  const i = pos.get(row.key)
  return i === undefined ? row : live.gaps[i].row
}

/** Current state of a structure row in a language; undefined when the row has no column for it. */
export function liveState(live: Live, pos: ReadonlyMap<string, number>, row: LabelRow, lcid: Lcid): CellState | undefined {
  const i = pos.get(row.key)
  return i === undefined ? undefined : live.gaps[i].states[lcid]
}

export const refKey = (ref: LabelRef): string => (ref.row ? ref.row.key : `ro:${ref.id ?? ''}|${ref.context}|${ref.role}`)

/** What the canvas shows. */
export type DesignerTarget =
  | { kind: 'home' }
  | { kind: 'table'; table: string }
  | { kind: 'form'; table: string; id: string }
  | { kind: 'view'; table: string; id: string }
  | { kind: 'app'; id: string; sitemapOnly?: boolean }
  | { kind: 'dashboard'; id: string }

export const targetKey = (t: DesignerTarget): string => ('id' in t ? `${t.kind}:${t.id}` : 'table' in t ? `${t.kind}:${t.table}` : t.kind)
