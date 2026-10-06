import { SearchBox, Switch } from '@fluentui/react-components'
import { useMemo } from 'react'
import type { Resource } from '../../types/calendar'
import { S } from '../../strings'
import { MultiSelect } from '../ui'
import { facetOptions, type ResourceFilter } from '../../utils/resourceFilter'

export function ResourceFilters({ resources, filter, onChange }: { resources: Resource[]; filter: ResourceFilter; onChange: (f: ResourceFilter) => void }) {
  // Facets only change with the resources, not with every keystroke in the search box.
  const { units, categories, territories } = useMemo(
    () => ({
      units: facetOptions(resources.flatMap((r) => (r.orgUnit ? [r.orgUnit] : []))),
      categories: facetOptions(resources.flatMap((r) => r.categories)),
      territories: facetOptions(resources.flatMap((r) => r.territories)),
    }),
    [resources],
  )
  return (
    <div className="filters">
      <SearchBox size="small" className="filters__search" placeholder={S.resources.search} aria-label={S.resources.search} value={filter.text} onChange={(_, d) => onChange({ ...filter, text: d.value })} />
      {units.length ? <MultiSelect small className="filters__facet" placeholder={S.resources.unit} options={units} values={filter.units} onChange={(units) => onChange({ ...filter, units })} /> : null}
      {categories.length ? <MultiSelect small className="filters__facet" placeholder={S.resources.category} options={categories} values={filter.categories} onChange={(categories) => onChange({ ...filter, categories })} /> : null}
      {territories.length ? <MultiSelect small className="filters__facet" placeholder={S.resources.territory} options={territories} values={filter.territories} onChange={(territories) => onChange({ ...filter, territories })} /> : null}
      <Switch label={S.resources.showInactive} checked={filter.showInactive} onChange={(_, d) => onChange({ ...filter, showInactive: d.checked })} />
      <Switch label={S.resources.onlyFindings} checked={filter.onlyFindings} onChange={(_, d) => onChange({ ...filter, onlyFindings: d.checked })} />
    </div>
  )
}
