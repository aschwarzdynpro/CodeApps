/**
 * Columns of a view from `savedquery.layoutxml`, resolved against its
 * `fetchxml`: a cell `a_1234.emailaddress1` belongs to the link-entity with
 * that alias. The header text of a column is the column's display name, so
 * the designer edits the column label (`DisplayName`) — it applies wherever
 * the column is shown.
 */

export interface ViewColumn {
  /** Cell name as in the layout (`name`, `a_1234.emailaddress1`). */
  name: string
  attribute: string
  /** Logical name of the table the column belongs to. */
  table: string
  /** Link alias ('' for a column of the view's own table). */
  alias: string
  /** Width in pixels as configured. */
  width: number
}

export interface ViewLayout {
  table: string
  columns: ViewColumn[]
}

const parse = (xml: string): Document | null => {
  if (!xml.trim()) return null
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  return doc.getElementsByTagName('parsererror').length > 0 ? null : doc
}

export function parseView(layoutxml: string, fetchxml: string, fallbackTable = ''): ViewLayout {
  const fetch = parse(fetchxml)
  const entity = fetch?.getElementsByTagName('entity')[0]
  const table = entity?.getAttribute('name') ?? fallbackTable
  const aliases = new Map<string, string>()
  for (const link of Array.from(fetch?.getElementsByTagName('link-entity') ?? [])) {
    const alias = link.getAttribute('alias')
    const name = link.getAttribute('name')
    if (alias && name) aliases.set(alias, name)
  }
  const layout = parse(layoutxml)
  if (!layout) throw new Error('Die Spaltendefinition der Ansicht (layoutxml) ist kein gültiges XML.')
  const columns: ViewColumn[] = []
  for (const cell of Array.from(layout.getElementsByTagName('cell'))) {
    const name = cell.getAttribute('name') ?? ''
    if (!name) continue
    const dot = name.indexOf('.')
    const alias = dot > 0 ? name.slice(0, dot) : ''
    columns.push({
      name,
      attribute: dot > 0 ? name.slice(dot + 1) : name,
      table: alias ? (aliases.get(alias) ?? '') : table,
      alias,
      width: Math.max(60, Number(cell.getAttribute('width')) || 100),
    })
  }
  return { table, columns }
}
