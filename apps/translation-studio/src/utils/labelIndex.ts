import type { ComponentInfo, LabelRow, Lcid, TranslationFile } from '../types/translation'
import { cellState, type StateCounts } from './gaps'
import { isTableName } from './languages'

/**
 * Lookups the designer needs on every render: label rows by object id and
 * column, column ids by table and logical name, rows per table. Built once
 * per file version (edits create a new file object).
 */
export interface LabelIndex {
  /** `${objectId}|${column}` → "Localized Labels" row. */
  byId: Map<string, LabelRow>
  /** `${table}|${logicalName}` → attribute MetadataId (from the metadata lookup). */
  columns: Map<string, string>
  /** Rows per table (logical name from `Entity name`). */
  byTable: Map<string, LabelRow[]>
}

export const labelKey = (objectId: string, column: string) => `${objectId}|${column}`

export function buildIndex(file: TranslationFile, components: ReadonlyMap<string, ComponentInfo>): LabelIndex {
  const byId = new Map<string, LabelRow>()
  const byTable = new Map<string, LabelRow[]>()
  for (const r of file.rows) {
    if (!r.objectId) continue
    byId.set(labelKey(r.objectId, r.column), r)
    if (isTableName(r.type)) {
      const list = byTable.get(r.type)
      if (list) list.push(r)
      else byTable.set(r.type, [r])
    }
  }
  const columns = new Map<string, string>()
  for (const [id, c] of components) if (c.kind === 'column' && c.table && c.name) columns.set(`${c.table}|${c.name}`, id)
  return { byId, columns, byTable }
}

/** Row of a column's display name, if the file has it. */
export function columnRow(index: LabelIndex, table: string, attribute: string, column: 'DisplayName' | 'Description' = 'DisplayName'): LabelRow | undefined {
  const id = index.columns.get(`${table}|${attribute}`)
  return id ? index.byId.get(labelKey(id, column)) : undefined
}

export function countRows(rows: Iterable<LabelRow | null | undefined>, lcid: Lcid, baseLanguage: Lcid, acknowledged: ReadonlySet<string>): StateCounts {
  const out: StateCounts = { missing: 0, untranslated: 0, changed: 0, ok: 0 }
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r || seen.has(r.key) || !(lcid in r.original)) continue
    seen.add(r.key)
    out[cellState(r, lcid, baseLanguage, acknowledged)]++
  }
  return out
}

/** Open work: missing plus probably untranslated. */
export const gapsOf = (c: StateCounts) => c.missing + c.untranslated

/** Share translated (ok + changed) in percent; 100 for nothing to translate. */
export function coverageOf(c: StateCounts): number {
  const total = c.missing + c.untranslated + c.changed + c.ok
  return total === 0 ? 100 : ((c.ok + c.changed) / total) * 100
}
