import type { ComponentInfo, LabelRow, Lcid, TranslationFile } from '../types/translation'
import type { GapRow, StateCounts } from './gaps'
import { isTableName } from './languages'

/**
 * Lookups the designer needs on every render: label rows by object id and
 * column, column ids by table and logical name, rows per table. Built once
 * from the loaded file — the structure edits never change; current texts
 * and states come by row position from the live data.
 */
export interface LabelIndex {
  /** `${objectId}|${column}` → "Localized Labels" row (the first, should the export repeat one). */
  byId: Map<string, LabelRow>
  /** `${table}|${logicalName}` → attribute MetadataId (from the metadata lookup). */
  columns: Map<string, string>
  /** Rows per table (logical name from `Entity name`). */
  byTable: Map<string, LabelRow[]>
  /** Name rows per table. */
  tableNames: Map<string, TableNames>
}

export interface TableNames {
  one?: LabelRow
  many?: LabelRow
  description?: LabelRow
}

export const labelKey = (objectId: string, column: string) => `${objectId}|${column}`

export function buildIndex(file: TranslationFile, components: ReadonlyMap<string, ComponentInfo>): LabelIndex {
  const byId = new Map<string, LabelRow>()
  const byTable = new Map<string, LabelRow[]>()
  const tableNames = new Map<string, TableNames>()
  for (const r of file.rows) {
    if (!r.objectId) continue
    const k = labelKey(r.objectId, r.column)
    if (!byId.has(k)) byId.set(k, r)
    if (isTableName(r.type)) {
      const list = byTable.get(r.type)
      if (list) list.push(r)
      else byTable.set(r.type, [r])
      if (r.column === 'LocalizedName' || r.column === 'LocalizedCollectionName') {
        const names = tableNames.get(r.type) ?? {}
        if (r.column === 'LocalizedName') names.one ??= r
        else names.many ??= r
        tableNames.set(r.type, names)
      }
    }
  }
  // The table description shares the object id of its LocalizedName row.
  for (const names of tableNames.values()) if (names.one) names.description = byId.get(labelKey(names.one.objectId, 'Description'))
  const columns = new Map<string, string>()
  for (const [id, c] of components) if (c.kind === 'column' && c.table && c.name) columns.set(`${c.table}|${c.name}`, id)
  return { byId, columns, byTable, tableNames }
}

/**
 * States of `rows` (structure rows, any version) in the live data: each row
 * once, rows without a column for the language not counted.
 */
export function countLive(gaps: readonly GapRow[], pos: ReadonlyMap<string, number>, rows: Iterable<LabelRow | null | undefined>, lcid: Lcid): StateCounts {
  const out: StateCounts = { missing: 0, untranslated: 0, changed: 0, ok: 0 }
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r || seen.has(r.key)) continue
    seen.add(r.key)
    const i = pos.get(r.key)
    const s = i === undefined ? undefined : gaps[i].states[lcid]
    if (s) out[s]++
  }
  return out
}

/** Row of a column's display name, if the file has it. */
export function columnRow(index: LabelIndex, table: string, attribute: string, column: 'DisplayName' | 'Description' = 'DisplayName'): LabelRow | undefined {
  const id = index.columns.get(`${table}|${attribute}`)
  return id ? index.byId.get(labelKey(id, column)) : undefined
}

/** Open work: missing plus probably untranslated. */
export const gapsOf = (c: StateCounts) => c.missing + c.untranslated

/** Share translated (ok + changed) in percent; 100 for nothing to translate. */
export function coverageOf(c: StateCounts): number {
  const total = c.missing + c.untranslated + c.changed + c.ok
  return total === 0 ? 100 : ((c.ok + c.changed) / total) * 100
}
