import type { Finding, Resource } from '../types/calendar'

export interface ResourceFilter {
  text: string
  units: string[]
  categories: string[]
  territories: string[]
  showInactive: boolean
  onlyFindings: boolean
}

export const EMPTY_FILTER: ResourceFilter = { text: '', units: [], categories: [], territories: [], showInactive: false, onlyFindings: false }

/** Resources matching the facets; every word of the text must occur in name, unit, category or territory. */
export function filterResources(resources: Resource[], f: ResourceFilter, findings: Record<string, Finding[]>): Resource[] {
  const words = f.text.toLowerCase().split(/\s+/).filter(Boolean)
  return resources.filter((r) => {
    if (!f.showInactive && !r.active) return false
    if (f.onlyFindings && !findings[r.id]?.length) return false
    if (f.units.length && !(r.orgUnit && f.units.includes(r.orgUnit.id))) return false
    if (f.categories.length && !r.categories.some((c) => f.categories.includes(c.id))) return false
    if (f.territories.length && !r.territories.some((t) => f.territories.includes(t.id))) return false
    if (words.length) {
      const hay = [r.name, r.orgUnit?.name ?? '', ...r.categories.map((c) => c.name), ...r.territories.map((t) => t.name)].join(' ').toLowerCase()
      if (!words.every((w) => hay.includes(w))) return false
    }
    return true
  })
}

/** Distinct facet values, sorted by label. */
export function facetOptions(items: { id: string; name: string }[]): { value: string; label: string }[] {
  const map = new Map<string, string>()
  for (const i of items) map.set(i.id, i.name)
  return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'de'))
}
