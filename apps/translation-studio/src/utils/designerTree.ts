import type { ComponentInfo, LabelRow, TranslationFile } from '../types/translation'
import { kindOf } from './gaps'
import { isTableName } from './languages'

/**
 * What the designer's explorer lists, built from the translation file plus
 * the metadata lookup: apps, tables with their forms and views, dashboards.
 * Forms and views are only listed once the lookup has told them apart (both
 * are `name` rows in the file).
 */

export interface ExplorerItem {
  id: string
  /** Name in the base language. */
  name: string
  table: string
  /** `systemform.type` for forms. */
  type?: number
}

export interface ExplorerTable {
  table: string
  /** Display name in the base language (falls back to the logical name). */
  label: string
  /** Every label row of the table (names, columns, choices, form texts …). */
  rows: LabelRow[]
  forms: ExplorerItem[]
  views: ExplorerItem[]
}

export interface ExplorerTree {
  apps: ExplorerItem[]
  /** Sitemap ids from the file (`SiteMap` rows). */
  sitemaps: string[]
  tables: ExplorerTable[]
  dashboards: ExplorerItem[]
  /** Rows the designer has no canvas for (ribbon, messages, solution …). */
  other: LabelRow[]
  /** Rows of kind "other" — exactly what the table view shows for that kind. */
  otherCount: number
}

/** Key of a table's own entry in the components map (display name from the metadata). */
export const tableKey = (logicalName: string) => `table:${logicalName}`

const FORM_ORDER = [2, 7, 6, 11, 5]
const rank = (t: number | undefined) => (t !== undefined && FORM_ORDER.includes(t) ? FORM_ORDER.indexOf(t) : FORM_ORDER.length)

/**
 * @param resolved The metadata lookup has finished: only entries it found to
 * be forms are listed as dashboards from then on (before, every named
 * non-table entry is listed provisionally).
 */
export function buildExplorer(file: TranslationFile, components: ReadonlyMap<string, ComponentInfo>, resolved = true): ExplorerTree {
  const base = file.baseLanguage
  const tables = new Map<string, ExplorerTable>()
  const table = (name: string) => {
    let t = tables.get(name)
    if (!t) {
      t = { table: name, label: components.get(tableKey(name))?.name || name, rows: [], forms: [], views: [] }
      tables.set(name, t)
    }
    return t
  }
  const apps: ExplorerItem[] = []
  const sitemaps: string[] = []
  const dashboards: ExplorerItem[] = []
  const other: LabelRow[] = []
  const listed = new Set<string>()
  let otherCount = 0

  for (const r of file.rows) {
    if (!r.objectId) {
      other.push(r)
      continue
    }
    const info = components.get(r.objectId)
    const kind = kindOf(r, components)
    if (kind === 'other') otherCount++
    const name = r.values[base] || info?.name || r.objectId
    if (r.type === 'AppModule') {
      if (r.column === 'name' && !listed.has(r.objectId)) {
        listed.add(r.objectId)
        apps.push({ id: r.objectId, name, table: '' })
      }
      continue
    }
    if (r.type === 'SiteMap') {
      if (!sitemaps.includes(r.objectId)) sitemaps.push(r.objectId)
      continue
    }
    if (!isTableName(r.type)) {
      // Dashboards are listed under their display name instead of a table.
      if (kind === 'form' && (!resolved || info?.kind === 'form')) {
        if (r.column === 'name' && !listed.has(r.objectId)) {
          listed.add(r.objectId)
          dashboards.push({ id: r.objectId, name, table: '', type: 0 })
        }
      } else other.push(r)
      continue
    }
    const t = table(r.type)
    t.rows.push(r)
    if (r.column === 'LocalizedName' && r.kind === 'table' && r.values[base]) t.label = r.values[base]
    if (r.column !== 'name' || listed.has(r.objectId) || !info?.kind) continue
    if (info.kind === 'form') {
      listed.add(r.objectId)
      const item = { id: r.objectId, name, table: info.table || r.type, type: info.formType }
      if (info.formType === 0) dashboards.push(item)
      else t.forms.push(item)
    } else if (info.kind === 'view') {
      listed.add(r.objectId)
      t.views.push({ id: r.objectId, name, table: info.table || r.type })
    }
  }

  const byName = (a: ExplorerItem, b: ExplorerItem) => a.name.localeCompare(b.name)
  for (const t of tables.values()) {
    t.forms.sort((a, b) => rank(a.type) - rank(b.type) || byName(a, b))
    t.views.sort(byName)
  }
  return {
    apps: apps.sort(byName),
    sitemaps,
    tables: [...tables.values()].sort((a, b) => a.label.localeCompare(b.label)),
    dashboards: dashboards.sort(byName),
    other,
    otherCount: otherCount + file.rows.filter((r) => !r.objectId && r.kind === 'other').length,
  }
}

/**
 * Rows the table canvas shows: names, columns, choice values, other table
 * labels, and — once the lookup is done — form/view names it couldn't place.
 * Form element labels and form/view names live on their own canvases.
 */
export function tableCanvasRows(rows: readonly LabelRow[], components: ReadonlyMap<string, ComponentInfo>, resolving: boolean): LabelRow[] {
  return rows.filter((r) => {
    const kind = kindOf(r, components)
    if (kind === 'table' || kind === 'column' || kind === 'choice' || kind === 'other') return true
    return !resolving && (r.column === 'name' || r.column === 'description') && !components.get(r.objectId)?.kind
  })
}
