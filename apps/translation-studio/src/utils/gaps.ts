import { cellId, type CellState, type ComponentInfo, type ComponentKind, type LabelRow, type Lcid, type TranslationFile } from '../types/translation'

/** One matrix row: a label plus the state of each target language. */
export interface GapRow {
  row: LabelRow
  states: Record<Lcid, CellState>
}

export type StateCounts = Record<CellState, number>

const emptyCounts = (): StateCounts => ({ missing: 0, untranslated: 0, changed: 0, ok: 0 })

/**
 * "Probably not translated": the text equals the base text and contains a
 * letter (numbers and codes are the same in every language). Only a marker —
 * "Status" is correct German, so the user can acknowledge it.
 */
export function looksUntranslated(base: string, text: string): boolean {
  return text.trim() === base.trim() && /\p{L}/u.test(base)
}

export function cellState(row: LabelRow, lcid: Lcid, baseLanguage: Lcid, acknowledged: ReadonlySet<string>): CellState {
  const value = row.values[lcid] ?? ''
  if (value !== (row.original[lcid] ?? '')) return 'changed'
  const base = row.values[baseLanguage] ?? ''
  if (value.trim() === '') return base.trim() === '' ? 'ok' : 'missing'
  if (looksUntranslated(base, value) && !acknowledged.has(cellId(row.key, lcid))) return 'untranslated'
  return 'ok'
}

/**
 * State of every target-language cell. Rows without base text are kept (a
 * translation without source is not a gap, but stays editable).
 */
export function findGaps(file: TranslationFile, options: { languages?: Lcid[]; acknowledged?: ReadonlySet<string> } = {}): GapRow[] {
  const ack = options.acknowledged ?? new Set<string>()
  const languages = (options.languages ?? file.languages).filter((l) => l !== file.baseLanguage)
  return file.rows.map((row) => {
    const states: Record<Lcid, CellState> = {}
    for (const lcid of languages) if (lcid in row.original) states[lcid] = cellState(row, lcid, file.baseLanguage, ack)
    return { row, states }
  })
}

/** Counts per language for the KPI bar. */
export function countStates(rows: GapRow[], languages: Lcid[]): Record<Lcid, StateCounts> {
  const out: Record<Lcid, StateCounts> = {}
  for (const l of languages) out[l] = emptyCounts()
  for (const r of rows) {
    for (const l of languages) {
      const s = r.states[l]
      if (s) out[l][s]++
    }
  }
  return out
}

export type StateFilter = 'all' | 'gaps' | CellState

export interface MatrixFilter {
  state: StateFilter
  /** null = every kind. */
  kinds: ReadonlySet<ComponentKind> | null
  /** Logical table name; '' = all. */
  table: string
  text: string
  /** Languages the state filter looks at. */
  languages: Lcid[]
}

export const NO_TABLE = '\u0000'

/** Table a label belongs to ('' when unknown). */
export function tableOf(row: LabelRow, components: ReadonlyMap<string, ComponentInfo>): string {
  return components.get(row.objectId)?.table ?? ''
}

export function filterRows(rows: GapRow[], f: MatrixFilter, components: ReadonlyMap<string, ComponentInfo> = new Map()): GapRow[] {
  const words = f.text.toLowerCase().split(/\s+/).filter(Boolean)
  // "gaps" keeps edited cells, so a row doesn't vanish the moment it is filled.
  const wanted = (s: CellState | undefined) =>
    s !== undefined && (f.state === 'all' || (f.state === 'gaps' ? s !== 'ok' : s === f.state))
  return rows.filter((r) => {
    if (f.kinds && !f.kinds.has(r.row.kind)) return false
    if (f.table) {
      const t = tableOf(r.row, components)
      if (f.table === NO_TABLE ? t !== '' : t !== f.table) return false
    }
    if (f.state !== 'all' && !f.languages.some((l) => wanted(r.states[l]))) return false
    if (words.length > 0) {
      const c = components.get(r.row.objectId)
      const hay = [...r.row.keys, ...Object.values(r.row.values), c?.table ?? '', c?.name ?? ''].join(' ').toLowerCase()
      if (!words.every((w) => hay.includes(w))) return false
    }
    return true
  })
}
