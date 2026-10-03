import type { Lcid } from '../types/translation'

/**
 * Navigation of a model-driven app from `sitemap.sitemapxml`: areas →
 * groups → subareas. Titles live in the sitemap itself (`<Titles><Title
 * LCID="…" Title="…"/>`), not in the translation export; a subarea without
 * own title shows the plural name of its table, which the export does carry.
 */

export interface SiteMapNode {
  id: string
  /** Titles per language from `<Titles>`. */
  titles: Record<Lcid, string>
  /** Legacy `Title` attribute, if any. */
  title: string
}

export interface SiteMapSubArea extends SiteMapNode {
  /** Table the subarea opens ('' for URLs, dashboards …). */
  entity: string
  url: string
}

export interface SiteMapGroup extends SiteMapNode {
  subareas: SiteMapSubArea[]
}

export interface SiteMapArea extends SiteMapNode {
  groups: SiteMapGroup[]
}

const children = (el: Element, name: string): Element[] => Array.from(el.children).filter((c) => c.localName.toLowerCase() === name.toLowerCase())

function node(el: Element): SiteMapNode {
  const titles: Record<Lcid, string> = {}
  const list = children(el, 'Titles')[0]
  for (const t of list ? children(list, 'Title') : []) {
    const lcid = Number(t.getAttribute('LCID'))
    if (lcid > 0) titles[lcid] = t.getAttribute('Title') ?? ''
  }
  return { id: el.getAttribute('Id') ?? '', titles, title: el.getAttribute('Title') ?? '' }
}

export function parseSitemap(xml: string): SiteMapArea[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Die Sitemap (sitemapxml) ist kein gültiges XML.')
  return children(doc.documentElement, 'Area').map((a) => ({
    ...node(a),
    groups: children(a, 'Group').map((g) => ({
      ...node(g),
      subareas: children(g, 'SubArea').map((s) => ({ ...node(s), entity: s.getAttribute('Entity') ?? '', url: s.getAttribute('Url') ?? '' })),
    })),
  }))
}

/** Text of a sitemap node in a language: own title, else legacy attribute, else ''. */
export function siteMapTitle(n: SiteMapNode, lcid: Lcid, baseLanguage: Lcid): { text: string; own: boolean } {
  if (n.titles[lcid]) return { text: n.titles[lcid], own: true }
  return { text: n.titles[baseLanguage] || n.title || '', own: false }
}
