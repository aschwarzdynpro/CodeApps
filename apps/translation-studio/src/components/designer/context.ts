import { createContext, useContext } from 'react'
import type { ComponentInfo, LabelRow, Lcid, TranslationFile } from '../../types/translation'
import type { Suggestion } from '../../utils/glossary'
import type { LabelIndex } from '../../utils/labelIndex'

/** Texts per language from a source outside the file (formxml, sitemap) — shown read only. */
export type Texts = Record<Lcid, string>

/** A label as the designer shows it: the file row when there is one, else a read-only text. */
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

export interface DesignerApi {
  file: TranslationFile
  index: LabelIndex
  components: ReadonlyMap<string, ComponentInfo>
  /** The language the canvas shows and edits. */
  lcid: Lcid
  targets: Lcid[]
  baseLanguage: Lcid
  acknowledged: ReadonlySet<string>
  readOnly: boolean
  showBase: boolean
  /** Dim everything that is already translated. */
  focusGaps: boolean
  /** Component names are still being resolved. */
  resolving: boolean
  suggestions: ReadonlyMap<string, Suggestion>
  sameBase: ReadonlyMap<string, number>
  /** Key of the selected label (row key, or `ro:` + context for read-only labels). */
  selectedKey: string | null
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
