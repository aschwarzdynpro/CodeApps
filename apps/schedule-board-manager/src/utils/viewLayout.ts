import { scanTags } from './queryAnalysis'

/**
 * Columns of a system or personal view, read from its `layoutxml` (what the
 * grid, tooltip or details pane shows, in order) and `fetchxml` (which table
 * a link-entity alias such as `a_1c2d.msdyn_name` stands for).
 */

export interface ViewColumn {
  /** Cell name as in the layout, e.g. `name` or `a_1c2d.msdyn_name`. */
  name: string
  entity: string
  attribute: string
  width: number | null
}

export function viewColumns(layoutXml: string | null, fetchXml: string | null, rootEntity: string): ViewColumn[] {
  const aliases = new Map<string, string>()
  for (const tag of scanTags(fetchXml)) {
    if (!tag.closing && tag.name === 'link-entity' && tag.attrs.alias && tag.attrs.name) {
      aliases.set(tag.attrs.alias.toLowerCase(), tag.attrs.name)
    }
  }
  const out: ViewColumn[] = []
  for (const tag of scanTags(layoutXml)) {
    if (tag.closing || tag.name !== 'cell' || !tag.attrs.name) continue
    if (tag.attrs.ishidden === '1' || tag.attrs.ishidden === 'true') continue
    const name = tag.attrs.name
    const dot = name.indexOf('.')
    const width = Number(tag.attrs.width)
    out.push({
      name,
      entity: dot < 0 ? rootEntity : (aliases.get(name.slice(0, dot).toLowerCase()) ?? name.slice(0, dot)),
      attribute: dot < 0 ? name : name.slice(dot + 1),
      width: Number.isFinite(width) && width > 0 ? width : null,
    })
  }
  return out
}
