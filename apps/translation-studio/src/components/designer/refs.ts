import type { LabelRow, Lcid } from '../../types/translation'
import type { FormCell, FormLayout } from '../../utils/formXml'
import { columnRow, labelKey, type LabelIndex } from '../../utils/labelIndex'
import type { ViewLayout } from '../../utils/viewXml'
import type { SiteMapArea } from '../../utils/sitemapXml'
import { S } from '../../strings'
import type { LabelRef, Texts } from './context'

/**
 * Label references of the designer canvases: which file row (if any) backs
 * each visible text. Shared by the canvases (rendering) and the designer
 * (counts for the explorer and the canvas header).
 */

/** Label of a form element: own `displayname` row, else (fields) the column's display name. */
export function elementRef(index: LabelIndex, table: string, id: string, labels: Texts, field: string, role: string, context: string): LabelRef {
  const own = id ? index.byId.get(labelKey(id, 'displayname')) : undefined
  if (own) return { row: own, fallback: labels, role, context }
  const column = field && table ? columnRow(index, table, field) : undefined
  return { row: column ?? null, fallback: labels, fromColumn: column !== undefined, role, context, id }
}

export const cellRole = (c: FormCell) => (c.control === 'field' ? S.designer.roles.field : S.designer.roles.control)

/** Every label of a form (name, header, tabs, sections, cells) in reading order. */
export function formRefs(index: LabelIndex, formId: string, table: string, formName: string, layout: FormLayout, base: Lcid): LabelRef[] {
  const out: LabelRef[] = []
  const name = index.byId.get(labelKey(formId, 'name'))
  out.push({ row: name ?? null, fallback: {}, role: S.designer.roles.formName, context: formName })
  const description = index.byId.get(labelKey(formId, 'description'))
  if (description) out.push({ row: description, fallback: {}, role: S.designer.roles.formDescription, context: formName })
  for (const c of layout.header) out.push(elementRef(index, table, c.id, c.labels, c.field, cellRole(c), `${formName} › ${S.designer.header}`))
  for (const t of layout.tabs) {
    out.push(...tabRefs(index, table, formName, t, base))
  }
  for (const c of layout.footer) out.push(elementRef(index, table, c.id, c.labels, c.field, cellRole(c), `${formName} › ${S.designer.footer}`))
  return out
}

export function tabRefs(index: LabelIndex, table: string, formName: string, tab: FormLayout['tabs'][number], base: Lcid): LabelRef[] {
  const tabText = tab.labels[base] || tab.name
  const out: LabelRef[] = [elementRef(index, table, tab.id, tab.labels, '', S.designer.roles.tab, formName)]
  for (const col of tab.columns)
    for (const s of col.sections) {
      out.push(elementRef(index, table, s.id, s.labels, '', S.designer.roles.section, `${formName} › ${tabText}`))
      for (const c of s.rows.flat()) out.push(elementRef(index, table, c.id, c.labels, c.field, cellRole(c), `${formName} › ${tabText} › ${s.labels[base] || s.name}`))
    }
  return out
}

/** View name and column headers. */
export function viewRefs(index: LabelIndex, viewId: string, viewName: string, layout: ViewLayout): LabelRef[] {
  const out: LabelRef[] = []
  out.push({ row: index.byId.get(labelKey(viewId, 'name')) ?? null, fallback: {}, role: S.designer.roles.viewName, context: viewName })
  const desc = index.byId.get(labelKey(viewId, 'description'))
  if (desc) out.push({ row: desc, fallback: {}, role: S.designer.roles.viewDescription, context: viewName })
  for (const c of layout.columns) out.push(columnHeaderRef(index, viewName, c.table, c.attribute))
  return out
}

export function columnHeaderRef(index: LabelIndex, viewName: string, table: string, attribute: string): LabelRef {
  const row = columnRow(index, table, attribute)
  return { row: row ?? null, fallback: {}, fromColumn: row !== undefined, role: S.designer.roles.columnHeader, context: `${viewName} › ${table}.${attribute}`, id: `${table}.${attribute}` }
}

/** A table-level name row (`LocalizedName`, `LocalizedCollectionName`, `Description`). */
export function tableNameRow(index: LabelIndex, table: string, column: 'LocalizedName' | 'LocalizedCollectionName' | 'Description'): LabelRow | undefined {
  const rows = index.byTable.get(table)
  if (!rows) return undefined
  const nameRow = rows.find((r) => r.column === 'LocalizedName')
  if (column === 'Description') return nameRow ? index.byId.get(labelKey(nameRow.objectId, 'Description')) : undefined
  return rows.find((r) => r.column === column)
}

export const rowsOf = (refs: LabelRef[]): (LabelRow | null)[] => refs.map((r) => r.row)

/** File rows an app canvas edits: app name and description, sitemap name, plural names of the tables its subareas open. */
export function appRows(index: LabelIndex, appId: string, sitemapId: string, areas: SiteMapArea[]): (LabelRow | null)[] {
  const rows: (LabelRow | null)[] = [index.byId.get(labelKey(appId, 'name')) ?? null, index.byId.get(labelKey(appId, 'description')) ?? null]
  if (sitemapId) rows.push(index.byId.get(labelKey(sitemapId, 'sitemapname')) ?? null)
  for (const a of areas)
    for (const g of a.groups)
      for (const s of g.subareas) if (s.entity && Object.keys(s.titles).length === 0 && !s.title) rows.push(tableNameRow(index, s.entity, 'LocalizedCollectionName') ?? null)
  return rows
}
